"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { generateEmbedding } from "@/lib/embeddings";
import { TENANT_ID } from "@/lib/constants";

export type SaveResult = {
  ok: true;
  // True when the row was saved but the embedding call failed — the
  // content is safe, but it won't be found by chat's RAG retrieval until
  // it's successfully re-indexed (either by editing again once the
  // embedding API is healthy, or via npm run embed-knowledge-base).
  embeddingFailed: boolean;
};

export async function createKnowledgeEntry(content: string, category: string): Promise<SaveResult> {
  const trimmedContent = content.trim();
  const trimmedCategory = category.trim();

  if (!trimmedContent) throw new Error("Content is required");
  if (!trimmedCategory) throw new Error("Category is required");

  let embedding: number[] | null = null;
  let embeddingFailed = false;
  try {
    embedding = await generateEmbedding(trimmedContent);
  } catch (err) {
    console.error("Failed to generate embedding for new knowledge_base entry:", err);
    embeddingFailed = true;
  }

  const { error } = await supabaseServer.from("knowledge_base").insert({
    tenant_id: TENANT_ID,
    content: trimmedContent,
    category: trimmedCategory,
    embedding,
  });

  if (error) {
    console.error("Failed to create knowledge_base entry:", error);
    throw new Error("Failed to save entry");
  }

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}

export async function updateKnowledgeEntry(
  id: string,
  content: string,
  category: string
): Promise<SaveResult> {
  const trimmedContent = content.trim();
  const trimmedCategory = category.trim();

  if (!trimmedContent) throw new Error("Content is required");
  if (!trimmedCategory) throw new Error("Category is required");

  const updates: Record<string, unknown> = {
    content: trimmedContent,
    category: trimmedCategory,
  };

  let embeddingFailed = false;
  try {
    updates.embedding = await generateEmbedding(trimmedContent);
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
