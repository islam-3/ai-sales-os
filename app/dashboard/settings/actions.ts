"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { generateEmbedding } from "@/lib/embeddings";
import { TITLE_MAX_LENGTH, embeddingTextFor } from "@/lib/knowledge-base";

export type SaveResult = {
  ok: true;
  // True when the row was saved but the embedding call failed — the
  // content is safe, but it won't be found by chat's RAG retrieval until
  // it's successfully re-indexed (either by editing again once the
  // embedding API is healthy, or via npm run embed-knowledge-base).
  embeddingFailed: boolean;
};

// Knowledge entries no longer carry uploaded files. Image sending was
// removed from the chat, and the upload went with it rather than being
// left in place: a business uploading twenty before-and-after photos and
// then watching the assistant never share them is a false expectation,
// and a dead path nobody exercises is how an empty test tenant went
// unnoticed for days.
//
// Visitor uploads in the chat are a DIFFERENT path and are untouched -
// see app/api/upload/route.ts and the lead-attachments bucket.

// Required for new entries: an optional title would sit blank on most
// rows, which puts the list straight back to guessing a heading from the
// content and denies the model the label it benefits from. Length is
// capped because a title is a one-line label, not a sentence.
function readTitle(formData: FormData): string {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required");
  if (title.length > TITLE_MAX_LENGTH) {
    throw new Error(`Title must be ${TITLE_MAX_LENGTH} characters or fewer`);
  }
  return title;
}

export async function createKnowledgeEntry(formData: FormData): Promise<SaveResult> {
  const title = readTitle(formData);
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!content) throw new Error("Content is required");
  if (!category) throw new Error("Category is required");

  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  let embedding: number[] | null = null;
  let embeddingFailed = false;
  try {
    embedding = await generateEmbedding(embeddingTextFor({ title, content }), tenantId);
  } catch (err) {
    console.error("Failed to generate embedding for new knowledge_base entry:", err);
    embeddingFailed = true;
  }

  const { data: inserted, error } = await supabase
    .from("knowledge_base")
    .insert({ tenant_id: tenantId, title, content, category, embedding })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("Failed to create knowledge_base entry:", error);
    throw new Error("Failed to save entry");
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}

export async function updateKnowledgeEntry(id: string, formData: FormData): Promise<SaveResult> {
  const title = readTitle(formData);
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!content) throw new Error("Content is required");
  if (!category) throw new Error("Category is required");

  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const updates: Record<string, unknown> = { title, content, category };

  let embeddingFailed = false;
  try {
    // Embedded text includes the title, so a title-only edit still has to
    // re-embed or the vector would describe the previous label.
    updates.embedding = await generateEmbedding(embeddingTextFor({ title, content }), tenantId);
  } catch (err) {
    console.error("Failed to generate embedding for updated knowledge_base entry:", err);
    embeddingFailed = true;
    // Deliberately omit `embedding` from `updates` so a transient API
    // failure doesn't wipe out a previously-good vector — the old
    // embedding (now stale relative to the new text) stays in place
    // until a save succeeds or the backfill script re-runs.
  }

  const { error } = await supabase
    .from("knowledge_base")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to update knowledge_base entry:", error);
    throw new Error("Failed to save entry");
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}


export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("knowledge_base")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to delete knowledge_base entry:", error);
    throw new Error("Failed to delete entry");
  }

  revalidatePath("/dashboard/settings");
}
