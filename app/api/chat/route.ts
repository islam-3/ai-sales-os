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

Open by sparking interest, not by questioning. Start the conversation with something specific and inviting about the clinic — experienced doctors, modern technology, successful cases, that kind of thing — so the patient gets curious about the clinic itself before you ask them anything. Only move into questions once they've engaged.

Gather lead details in small, natural waves that follow the conversation rather than a rigid script. Roughly, in this order as it fits naturally: their name and age; their main dental concern or what they're looking for; if relevant, a rough sense of their travel timeline; their WhatsApp number or best way to reach them; and, once you understand their concern, a photo of their teeth for the dental team to review. Never ask for two unrelated things in the same message — one question, and let their answer naturally lead you to the next one rather than working down a checklist.

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

// Distinct knowledge_base categories available for this tenant (e.g.
// "doctors", "technology", "guarantees"), so the assistant can proactively
// offer relevant info rather than only answering when asked directly.
async function getAvailableCategories(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("knowledge_base")
    .select("category")
    .eq("tenant_id", TENANT_ID)
    .not("category", "is", null);

  if (error) {
    console.error("Failed to fetch knowledge_base categories:", error);
    return [];
  }

  const categories = new Set<string>();
  for (const row of data ?? []) {
    if (row.category) categories.add(row.category);
  }
  return Array.from(categories);
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

  const [{ data: history, error: historyError }, relevantContext, categories] =
    await Promise.all([
      supabaseServer
        .from("conversations")
        .select("role, content")
        .eq("tenant_id", TENANT_ID)
        .eq("session_id", SESSION_ID)
        .order("created_at", { ascending: true }),
      trimmedMessage ? getRelevantContext(trimmedMessage) : Promise.resolve(null),
      getAvailableCategories(),
    ]);

  if (historyError) {
    console.error("Failed to fetch conversation history from Supabase:", historyError);
  }

  const priorMessages: Anthropic.MessageParam[] = (history ?? []).map((row) => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
  }));

  // Category list drives proactive suggestions; RAG retrieval (above)
  // answers specific questions in depth — both are optional additions
  // layered onto the base system prompt.
  const systemParts = [SYSTEM_PROMPT];

  if (categories.length > 0) {
    systemParts.push(
      `You have information available about: ${categories.join(", ")}. Proactively and naturally offer to share one of these when it fits the conversation (e.g. "want to hear about our doctors' experience, or the guarantees we offer?"), rather than only answering if asked directly.`
    );
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
