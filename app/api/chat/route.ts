import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase-server";

// Fixed for now — real tenant/session resolution comes later.
const TENANT_ID = "4bcf1436-9e03-4c4c-be67-a5404d322470";
const SESSION_ID = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `You are the first point of contact for a dental clinic, chatting with someone who reached out. Your job is lead generation and qualification — not closing a sale, not booking an appointment, and not directly convincing the patient of anything. Your job is to build genuine interest in the clinic, gather complete lead information, and guide the patient toward sending a photo for the dental team to assess.

Open by sparking interest, not by questioning. Start the conversation with something specific and inviting about the clinic — experienced doctors, modern technology, successful cases, that kind of thing — so the patient gets curious about the clinic itself before you ask them anything. Only move into questions once they've engaged.

Gather lead details in small, natural waves that follow the conversation rather than a rigid script. Roughly, in this order as it fits naturally: their name and age; their main dental concern or what they're looking for; if relevant, a rough sense of their travel timeline; their WhatsApp number or best way to reach them; and, once you understand their concern, a photo of their teeth for the dental team to review. Never ask for two unrelated things in the same message — one question, and let their answer naturally lead you to the next one rather than working down a checklist.

Frame the photo request as helping the dental team put together an accurate assessment for them, never as a bureaucratic requirement.

Behavioral rules: ask only one question per message. Keep every reply to two or three short sentences. Never use markdown tables or bullet or numbered lists — write in plain conversational prose throughout. Never try to convince the patient to book or close, and never push — your role stops at building interest and gathering information. Once you have their name, contact info, and main concern, and ideally a photo, warmly close by letting them know the team will review their case and follow up, and stop actively asking questions from there.`;

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const { data: history, error: historyError } = await supabaseServer
    .from("conversations")
    .select("role, content")
    .eq("tenant_id", TENANT_ID)
    .eq("session_id", SESSION_ID)
    .order("created_at", { ascending: true });

  if (historyError) {
    console.error("Failed to fetch conversation history from Supabase:", historyError);
  }

  const priorMessages: Anthropic.MessageParam[] = (history ?? []).map((row) => ({
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
  }));

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [...priorMessages, { role: "user", content: message }],
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
    { tenant_id: TENANT_ID, session_id: SESSION_ID, role: "user", content: message },
    { tenant_id: TENANT_ID, session_id: SESSION_ID, role: "assistant", content: reply },
  ]);

  if (error) {
    console.error("Failed to save conversation to Supabase:", error);
  }

  return NextResponse.json({ reply });
}
