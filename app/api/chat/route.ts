import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { openai } from "@/lib/openai";
import { supabaseServer } from "@/lib/supabase-server";
import { TENANT_ID, SESSION_ID } from "@/lib/constants";

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

After each category, follow up using one of these four approaches. Cycle through them and never repeat the same one twice in a single conversation: (a) ask what matters most to them between two specific, concrete factors; (b) ask about a concern or hesitation they might have; (c) ask a factual clarifying question about their own situation — timeline, location, or prior experience; (d) simply acknowledge what you shared and move straight to the next topic, with no question at all. Never use the phrase pattern "does that give you more confidence," "does that put your mind at ease," or "does that help you feel [any feeling]" more than once total across the whole conversation.

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

export async function POST(req: NextRequest) {
  const { message, photoPath } = await req.json();

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
        .eq("session_id", SESSION_ID)
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
    model: "claude-sonnet-4-6",
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
    { tenant_id: TENANT_ID, session_id: SESSION_ID, role: "user", content: userContent },
    { tenant_id: TENANT_ID, session_id: SESSION_ID, role: "assistant", content: reply },
  ]);

  if (error) {
    console.error("Failed to save conversation to Supabase:", error);
  }

  if (hasPhoto) {
    await recordAttachment(photoPath);
  }

  return NextResponse.json({ reply });
}

// Appends the photo's storage path to this session's lead_profile row,
// creating the row first if one doesn't exist yet.
async function recordAttachment(photoPath: string) {
  const { data: existing, error: fetchError } = await supabaseServer
    .from("lead_profile")
    .select("id, qualification_data")
    .eq("tenant_id", TENANT_ID)
    .eq("session_id", SESSION_ID)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to look up lead_profile:", fetchError);
    return;
  }

  if (!existing) {
    const { error: insertError } = await supabaseServer.from("lead_profile").insert({
      tenant_id: TENANT_ID,
      session_id: SESSION_ID,
      qualification_data: { attachments: [photoPath] },
    });

    if (insertError) {
      console.error("Failed to create lead_profile:", insertError);
    }
    return;
  }

  const qualificationData = (existing.qualification_data ?? {}) as Record<string, unknown>;
  const attachments = Array.isArray(qualificationData.attachments)
    ? (qualificationData.attachments as string[])
    : [];

  const { error: updateError } = await supabaseServer
    .from("lead_profile")
    .update({
      qualification_data: { ...qualificationData, attachments: [...attachments, photoPath] },
    })
    .eq("id", existing.id);

  if (updateError) {
    console.error("Failed to update lead_profile:", updateError);
  }
}
