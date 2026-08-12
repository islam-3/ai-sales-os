"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { generateEmbedding } from "@/lib/embeddings";
import { TENANT_ID } from "@/lib/constants";
import type { MediaType } from "@/lib/knowledge-base";

export type SaveResult = {
  ok: true;
  // True when the row was saved but the embedding call failed — the
  // content is safe, but it won't be found by chat's RAG retrieval until
  // it's successfully re-indexed (either by editing again once the
  // embedding API is healthy, or via npm run embed-knowledge-base).
  embeddingFailed: boolean;
};

const MEDIA_BUCKET = "business-media";
// Matches next.config.mjs's experimental.serverActions.bodySizeLimit — keep
// these in sync so a too-large file fails with our message, not a generic
// framework error.
const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

function detectMediaType(mimeType: string): MediaType | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return null;
}

// Uploads a knowledge_base media file to Storage under
// {tenant_id}/{category}/{timestamp}-{filename} and returns its public URL
// plus detected type. Throws (rather than swallowing, unlike the embedding
// helper below) because the user explicitly chose this file — silently
// dropping it would be a worse experience than a visible error to retry.
async function uploadKnowledgeMedia(
  file: File,
  category: string
): Promise<{ url: string; type: MediaType }> {
  const mediaType = detectMediaType(file.type);
  if (!mediaType) {
    throw new Error("Only image or video files are supported for media attachments.");
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error("That file is too large — please keep media under 20MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  const safeCategory = (category || "uncategorized").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${TENANT_ID}/${safeCategory}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseServer.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("Failed to upload knowledge_base media:", uploadError);
    throw new Error("Failed to upload the file. Please try again.");
  }

  const { data } = supabaseServer.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, type: mediaType };
}

export async function createKnowledgeEntry(formData: FormData): Promise<SaveResult> {
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!content) throw new Error("Content is required");
  if (!category) throw new Error("Category is required");

  let mediaUrl: string | null = null;
  let mediaType: MediaType | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadKnowledgeMedia(file, category);
    mediaUrl = uploaded.url;
    mediaType = uploaded.type;
  }

  let embedding: number[] | null = null;
  let embeddingFailed = false;
  try {
    embedding = await generateEmbedding(content);
  } catch (err) {
    console.error("Failed to generate embedding for new knowledge_base entry:", err);
    embeddingFailed = true;
  }

  const { error } = await supabaseServer.from("knowledge_base").insert({
    tenant_id: TENANT_ID,
    content,
    category,
    embedding,
    media_url: mediaUrl,
    media_type: mediaType,
  });

  if (error) {
    console.error("Failed to create knowledge_base entry:", error);
    throw new Error("Failed to save entry");
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}

export async function updateKnowledgeEntry(id: string, formData: FormData): Promise<SaveResult> {
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!content) throw new Error("Content is required");
  if (!category) throw new Error("Category is required");

  const updates: Record<string, unknown> = { content, category };

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const uploaded = await uploadKnowledgeMedia(file, category);
    updates.media_url = uploaded.url;
    updates.media_type = uploaded.type;
  } else if (formData.get("removeMedia") === "1") {
    updates.media_url = null;
    updates.media_type = null;
  }
  // Otherwise leave media_url/media_type untouched entirely — editing the
  // text shouldn't drop an existing attachment.

  let embeddingFailed = false;
  try {
    updates.embedding = await generateEmbedding(content);
  } catch (err) {
    console.error("Failed to generate embedding for updated knowledge_base entry:", err);
    embeddingFailed = true;
    // Deliberately omit `embedding` from `updates` so a transient API
    // failure doesn't wipe out a previously-good vector — the old
    // embedding (now stale relative to the new text) stays in place
    // until a save succeeds or the backfill script re-runs.
  }

  const { error } = await supabaseServer
    .from("knowledge_base")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", TENANT_ID);

  if (error) {
    console.error("Failed to update knowledge_base entry:", error);
    throw new Error("Failed to save entry");
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const { error } = await supabaseServer
    .from("knowledge_base")
    .delete()
    .eq("id", id)
    .eq("tenant_id", TENANT_ID);

  if (error) {
    console.error("Failed to delete knowledge_base entry:", error);
    throw new Error("Failed to delete entry");
  }

  revalidatePath("/dashboard/settings");
}
