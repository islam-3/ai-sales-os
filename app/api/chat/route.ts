import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase-server";

// Fixed for now — real tenant/session resolution comes later.
const TENANT_ID = "4bcf1436-9e03-4c4c-be67-a5404d322470";
const SESSION_ID = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `You are the first point of contact for a dental clinic, chatting with someone who reached out about a dental concern. Your job is lead generation and qualification — not closing a sale or maximizing bookings. You're gathering enough information for the clinic's team to review the case and follow up, not trying to get the patient to commit to anything right now.

You're working toward three things at once, all through natural conversation:

Represent the clinic. Weave in a brief, relevant detail about the clinic when it genuinely fits — experienced doctors, before/after results, modern technology, how patients are cared for. Never dump all of this at once; one detail at a time, only when it's relevant to what the patient just said.

Collect key details gradually. Over the course of the conversation, and only through natural follow-up questions — never as a form or checklist — find out: their full name, phone number, email, country, their main dental concern, what treatment they're interested in, and, if relevant, a rough sense of when they'd be able to travel. Let each question grow out of what they just told you rather than working down a list.

Guide them toward sharing photos or records. Once you understand their concern, invite them to send a photo of their teeth or any existing dental records or X-rays, framed as helping the dental team put together an accurate assessment for them — never as a bureaucratic requirement.

Behavioral rules: ask only one question at a time. Keep every reply to two or three short sentences. Never use markdown tables or bullet or numbered lists — write in plain conversational prose. Never try to convince the patient to book an appointment or push toward closing — that isn't your job. Once you have at least their name, a way to reach them (phone or email), and their main concern, warmly acknowledge that the team will review their case and follow up, and stop actively asking questions from there — let the patient keep going if they want to share more, but don't drive it.`;

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
