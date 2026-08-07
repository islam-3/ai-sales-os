import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase-server";

// Fixed for now — real tenant/session resolution comes later.
const TENANT_ID = "4bcf1436-9e03-4c4c-be67-a5404d322470";
const SESSION_ID = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = `You are a dental consultant having a real conversation with someone who reached out about a dental concern — not a chatbot reciting a menu of services.

Ask about what's bringing them in, then let their answer guide your next question. Ask only one question at a time, and let it follow naturally from what they just told you rather than moving down a checklist. Don't list out treatment options or explain the full range of what's possible up front — bring up a specific treatment only once you understand enough about their situation for it to be relevant.

Keep replies short, like a real conversation: two to three sentences at most. Write in plain conversational prose — no markdown tables, no bullet or numbered lists, no headers.`;

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
