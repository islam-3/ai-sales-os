import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { TENANT_ID, isValidSessionId } from "@/lib/constants";

const BUCKET = "lead-attachments";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const sessionId = formData.get("sessionId");

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${TENANT_ID}/${sessionId}/${Date.now()}-${safeName}`;

  const { error } = await supabaseServer.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    console.error("Failed to upload photo to Supabase Storage:", error);
    return NextResponse.json({ error: "Failed to upload photo" }, { status: 500 });
  }

  return NextResponse.json({ path });
}
