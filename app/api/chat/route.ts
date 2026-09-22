import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { openai } from "@/lib/openai";
import { supabaseServer } from "@/lib/supabase-server";
import { isValidSessionId } from "@/lib/constants";
import { resolveTenantBySlug } from "@/lib/resolve-tenant";
import { BEHAVIOUR_PROMPT, buildSystemPrompt } from "@/lib/business-prompt";
import { recordUsage } from "@/lib/usage";
import { recordConversationStart } from "@/lib/conversation-metering";
import { keepAlive } from "@/lib/keep-alive";
import { formatEntryForPrompt } from "@/lib/knowledge-base";
import { buildConversationStateBlock } from "@/lib/conversation-state";
import {
  buildMediaInstruction,
  buildPhotoOfferInstruction,
  decideMedia,
  suggestPhotoOffer,
} from "@/lib/chat-media";
import {
  GENERATED_LEAD_FIELDS,
  buildLeadExtractionPrompt,
  dropUnsupportedNumbers,
  leadLanguage,
} from "@/lib/lead-language";
import { enforceSingleQuestion, stripMarkup } from "@/lib/strip-markup";
import { untracedFigures } from "@/lib/reply-accuracy";
import { resolveVisitorLanguage } from "@/lib/visitor-language";
import {
  INTERNAL_STATE_CLOSE,
  INTERNAL_STATE_OPEN,
  SAFE_FALLBACK,
  containsInternalState,
  stripInternalState,
} from "@/lib/reply-guard";

const CHAT_MODEL = "claude-sonnet-4-6";

// Lead extraction ran on Haiku while it was only filling a fixed JSON
// schema from a transcript — a constrained task with no requirement to
// write well, so the cheaper model was the right call.
//
// Writing the lead in the TEAM's language changed that, and measurement
// moved it back to Sonnet. Haiku followed the language instruction on 2
// of 4 runs writing Turkish for an English conversation, and 3 of 4
// writing English for a Turkish one; Sonnet was 4 of 4 on the harder
// direction. Half the leads in the wrong language is not a feature, and
// no amount of prompt wording fixed it — moving the rule to the top of
// the prompt and repeating it at the end left Haiku at 2 of 4.
//
// The cost is bounded and known: extraction averages ~1.1k input and
// ~250 output tokens, uncached, on roughly every third turn. Only the
// per-token rate changes. Reverting is this one line if that trade stops
// being worth it.
const LEAD_EXTRACTION_MODEL = "claude-sonnet-4-6";

// Extraction used to run on every single message, re-reading the whole
// transcript each time — measured at ~41% of total conversation cost and
// growing with every turn. It doesn't need to: lead_profile only has to
// be current by the time an owner opens the dashboard, and upsert merges
// non-null fields, so a skipped run loses nothing permanently — the next
// run re-reads the full transcript and recovers it.
//
// The trigger below is a compromise between cost and never losing the
// data that matters:
//   • turns 1-2 always run, so a name and stated need appear on the
//     dashboard almost immediately rather than after a delay;
//   • any message that looks like it carries contact details always
//     runs, so a phone number or email can never be stranded by a
//     conversation that stops right after it is given;
//   • otherwise every 3rd turn.
//
// Residual risk, stated plainly: if a conversation ends on a turn that
// isn't extracted, non-contact detail from that final turn only (e.g. a
// revised timeline) is missed. Everything earlier is still captured,
// because each run re-reads the entire transcript.
const LEAD_EXTRACTION_EVERY_N_TURNS = 3;
const CONTACT_HINT =
  /\d{6,}|\+\d[\d\s().-]{5,}|@[\w.-]+\.\w{2,}|\bwhats\s?app\b|\be-?mail\b|\bcall me\b|\breach me\b|\bmy number\b/i;

function shouldExtractLead(userTurnNumber: number, userMessage: string): boolean {
  if (userTurnNumber <= 2) return true;
  if (CONTACT_HINT.test(userMessage)) return true;
  return userTurnNumber % LEAD_EXTRACTION_EVERY_N_TURNS === 0;
}
const EMBEDDING_MODEL = "text-embedding-3-small";
const MATCH_COUNT = 3;

// ─────────────────────────────────────────────────────────────────────
// TEMPORARY: RAG retrieval is switched off, deliberately.
//
// Every categorised knowledge_base row for the tenant is already sent in
// full on every turn (see getKnowledgeEntries + buildKnowledgeSection).
// RAG then selected its top matches from that same table, so the block it
// added was verbatim duplication of text already in the prompt —
// measured at 3/3 matches for Demo Clinic — costing ~150 extra input
// tokens per turn and telling the model nothing new.
//
// RE-ENABLE THIS when the knowledge base grows large enough that sending
// it wholesale stops being practical. At that point the relationship
// inverts: retrieval becomes the primary mechanism and the full dump
// should be dropped instead. Roughly, revisit once a tenant exceeds a few
// dozen entries — Demo Clinic's 8 entries cost ~460 tokens, so ~80
// entries would add ~4,600 tokens to every single turn.
//
// Safe only while BOTH remain true:
//   1. the full dump is still being sent, and
//   2. every knowledge_base row has a category — the dump filters on
//      `category is not null` while match_knowledge_base does not, so a
//      null-category row would be reachable ONLY via RAG and would
//      silently vanish from the prompt. The settings form requires a
//      category, and a check confirmed zero such rows exist.
//
// The retrieval code below is intact and unmodified; only this flag gates
// its use.
const RAG_RETRIEVAL_ENABLED = false;
// ─────────────────────────────────────────────────────────────────────
// Cosine similarity is roughly 0-1 for related text with this model; below
// this, a match is more likely noise than something worth grounding on.
const SIMILARITY_THRESHOLD = 0.3;

type EntryMedia = { url: string; type: string | null };

type KnowledgeMatch = {
  id: string;
  title: string | null;
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
  // Deliberately no URL. The model cannot send anything — lib/chat-media.ts
  // owns that decision — so a URL here would only be something for it to
  // mis-copy. It only needs to know a photo exists, so it can offer one.
  return `${content} (a photo of this is available to show)`;
}

// Embeds the user's message and looks up the most relevant knowledge_base
// entries for this tenant. Returns null on any failure or when nothing
// clears the similarity bar — callers should just proceed without context.
// Also returns the matches' media, which feeds the media decision.
async function getRelevantContext(
  query: string,
  tenantId: string,
  sessionId: string
): Promise<{ text: string; media: EntryMedia[] } | null> {
  try {
    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Not awaited: cost tracking must never add latency to a reply the
    // visitor is waiting on. recordUsage never rejects.
    void recordUsage({
      tenantId,
      sessionId,
      callType: "rag_embedding",
      provider: "openai",
      model: EMBEDDING_MODEL,
      // Embeddings bill on prompt tokens only; there is no output side.
      tokens: { inputTokens: embeddingResponse.usage?.prompt_tokens ?? 0 },
    });

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
        .map((m) => withMediaNote(formatEntryForPrompt({ title: m.title ?? "", content: m.content }), m.media ?? []))
        .join("\n\n")}`,
      media: relevant.flatMap((m) => m.media ?? []),
    };
  } catch (err) {
    console.error("Failed to generate embedding for retrieval:", err);
    return null;
  }
}

type KnowledgeEntry = {
  title: string;
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
    .select("title, category, content, knowledge_base_media(media_url, media_type)")
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
      title: row.title ?? "",
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
    existing.push(withMediaNote(formatEntryForPrompt(entry), entry.media));
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

// The extraction prompt now depends on the team's language and the
// business's own service and brand names, so it is built per tenant in
// lib/lead-language.ts rather than being a constant here.

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
  visitor_language: string | null;
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
async function extractAndSaveLead(
  sessionId: string,
  tenantId: string,
  transcript: string,
  /** The language the team reads leads in. */
  language: string,
  /** The visitor's own messages, for deciding what language to route this lead in. */
  visitorMessages: string[]
) {
  try {
    // The transcript handed in here is the visitor's words as they typed
    // them, and it stays that way: it is stored untranslated by design,
    // because tone, urgency, hesitation and exact medical wording are all
    // evidence, and a mistranslated "I have diabetes" is a real risk.
    // Only what the model writes ABOUT them below is in the team's
    // language. Reading the visitor's own words in translation is the
    // intended follow-up — a lead transcript view with an on-demand,
    // per-message translate action that never writes to storage — not a
    // gap left here by accident.
    //
    // No output_config: extraction is a short, schema-constrained task
    // with nothing to tune down. (Haiku 4.5 rejected `effort` outright
    // with a 400; Sonnet accepts it, but it buys nothing here.)
    const response = await anthropic.messages.create({
      model: LEAD_EXTRACTION_MODEL,
      max_tokens: 512,
      system: buildLeadExtractionPrompt(language),
      messages: [{ role: "user", content: transcript }],
    });

    // This whole function already runs after the HTTP response is sent,
    // so awaiting here costs the visitor nothing — and awaiting means the
    // row is written before the serverless invocation can be frozen.
    await recordUsage({
      tenantId,
      sessionId,
      callType: "lead_extraction",
      provider: "anthropic",
      model: LEAD_EXTRACTION_MODEL,
      tokens: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      },
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

    // A number in a generated field that is nowhere in the transcript is
    // either invented or reformatted, and a wrong price is worse than a
    // missing one. The prompt asks for these to be carried through
    // unchanged; this is what checks that it happened.
    const guarded = dropUnsupportedNumbers(
      Object.fromEntries(
        GENERATED_LEAD_FIELDS.map((field) => [field, extracted[field] ?? null])
      ),
      transcript
    );
    if (guarded.dropped.length > 0) {
      console.error("[lead] dropped fields with numbers absent from the transcript", {
        sessionId,
        tenantId,
        dropped: guarded.dropped,
      });
      for (const { field } of guarded.dropped) {
        (extracted as Record<string, unknown>)[field] = null;
      }
    }

    // Which language to route this lead to a salesperson in.
    //
    // The model proposes it; the script the visitor actually typed in
    // vetoes it. Script cannot NAME a language - Arabic script covers
    // Persian and Urdu, Cyrillic covers Ukrainian - but it can prove one
    // wrong, and a lead labelled German that is really Arabic goes to the
    // wrong rep and sits there. Judged on the visitor's own messages
    // only, never the assistant's replies and never the tenant settings:
    // someone may write in a language the clinic never configured.
    const visitorLanguage = resolveVisitorLanguage(extracted.visitor_language, visitorMessages);
    if (visitorLanguage.vetoed) {
      console.warn("[lead] visitor language contradicted by script", {
        sessionId,
        tenantId,
        proposed: visitorLanguage.proposed,
        script: visitorLanguage.script,
      });
    }
    extracted.visitor_language = visitorLanguage.language;

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
      "visitor_language",
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
  const { message, photoPath, sessionId, slug, openingMessage } = await req.json();

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

  // The proactive greeting the visitor was shown on page load. It is
  // deliberately NOT written when the page renders — a stored assistant
  // row would make history non-empty, and conversation metering keys off
  // an empty history, so persisting it early would stop conversations
  // being counted at all. Instead the client sends it back with the first
  // message and it's stored here, alongside that message, once the
  // visitor has actually engaged.
  const greeting =
    typeof openingMessage === "string" && openingMessage.trim().length > 0
      ? openingMessage.trim()
      : null;

  const [{ data: history, error: historyError }, relevantContext, knowledgeEntries] =
    await Promise.all([
      supabaseServer
        .from("conversations")
        .select("role, content, media_url")
        .eq("tenant_id", tenantId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      // Skipping this also skips the OpenAI embedding call it makes,
      // removing a network round trip from the critical path — the
      // visitor is waiting on this request.
      RAG_RETRIEVAL_ENABLED && trimmedMessage
        ? getRelevantContext(trimmedMessage, tenantId, sessionId)
        : Promise.resolve(null),
      getKnowledgeEntries(tenantId),
    ]);

  if (historyError) {
    console.error("Failed to fetch conversation history from Supabase:", historyError);
  }

  const storedMessages: Anthropic.MessageParam[] = (history ?? []).map((row) => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
  }));

  // On the first turn the greeting isn't in the database yet, so it's
  // prepended here — otherwise the model has no idea it already said
  // hello and opens by greeting the visitor a second time.
  const priorMessages: Anthropic.MessageParam[] =
    storedMessages.length === 0 && greeting
      ? [{ role: "assistant", content: greeting }]
      : storedMessages;

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
  const staticParts = [
    buildSystemPrompt({
      businessName: tenant.businessName,
      industry: tenant.industry,
      description: tenant.description,
      settings: tenant.settings,
    }),
  ];

  const knowledgeSection = buildKnowledgeSection(knowledgeEntries);
  if (knowledgeSection) {
    staticParts.push(knowledgeSection);
  }

  // Split into cached and uncached blocks rather than one string.
  //
  // Everything above is stable: the identity block only changes when the
  // owner edits their business details, and the knowledge section only
  // when they edit an entry — neither changes between turns of a
  // conversation, and both are byte-identical across every visitor to the
  // same tenant. Marking the end of it with cache_control means it's
  // charged in full once and read back at a fraction of the price on
  // every subsequent turn inside the cache window.
  //
  // The block text is assembled so the concatenation is byte-for-byte
  // what the single joined string used to be — the leading "\n\n" on the
  // RAG block replaces the separator that .join("\n\n") used to add. The
  // model therefore sees exactly the same prompt as before; only the
  // billing changes.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: staticParts.join("\n\n"),
      cache_control: { type: "ephemeral" },
    },
  ];

  if (relevantContext) {
    systemBlocks.push({ type: "text", text: `\n\n${relevantContext.text}` });
  }

  // What has already been offered, and whether the visitor sounds
  // frustrated — recomputed every turn from the transcript, including the
  // message that just arrived.
  //
  // Deliberately appended AFTER the cache_control block above, never
  // inside it. This text changes on every turn, so folding it into the
  // cached prefix would invalidate the cache on every single message and
  // undo the saving that caching exists for.
  // The entries are passed whole rather than concatenated: the state
  // builder selects only the ones matching what the visitor asked for.
  // Handing it the entire catalogue made every conversation look like a
  // multi-visit trip abroad; handing it nothing missed cases the
  // assistant had not happened to describe.
  // What this visitor has already been shown. The tag is stripped before
  // a reply is stored, so without the media_url column there was no
  // record of it and the same photo went out on consecutive turns.
  // Computed before the model call so the state block can say when the
  // available images are spent.
  const alreadySent = new Set(
    (history ?? [])
      .map((row) => (row as { media_url?: string | null }).media_url)
      .filter((url): url is string => !!url)
  );

  const turnsWithLatest = [
    ...(history ?? []),
    { role: "user", content: userContent },
  ];

  const entriesForState = knowledgeEntries.map((e) => ({
    title: e.title,
    content: e.content,
  }));

  // The single media decision, made here and nowhere else. The model is
  // told what is attached; it has no way to send anything itself.
  const mediaCandidates = knowledgeEntries.map((e) => ({
    title: e.title,
    content: e.content,
    media: e.media,
    // Lets a photo filed under a category, with a title like "Before and
    // after" that names no subject, be matched by that category.
    category: e.category,
  }));

  const mediaDecision = decideMedia(turnsWithLatest, mediaCandidates, alreadySent);

  const mediaInstruction = buildMediaInstruction(mediaDecision);

  // An unprompted offer is only considered on a turn with no request of
  // any kind. While the visitor is asking to see something, the answer to
  // that is the whole job of this reply.
  const photoOffer =
    !mediaDecision.send && mediaDecision.reason === "no-request"
      ? buildPhotoOfferInstruction(suggestPhotoOffer(turnsWithLatest, mediaCandidates, alreadySent))
      : null;

  const stateBlock = buildConversationStateBlock(
    turnsWithLatest,
    entriesForState,
    mediaInstruction,
    photoOffer
  );
  if (stateBlock) {
    // Fenced so a verbatim echo is detectable exactly rather than by
    // resemblance. The model reproduced this entire block into a reply
    // once; the fence means the guard downstream need not guess.
    systemBlocks.push({
      type: "text",
      text: [
        "",
        "",
        INTERNAL_STATE_OPEN,
        stateBlock,
        INTERNAL_STATE_CLOSE,
      ].join("\n"),
    });
  }

  const response = await anthropic.messages.create({
    model: CHAT_MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: systemBlocks,
    messages: [...priorMessages, { role: "user", content: userContent }],
  });

  // Recorded before the refusal check below, because a refusal is still a
  // billed call — excluding it would understate real spend.
  void recordUsage({
    tenantId,
    sessionId,
    callType: "chat_reply",
    provider: "anthropic",
    model: CHAT_MODEL,
    tokens: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  });

  if (response.stop_reason === "refusal") {
    return NextResponse.json(
      { error: "The assistant declined to respond to that message." },
      { status: 422 }
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  const rawReply = textBlock?.type === "text" ? textBlock.text : "";

  // The single gate. Everything below — the HTTP response, the stored
  // transcript, the lead extractor — reads one value and nothing else, so
  // this is the only place internal content could escape, and it does not
  // get past here.
  // Checked against the instruction text actually sent this turn, not
  // only against a list of known phrases. The list is written by hand and
  // went stale the moment a section was added after it; this cannot.
  // The knowledge base is deliberately NOT included — repeating its
  // facts to the visitor is the assistant's job.
  const injected = [BEHAVIOUR_PROMPT, stateBlock ?? ""];
  const cleaned = stripInternalState(rawReply, injected);
  if (cleaned !== rawReply) {
    console.error("[chat] internal state in model output", {
      sessionId,
      tenantId,
      discarded: cleaned === null,
      sample: rawReply.slice(0, 200),
    });
  }

  const candidate =
    cleaned === null ? SAFE_FALLBACK : enforceSingleQuestion(stripMarkup(cleaned));

  // Belt and braces: whatever happened above, nothing internal is served.
  const reply = containsInternalState(candidate, injected) ? SAFE_FALLBACK : candidate;

  // Figures the reply states that the business never did. WATCHING ONLY:
  // nothing is changed or withheld on the strength of it yet.
  //
  // On this path a false positive would cost a whole visible message, not
  // a hidden field, so the rate and the shape of what it catches are
  // measured before anything acts on it. The log separates the two cases
  // that want opposite answers — a price nobody quoted, versus the same
  // figure rewritten ("5,000" as "5.000", "two visits" as "2 visits").
  const figureSource = [
    knowledgeEntries.map((e) => `${e.title} ${e.content}`).join(" "),
    (history ?? []).map((row) => row.content).join(" "),
    userContent,
  ].join(" ");
  const untraced = untracedFigures(reply, figureSource);
  if (untraced.length > 0) {
    console.warn("[chat] figures with no source", {
      sessionId,
      tenantId,
      figures: untraced,
    });
  }

  const media = mediaDecision.send
    ? { url: mediaDecision.url, type: mediaDecision.type }
    : null;

  // Written in order: the greeting (first turn only) precedes the
  // visitor's message so the stored transcript reads the way the
  // conversation actually happened.
  const rowsToInsert = [
    ...((history ?? []).length === 0 && greeting
      ? [{ tenant_id: tenantId, session_id: sessionId, role: "assistant", content: greeting }]
      : []),
    { tenant_id: tenantId, session_id: sessionId, role: "user", content: userContent },
    {
      tenant_id: tenantId,
      session_id: sessionId,
      role: "assistant",
      content: reply,
      media_url: media?.url ?? null,
    },
  ];

  const { error } = await supabaseServer.from("conversations").insert(rowsToInsert);

  if (error) {
    console.error("Failed to save conversation to Supabase:", error);
  }

  if (hasPhoto) {
    await recordAttachment(sessionId, tenantId, photoPath);
  }

  // Meter this session as one conversation. `history.length === 0` means
  // it's the visitor's first message, but that check is only an
  // optimisation to skip an RPC on later turns — the real guarantee is
  // the unique (tenant_id, session_id) constraint inside the function, so
  // two simultaneous first messages still count once.
  //
  // Not awaited, and never allowed to throw: metering is a billing
  // concern, and a visitor must not wait on it or see a conversation fail
  // because of it. Worst case is an undercount, which is the right way to
  // be wrong.
  if ((history ?? []).length === 0) {
    keepAlive(recordConversationStart(tenantId, sessionId), "recordConversationStart");
  }

  // The lead-extraction pass runs after the reply has gone out, so it
  // never delays it — but through keepAlive(), not dropped on the floor.
  // The response returning is what used to kill it, and it killed the
  // last turn of every conversation: the one carrying the name and the
  // number. Built from the same history already fetched plus this turn's
  // two new messages, so it doesn't need another DB round trip.
  //
  // Gated by shouldExtractLead (see the constants at the top) so it no
  // longer runs on every message. A skipped turn is recovered by the next
  // run, which re-reads the whole transcript from scratch.
  const priorUserTurns = (history ?? []).filter((row) => row.role === "user").length;
  const userTurnNumber = priorUserTurns + 1;

  if (shouldExtractLead(userTurnNumber, userContent)) {
    const transcript = formatTranscript([
      ...(history ?? []),
      { role: "user", content: userContent },
      { role: "assistant", content: reply },
    ]);
    // The visitor's own messages, never the assistant's replies: the
    // language to route on is the one they wrote in.
    const visitorMessages = [
      ...(history ?? []).filter((row) => row.role === "user").map((row) => row.content),
      userContent,
    ];
    keepAlive(
      extractAndSaveLead(
        sessionId,
        tenantId,
        transcript,
        leadLanguage(tenant.settings),
        visitorMessages
      ),
      "extractAndSaveLead"
    );
  }

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
