import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { supabaseServer } from "@/lib/supabase-server";

// Fixed for now — real tenant/session resolution comes later.
const TENANT_ID = "4bcf1436-9e03-4c4c-be67-a5404d322470";
const SESSION_ID = "00000000-0000-0000-0000-000000000001";

const SYSTEM_PROMPT = "You are a helpful dental clinic sales assistant.";

export async function POST(req: NextRequest) {
  const { message } = await req.json();

  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
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
