import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { openai } from "@/lib/openai";
import { supabaseServer } from "@/lib/supabase-server";
import { TENANT_ID, isValidSessionId } from "@/lib/constants";

const CHAT_MODEL = "claude-sonnet-4-6";
const EMBEDDING_MODEL = "text-embedding-3-small";
const MATCH_COUNT = 3;
// Cosine similarity is roughly 0-1 for related text with this model; below
// this, a match is more likely noise than something worth grounding on.
const SIMILARITY_THRESHOLD = 0.3;

const SYSTEM_PROMPT = `You are the first point of contact for a dental clinic, chatting with someone who reached out. Your job is lead generation and qualification — not closing a sale, not booking an appointment, and not directly convincing the patient of anything. Your job is to build genuine interest in the clinic, gather complete lead information, and guide the patient toward sending a photo for the dental team to assess.

Open by sparking interest, not by questioning. Start the conversation with something specific and inviting about the clinic — experienced doctors, modern technology, successful cases, that kind of thing — so the patient gets curious about the clinic itself before you ask them anything.

Follow this checklist for every conversation, in order. This is a hard sequence, not a suggestion — do not skip ahead out of habit or an urge to collect contact details quickly. Mentally track which step you're on and which categories you've already covered as you go.

1. Learn their main concern. Once they've engaged with your opening, ask naturally about what's bringing them in. Don't move to step 2 until you understand it.

2. Share concern-relevant info first. Your first shared piece of clinic information must be whichever category is most relevant to their specific concern — not a generic fact, and not necessarily the first category in your list. If they mention missing teeth, bring up the lifetime implant guarantee or a doctor's experience with similar cases; if they mention discoloration, bring up whitening results or a relevant before/after story. This comes before any name or contact request.

3. Work through every remaining category, one at a time — this explicitly includes clinic_overview (who the clinic is, their history and experience), which is just as mandatory as any other category, never optional and never skippable. After that first concern-driven share, continue through each of the other distinct categories available to you — one category per message, never combining two in the same message, and never repeating one you've already covered. When sharing information, you must use the specific facts, numbers, and details from the clinic information provided to you below — do not invent generic statements. If the clinic has been open 12 years and treated 5,000 patients from 30 countries, say that specifically, not "has been around for years."

After each category, ask a follow-up that requires more than a one-word answer. FORBIDDEN: any question that can be fully answered with "yes," "sure," "no," or a nod — this includes phrasing like "Does that matter to you?", "Does that sound good?", "Does that give you confidence?", or "Would that help?". Before sending any message that shares clinic info, check yourself: does my follow-up question require more than a one-word answer? If not, rewrite it using one of these patterns, rotating through them and never repeating the same one twice in one conversation: a choice between options ("Is it mainly the front teeth, or is it spread across your mouth?"); a timeframe or number ("How long have you been dealing with this?" or "How many teeth are we talking about?"); a location or logistics fact ("Are you looking to travel for this, or is there a local option you're considering too?"); a priority or preference ("Between getting this done quickly versus getting the absolute best long-term result, which matters more to you?"); or a concern or hesitation ("Is there anything about the process that's been holding you back so far?"). You can also simply acknowledge what you shared and move straight to the next topic with no question at all — that's always a valid alternative to asking something forgettable.

Pace it like a real conversation, not a rapid-fire briefing. Somewhere in this stretch, also naturally weave in a question about their timeline, something like "are you looking to do this soon, or still exploring options?" — ask it once, and let it go if they don't answer directly. You are FORBIDDEN from asking for their phone number until every distinct category available to you — including clinic_overview — has been touched on at least once. This is a hard rule, not a suggestion.

4. Only once every category has been covered, move into contact details, in order: their name and age; then their WhatsApp number or best way to reach them; then, once you understand their concern, a photo of their teeth for the dental team to review. Never ask for two unrelated things in the same message.

Exception: if the customer explicitly and directly asks to skip ahead — for example "just give me your number" or "how do I book" — you may honor that and move into contact details early. Even then, briefly offer once, something like "before that, want to know about [a category you haven't covered]?" — then respect whatever they say next and don't insist further.

The point of steps 2 and 3 is for the patient to feel genuinely familiar with and interested in this specific clinic by the time you ask for contact details — not like they just filled out a lead form. Treat this as more important than the instinct to move quickly toward getting their number.

Frame the photo request as helping the dental team put together an accurate assessment for them, never as a bureaucratic requirement.

Behavioral rules: ask only one question per message. Keep every reply to two or three short sentences. Never use markdown tables or bullet or numbered lists — write in plain conversational prose throughout. Never try to convince the patient to book or close, and never push — your role stops at building interest and gathering information. Once you have their name, contact info, and main concern, and ideally a photo, warmly close by letting them know the team will review their case and follow up, and stop actively asking questions from there.`;

type KnowledgeMatch = {
  id: string;
  content: string;
  category: string | null;
  similarity: number;
};

// Embeds the user's message and looks up the most relevant knowledge_base
// entries for this tenant. Returns null on any failure or when nothing
// clears the similarity bar — callers should just proceed without context.
async function getRelevantContext(query: string): Promise<string | null> {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    const { data: matches, error } = await supabaseServer.rpc("match_knowledge_base", {
      query_embedding: queryEmbedding,
      match_tenant_id: TENANT_ID,
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

    return `Relevant information about the clinic:\n${relevant.map((m) => m.content).join("\n\n")}`;
  } catch (err) {
    console.error("Failed to generate embedding for retrieval:", err);
    return null;
  }
}

type KnowledgeEntry = { category: string; content: string };

// Every knowledge_base row for this tenant that has a category, with its
// full verbatim content — not just the category name. The checklist in
// SYSTEM_PROMPT requires the assistant to use these exact facts rather
// than inventing generic statements about a category.
async function getKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const { data, error } = await supabaseServer
    .from("knowledge_base")
    .select("category, content")
    .eq("tenant_id", TENANT_ID)
    .not("category", "is", null)
    .order("category");

  if (error) {
    console.error("Failed to fetch knowledge_base entries:", error);
    return [];
  }

  return (data ?? []).filter(
    (row): row is KnowledgeEntry => typeof row.category === "string" && row.category.length > 0
  );
}

// Renders the fetched entries into a labeled, per-category block of
// verbatim content plus the list of distinct category names — both get
// appended to the system prompt for this turn.
function buildKnowledgeSection(entries: KnowledgeEntry[]): string | null {
  if (entries.length === 0) return null;

  const byCategory = new Map<string, string[]>();
  for (const entry of entries) {
    const existing = byCategory.get(entry.category) ?? [];
    existing.push(entry.content);
    byCategory.set(entry.category, existing);
  }

  const categoryList = Array.from(byCategory.keys()).join(", ");
  const categoryBlocks = Array.from(byCategory.entries())
    .map(([category, contents]) => `[${category}]\n${contents.join("\n")}`)
    .join("\n\n");

  return `These are the distinct categories of clinic information available to you for this tenant: ${categoryList}. Per the checklist above, you must work through every one of these — one per message, with a follow-up after each — before asking for their phone number.

Here is the clinic's actual information, organized by category. Use these exact facts, numbers, and details when you share information — never paraphrase them into something generic:

${categoryBlocks}`;
}

const LEAD_EXTRACTION_SYSTEM_PROMPT = `You extract structured lead information from a conversation between a dental clinic's chat assistant and a prospective patient. Read the full conversation transcript and respond with ONLY a JSON object, no other text and no markdown code fences, in exactly this shape:

{"name": string or null, "contact_info": string or null, "age": number or null, "main_concern": string or null, "priority": string or null, "duration_of_issue": string or null, "timeline": string or null, "travel_country": string or null, "notes": string or null}

Only give a field a real value if it was actually mentioned somewhere in the transcript — use null for anything not yet known. Do not guess or infer beyond what was actually said.

- "contact_info" is whatever the patient gave to be reached — a phone number, WhatsApp number, or email, whichever applies.
- "priority" is what the patient said matters most to them, e.g. "quality and price" or "speed".
- "duration_of_issue" is how long they've had the concern, e.g. "a few months", "since childhood".
- "timeline" is when they're looking to move forward, e.g. "soon", "still exploring".
- "travel_country" is the country they'd be traveling from, if mentioned.
- "notes" is any other detail useful to the sales team that doesn't fit the fields above.

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
};

type LeadProfileRow = {
  id: string;
  name: string | null;
  contact_info: string | null;
  qualification_data: Record<string, unknown> | null;
};

// Fetches this session's lead_profile row, or null if none exists yet.
async function getLeadProfile(sessionId: string): Promise<LeadProfileRow | null> {
  const { data, error } = await supabaseServer
    .from("lead_profile")
    .select("id, name, contact_info, qualification_data")
    .eq("tenant_id", TENANT_ID)
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
// preserved unless the caller explicitly overwrites them. `name` and
// `contact_info` are only set when provided — passing them as `undefined`
// leaves the existing column value untouched rather than clearing it.
async function upsertLeadProfile(
  sessionId: string,
  updates: {
    name?: string | null;
    contact_info?: string | null;
    qualification_data?: Record<string, unknown>;
  }
) {
  const existing = await getLeadProfile(sessionId);

  const mergedQualificationData = {
    ...(existing?.qualification_data ?? {}),
    ...(updates.qualification_data ?? {}),
  };

  const row: Record<string, unknown> = {
    tenant_id: TENANT_ID,
    session_id: sessionId,
    qualification_data: mergedQualificationData,
  };
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.contact_info !== undefined) row.contact_info = updates.contact_info;

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

// Runs a lightweight extraction call over the full conversation so far and
// upserts whatever structured lead info it finds. Deliberately not awaited
// by the caller — it must never delay the reply shown to the user. Every
// failure path (API error, unparseable JSON) is caught and logged here so
// the returned promise always resolves, never rejects.
async function extractAndSaveLead(sessionId: string, transcript: string) {
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

    await upsertLeadProfile(sessionId, {
      name: extracted.name ?? undefined,
      contact_info: extracted.contact_info ?? undefined,
      qualification_data: qualificationUpdates,
    });
  } catch (err) {
    console.error("Lead extraction failed:", err);
  }
}

export async function POST(req: NextRequest) {
  const { message, photoPath, sessionId } = await req.json();

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
        .eq("tenant_id", TENANT_ID)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      trimmedMessage ? getRelevantContext(trimmedMessage) : Promise.resolve(null),
      getKnowledgeEntries(),
    ]);

  if (historyError) {
    console.error("Failed to fetch conversation history from Supabase:", historyError);
  }

  const priorMessages: Anthropic.MessageParam[] = (history ?? []).map((row) => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
  }));

  // The knowledge section carries both the category list (what the
  // checklist in step 3 tracks coverage against) and the actual verbatim
  // content per category, so the assistant has real facts to draw from
  // instead of inventing generic statements. RAG retrieval (below) answers
  // specific questions in depth; both layer onto the base system prompt.
  const systemParts = [SYSTEM_PROMPT];

  const knowledgeSection = buildKnowledgeSection(knowledgeEntries);
  if (knowledgeSection) {
    systemParts.push(knowledgeSection);
  }

  if (relevantContext) {
    systemParts.push(relevantContext);
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
  const reply = textBlock?.type === "text" ? textBlock.text : "";

  const { error } = await supabaseServer.from("conversations").insert([
    { tenant_id: TENANT_ID, session_id: sessionId, role: "user", content: userContent },
    { tenant_id: TENANT_ID, session_id: sessionId, role: "assistant", content: reply },
  ]);

  if (error) {
    console.error("Failed to save conversation to Supabase:", error);
  }

  if (hasPhoto) {
    await recordAttachment(sessionId, photoPath);
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
  void extractAndSaveLead(sessionId, transcript);

  return NextResponse.json({ reply });
}

// Appends the photo's storage path to this session's lead_profile row via
// the shared upsert helper, creating the row first if one doesn't exist.
async function recordAttachment(sessionId: string, photoPath: string) {
  const existing = await getLeadProfile(sessionId);
  const qualificationData = existing?.qualification_data ?? {};
  const attachments = Array.isArray(qualificationData.attachments)
    ? (qualificationData.attachments as string[])
    : [];

  await upsertLeadProfile(sessionId, {
    qualification_data: { attachments: [...attachments, photoPath] },
  });
}
