import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { openai } from "@/lib/openai";
import { supabaseServer } from "@/lib/supabase-server";
import { isValidSessionId } from "@/lib/constants";
import { resolveTenantBySlug } from "@/lib/resolve-tenant";
import { buildSystemPrompt } from "@/lib/business-prompt";

const CHAT_MODEL = "claude-sonnet-4-6";
const EMBEDDING_MODEL = "text-embedding-3-small";
const MATCH_COUNT = 3;
// Cosine similarity is roughly 0-1 for related text with this model; below
// this, a match is more likely noise than something worth grounding on.
const SIMILARITY_THRESHOLD = 0.3;

type EntryMedia = { url: string; type: string | null };

type KnowledgeMatch = {
  id: string;
  content: string;
  category: string | null;
  media: EntryMedia[];
  similarity: number;
};

// A fact plus one (media available: ...) note per attached file, appended
// the same way in both the RAG context block and the full category dump,
// so the model sees one consistent format regardless of which path
// surfaced the entry — and regardless of how many files it has.
function withMediaNote(content: string, media: EntryMedia[]) {
  if (!media || media.length === 0) return content;
  const notes = media.map((m) => `(media available: ${m.type ?? "file"}, url: ${m.url})`).join(" ");
  return `${content} ${notes}`;
}

const MEDIA_TAG_PATTERN = /\[\[MEDIA:(\S+?)\]\]/g;

// Strips every [[MEDIA:url]] tag from the reply and returns the cleaned
// text plus the first tag whose URL was actually offered to the model this
// turn (via the knowledge section or RAG matches, keyed in `knownMedia`) —
// never trusts a URL the model might have invented or mangled.
function extractMedia(
  reply: string,
  knownMedia: Map<string, string | null>
): { cleaned: string; media: { url: string; type: string | null } | null } {
  let media: { url: string; type: string | null } | null = null;
  const cleaned = reply
    .replace(MEDIA_TAG_PATTERN, (_match, url) => {
      if (!media && knownMedia.has(url)) {
        media = { url, type: knownMedia.get(url) ?? null };
      }
      return "";
    })
    .trim();
  return { cleaned, media };
}

// Embeds the user's message and looks up the most relevant knowledge_base
// entries for this tenant. Returns null on any failure or when nothing
// clears the similarity bar — callers should just proceed without context.
// Also returns the raw matches' media so the caller can validate a
// [[MEDIA:...]] tag against a real, provided URL.
async function getRelevantContext(
  query: string,
  tenantId: string
): Promise<{ text: string; media: EntryMedia[] } | null> {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    const { data: matches, error } = await supabaseServer.rpc("match_knowledge_base", {
      query_embedding: queryEmbedding,
      match_tenant_id: tenantId,
      match_count: MATCH_COUNT,
    });

    if (error) {
      console.error("Knowledge base retrieval failed:", error);
      return null;
    }

    const relevant = ((matches ?? []) as KnowledgeMatch[]).filter(
      (m) => m.similarity >= SIMILARITY_THRESHOLD
    );

    if (relevant.length === 0) return null;

    return {
      text: `Relevant information about the business:\n${relevant
        .map((m) => withMediaNote(m.content, m.media ?? []))
        .join("\n\n")}`,
      media: relevant.flatMap((m) => m.media ?? []),
    };
  } catch (err) {
    console.error("Failed to generate embedding for retrieval:", err);
    return null;
  }
}

type KnowledgeEntry = {
  category: string;
  content: string;
  media: EntryMedia[];
};

// Every knowledge_base row for this tenant that has a category, with its
// full verbatim content — not just the category name. The checklist in the
// behaviour prompt requires the assistant to use these exact facts rather
// than inventing generic statements about a category.
async function getKnowledgeEntries(tenantId: string): Promise<KnowledgeEntry[]> {
  const { data, error } = await supabaseServer
    .from("knowledge_base")
    .select("category, content, knowledge_base_media(media_url, media_type)")
    .eq("tenant_id", tenantId)
    .not("category", "is", null)
    .order("category");

  if (error) {
    console.error("Failed to fetch knowledge_base entries:", error);
    return [];
  }

  return (data ?? [])
    .filter(
      (row): row is typeof row & { category: string } =>
        typeof row.category === "string" && row.category.length > 0
    )
    .map((row) => ({
      category: row.category,
      content: row.content,
      media: (row.knowledge_base_media ?? []).map((m) => ({
        url: m.media_url,
        type: m.media_type,
      })),
    }));
}

// Renders the fetched entries into a labeled, per-category block of
// verbatim content plus the list of distinct category names — both get
// appended to the system prompt for this turn.
function buildKnowledgeSection(entries: KnowledgeEntry[]): string | null {
  if (entries.length === 0) return null;

  const byCategory = new Map<string, string[]>();
  for (const entry of entries) {
    const existing = byCategory.get(entry.category) ?? [];
    existing.push(withMediaNote(entry.content, entry.media));
    byCategory.set(entry.category, existing);
  }

  const categoryList = Array.from(byCategory.keys()).join(", ");
  const categoryBlocks = Array.from(byCategory.entries())
    .map(([category, contents]) => `[${category}]\n${contents.join("\n")}`)
    .join("\n\n");

  return `These are the distinct categories of information available to you about this business: ${categoryList}. Per the checklist above, you must work through every one of these — one per message, with a follow-up after each — before asking for their phone number.

Here is the business's actual information, organized by category. Use these exact facts, numbers, and details when you share information — never paraphrase them into something generic:

${categoryBlocks}`;
}

const LEAD_EXTRACTION_SYSTEM_PROMPT = `You extract structured lead information from a conversation between a business's chat assistant and a prospective customer. Read the full conversation transcript and respond with ONLY a JSON object, no other text and no markdown code fences, in exactly this shape:

{"name": string or null, "contact_info": string or null, "age": number or null, "main_concern": string or null, "priority": string or null, "duration_of_issue": string or null, "timeline": string or null, "travel_country": string or null, "notes": string or null, "ai_summary": string or null, "qualification_score": integer or null}

Only give a field a real value if it was actually mentioned somewhere in the transcript — use null for anything not yet known. Do not guess or infer beyond what was actually said.

- "contact_info" is whatever they gave to be reached — a phone number, WhatsApp number, or email, whichever applies.
- "main_concern" is what they need or want help with — the reason they got in touch.
- "priority" is what they said matters most to them, e.g. "quality and price" or "speed".
- "duration_of_issue" is how long they've had the need or problem, e.g. "a few months", "for years". Null if it doesn't apply to this kind of business.
- "timeline" is when they're looking to move forward, e.g. "soon", "still exploring".
- "travel_country" is the country they'd be traveling from, if mentioned.
- "notes" is any other detail useful to the sales team that doesn't fit the fields above.
- "ai_summary" is a concise 2-3 sentence briefing written for a sales rep who hasn't read the conversation: who the customer is, what they want, their main concern or objection, and their timeline or intent. Write it fresh each time from the full transcript, not as a diff from a previous summary. Only null if there's genuinely nothing to summarize yet (e.g. the very first message).
- "qualification_score" is an integer from 0 to 100 estimating how strong and ready this lead is, based on how complete their info is, how clearly they've expressed intent, any urgency they've shown, and how engaged they are in the conversation. Higher means a hotter lead. Only null if there's not yet enough conversation to judge.

Respond with the JSON object only.`;

type ExtractedLead = {
  name: string | null;
  contact_info: string | null;
  age: number | null;
  main_concern: string | null;
  priority: string | null;
  duration_of_issue: string | null;
  timeline: string | null;
  travel_country: string | null;
  notes: string | null;
  ai_summary: string | null;
  qualification_score: number | null;
};

type LeadProfileRow = {
  id: string;
  name: string | null;
  contact_info: string | null;
  qualification_data: Record<string, unknown> | null;
};

// Fetches this session's lead_profile row, or null if none exists yet.
async function getLeadProfile(sessionId: string, tenantId: string): Promise<LeadProfileRow | null> {
  const { data, error } = await supabaseServer
    .from("lead_profile")
    .select("id, name, contact_info, qualification_data")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) {
    console.error("Failed to look up lead_profile:", error);
    return null;
  }
  return data;
}

// Creates or updates this session's lead_profile row — the one shared
// upsert path for anything that needs to write to it (photo attachments,
// extracted lead info, ...), so there's always exactly one row per
// session_id. `qualification_data` is shallow-merged onto whatever's
// already stored, so unrelated existing keys (like "attachments") are
// preserved unless the caller explicitly overwrites them. `name`,
// `contact_info`, `ai_summary`, and `qualification_score` are dedicated
// columns and are only set when provided — passing one as `undefined`
// leaves the existing column value untouched rather than clearing it.
async function upsertLeadProfile(
  sessionId: string,
  tenantId: string,
  updates: {
    name?: string | null;
    contact_info?: string | null;
    ai_summary?: string | null;
    qualification_score?: number | null;
    qualification_data?: Record<string, unknown>;
  }
) {
  const existing = await getLeadProfile(sessionId, tenantId);

  const mergedQualificationData = {
    ...(existing?.qualification_data ?? {}),
    ...(updates.qualification_data ?? {}),
  };

  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    session_id: sessionId,
    qualification_data: mergedQualificationData,
  };
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.contact_info !== undefined) row.contact_info = updates.contact_info;
  if (updates.ai_summary !== undefined) row.ai_summary = updates.ai_summary;
  if (updates.qualification_score !== undefined) {
    row.qualification_score = updates.qualification_score;
  }

  if (!existing) {
    const { error } = await supabaseServer.from("lead_profile").insert(row);
    if (error) console.error("Failed to create lead_profile:", error);
    return;
  }

  const { error } = await supabaseServer.from("lead_profile").update(row).eq("id", existing.id);
  if (error) console.error("Failed to update lead_profile:", error);
}

// Renders conversation turns as a plain-text transcript for the extraction
// call — a single user turn describing the conversation, rather than
// replaying it as actual multi-turn history (which would end on an
// assistant message and risk being read as a continuation prompt).
function formatTranscript(turns: { role: string; content: string }[]): string {
  return turns
    .map((t) => `${t.role === "assistant" ? "Assistant" : "User"}: ${t.content}`)
    .join("\n\n");
}

// Runs a lightweight extraction pass over the full conversation so far and
// upserts whatever structured lead info it finds. Deliberately not awaited
// by the caller — it must never delay the reply shown to the user. Every
// failure path (API error, unparseable JSON) is caught and logged here so
// the returned promise always resolves, never rejects.
async function extractAndSaveLead(sessionId: string, tenantId: string, transcript: string) {
  try {
    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 512,
      output_config: { effort: "low" },
      system: LEAD_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock?.type === "text" ? textBlock.text : "";
    const jsonText = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let extracted: Partial<ExtractedLead>;
    try {
      extracted = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error("Failed to parse lead extraction JSON:", parseErr, "raw response:", rawText);
      return;
    }

    // Only fields with a real (non-null) value this pass get written —
    // a field the model didn't detect this time shouldn't erase a value
    // that was already saved from an earlier, more complete transcript.
    const qualificationUpdates: Record<string, unknown> = {};
    const qualificationFields = [
      "age",
      "main_concern",
      "priority",
      "duration_of_issue",
      "timeline",
      "travel_country",
      "notes",
    ] as const;
    for (const field of qualificationFields) {
      const value = extracted[field];
      if (value !== null && value !== undefined) {
        qualificationUpdates[field] = value;
      }
    }

    // A valid integer 0-100, clamped and rounded — anything else (wrong
    // type, out of range, missing) is treated as "no score this pass"
    // rather than writing a bad value to a constrained column.
    const rawScore = extracted.qualification_score;
    const qualificationScore =
      typeof rawScore === "number" && Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : undefined;

    await upsertLeadProfile(sessionId, tenantId, {
      name: extracted.name ?? undefined,
      contact_info: extracted.contact_info ?? undefined,
      ai_summary: extracted.ai_summary ?? undefined,
      qualification_score: qualificationScore,
      qualification_data: qualificationUpdates,
    });
  } catch (err) {
    console.error("Lead extraction failed:", err);
  }
}

export async function POST(req: NextRequest) {
  const { message, photoPath, sessionId, slug } = await req.json();

  if (typeof slug !== "string" || slug.trim().length === 0) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const tenant = await resolveTenantBySlug(slug.trim());
  if (!tenant) {
    return NextResponse.json({ error: "Unknown chat link" }, { status: 404 });
  }
  const tenantId = tenant.id;

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const trimmedMessage = typeof message === "string" ? message.trim() : "";
  const hasPhoto = typeof photoPath === "string" && photoPath.length > 0;

  if (!trimmedMessage && !hasPhoto) {
    return NextResponse.json({ error: "message or photoPath is required" }, { status: 400 });
  }

  // Combine typed text with a marker noting the photo, so the conversation
  // record and Claude both see the same thing the user "said".
  const userContent = hasPhoto
    ? [trimmedMessage, `[Photo attached: ${photoPath}]`].filter(Boolean).join("\n\n")
    : trimmedMessage;

  const [{ data: history, error: historyError }, relevantContext, knowledgeEntries] =
    await Promise.all([
      supabaseServer
        .from("conversations")
        .select("role, content")
        .eq("tenant_id", tenantId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      trimmedMessage ? getRelevantContext(trimmedMessage, tenantId) : Promise.resolve(null),
      getKnowledgeEntries(tenantId),
    ]);

  if (historyError) {
    console.error("Failed to fetch conversation history from Supabase:", historyError);
  }

  const priorMessages: Anthropic.MessageParam[] = (history ?? []).map((row) => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
  }));

  // Built per request from this tenant's own identity, so the assistant
  // knows which business it represents and adopts the persona its industry
  // implies. This replaces a hardcoded dental-clinic prompt that gave every
  // tenant the same vertical regardless of what they actually were.
  //
  // The knowledge section then carries both the category list (what the
  // checklist in step 3 tracks coverage against) and the actual verbatim
  // content per category, so the assistant has real facts to draw from
  // instead of inventing generic statements. RAG retrieval (below) answers
  // specific questions in depth; both layer onto the base system prompt.
  const systemParts = [
    buildSystemPrompt({
      businessName: tenant.businessName,
      industry: tenant.industry,
      description: tenant.description,
      settings: tenant.settings,
    }),
  ];

  const knowledgeSection = buildKnowledgeSection(knowledgeEntries);
  if (knowledgeSection) {
    systemParts.push(knowledgeSection);
  }

  if (relevantContext) {
    systemParts.push(relevantContext.text);
  }

  const systemForThisTurn = systemParts.join("\n\n");

  const response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: systemForThisTurn,
    messages: [...priorMessages, { role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json(
      { error: "The assistant declined to respond to that message." },
      { status: 422 }
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  const rawReply = textBlock?.type === "text" ? textBlock.text : "";

  // Only URLs actually offered to the model this turn are trusted — this
  // guards against a hallucinated or mangled [[MEDIA:...]] tag ever
  // reaching the visitor.
  const knownMedia = new Map<string, string | null>();
  for (const entry of knowledgeEntries) {
    for (const m of entry.media) knownMedia.set(m.url, m.type);
  }
  for (const m of relevantContext?.media ?? []) {
    knownMedia.set(m.url, m.type);
  }
  const { cleaned: reply, media } = extractMedia(rawReply, knownMedia);

  const { error } = await supabaseServer.from("conversations").insert([
    { tenant_id: tenantId, session_id: sessionId, role: "user", content: userContent },
    { tenant_id: tenantId, session_id: sessionId, role: "assistant", content: reply },
  ]);

  if (error) {
    console.error("Failed to save conversation to Supabase:", error);
  }

  if (hasPhoto) {
    await recordAttachment(sessionId, tenantId, photoPath);
  }

  // Fire the lead-extraction pass without awaiting it — it must not delay
  // the reply. Built from the same history already fetched plus this
  // turn's two new messages, so it doesn't need another DB round trip.
  // extractAndSaveLead() catches all of its own errors, so this can't
  // produce an unhandled rejection.
  const transcript = formatTranscript([
    ...(history ?? []),
    { role: "user", content: userContent },
    { role: "assistant", content: reply },
  ]);
  void extractAndSaveLead(sessionId, tenantId, transcript);

  return NextResponse.json({ reply, media });
}

// Appends the photo's storage path to this session's lead_profile row via
// the shared upsert helper, creating the row first if one doesn't exist.
async function recordAttachment(sessionId: string, tenantId: string, photoPath: string) {
  const existing = await getLeadProfile(sessionId, tenantId);
  const qualificationData = existing?.qualification_data ?? {};
  const attachments = Array.isArray(qualificationData.attachments)
    ? (qualificationData.attachments as string[])
    : [];

  await upsertLeadProfile(sessionId, tenantId, {
    qualification_data: { attachments: [...attachments, photoPath] },
  });
}
