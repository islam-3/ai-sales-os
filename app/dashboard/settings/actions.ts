"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { type SessionClient } from "@/lib/supabase-session";
import { generateEmbedding } from "@/lib/embeddings";
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

// Uploads one knowledge_base media file to Storage under
// {tenant_id}/{category}/{timestamp}-{filename} and returns its public URL
// plus detected type.
//
// Deliberately still uses supabaseServer (service_role), NOT the session
// client, even though this file otherwise switched to the session client
// for RLS enforcement: Storage access is governed by its own policy
// system on storage.objects, entirely separate from the public.* RLS
// policies added in this project so far. No Storage policies exist yet
// for the business-media bucket, so switching this call to the anon
// client would just break every upload/delete with a permission error —
// a regression, not a security fix. Worth adding Storage policies as a
// follow-up for full parity; intentionally out of scope here.
async function uploadKnowledgeMedia(
  file: File,
  category: string,
  tenantId: string
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
  const path = `${tenantId}/${safeCategory}/${Date.now()}-${safeName}`;

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

// Uploads every file attached under the "files" field (there can be zero,
// one, or many — the form input has the `multiple` attribute). Uploads run
// before any database write, so a failed upload never leaves a half-saved
// entry behind.
async function uploadAllKnowledgeMedia(
  formData: FormData,
  category: string,
  tenantId: string
): Promise<{ url: string; type: MediaType }[]> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  return Promise.all(files.map((file) => uploadKnowledgeMedia(file, category, tenantId)));
}

// Inserts one knowledge_base_media row per uploaded file for the given
// entry, via the session client so — unlike the Storage upload above —
// this write is subject to RLS like every other table access in this
// file. The entry's own content is already saved by the time this runs,
// so a failure here is reported but doesn't undo that save.
async function attachMedia(
  supabase: SessionClient,
  tenantId: string,
  knowledgeBaseId: string,
  uploaded: { url: string; type: MediaType }[]
): Promise<void> {
  if (uploaded.length === 0) return;

  const { error } = await supabase.from("knowledge_base_media").insert(
    uploaded.map((u) => ({
      tenant_id: tenantId,
      knowledge_base_id: knowledgeBaseId,
      media_url: u.url,
      media_type: u.type,
    }))
  );

  if (error) {
    console.error("Failed to save uploaded media rows:", error);
    throw new Error(
      "Saved, but attaching the uploaded media failed. Please try attaching it again."
    );
  }
}

// Extracts the Storage object path from a Supabase public URL, e.g.
// ".../object/public/business-media/<tenant>/<category>/<file>" -> the
// part after the bucket name. Returns null for a URL that doesn't match
// the expected shape, so callers can skip cleanup rather than throw.
function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

export async function createKnowledgeEntry(formData: FormData): Promise<SaveResult> {
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!content) throw new Error("Content is required");
  if (!category) throw new Error("Category is required");

  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const uploaded = await uploadAllKnowledgeMedia(formData, category, tenantId);

  let embedding: number[] | null = null;
  let embeddingFailed = false;
  try {
    embedding = await generateEmbedding(content);
  } catch (err) {
    console.error("Failed to generate embedding for new knowledge_base entry:", err);
    embeddingFailed = true;
  }

  const { data: inserted, error } = await supabase
    .from("knowledge_base")
    .insert({ tenant_id: tenantId, content, category, embedding })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("Failed to create knowledge_base entry:", error);
    throw new Error("Failed to save entry");
  }

  await attachMedia(supabase, tenantId, inserted.id, uploaded);

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}

export async function updateKnowledgeEntry(id: string, formData: FormData): Promise<SaveResult> {
  const content = String(formData.get("content") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (!content) throw new Error("Content is required");
  if (!category) throw new Error("Category is required");

  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const uploaded = await uploadAllKnowledgeMedia(formData, category, tenantId);

  const updates: Record<string, unknown> = { content, category };

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

  const { error } = await supabase
    .from("knowledge_base")
    .update(updates)
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to update knowledge_base entry:", error);
    throw new Error("Failed to save entry");
  }

  await attachMedia(supabase, tenantId, id, uploaded);

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}

// Removes a single attached media file — both its knowledge_base_media row
// and, best-effort, the underlying Storage object. Scoped to this tenant so
// a media id from another tenant can never be touched (RLS enforces this
// on the table row regardless; the explicit tenant_id filter is
// defense-in-depth). An entry can have any number of these removed
// independently of editing its text.
export async function removeKnowledgeMedia(mediaId: string): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { data: media, error: fetchError } = await supabase
    .from("knowledge_base_media")
    .select("id, media_url")
    .eq("id", mediaId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (fetchError || !media) {
    console.error("Failed to look up knowledge_base_media row to remove:", fetchError);
    throw new Error("Failed to remove media");
  }

  const path = storagePathFromPublicUrl(media.media_url);
  if (path) {
    // Storage stays on supabaseServer — see the note on uploadKnowledgeMedia.
    const { error: storageError } = await supabaseServer.storage.from(MEDIA_BUCKET).remove([path]);
    if (storageError) {
      // Not fatal — an orphaned file in Storage is a cleanup nuisance, not
      // data loss. Still remove the DB row so the UI reflects the change.
      console.error("Failed to remove media file from Storage:", storageError);
    }
  }

  const { error: deleteError } = await supabase
    .from("knowledge_base_media")
    .delete()
    .eq("id", mediaId)
    .eq("tenant_id", tenantId);

  if (deleteError) {
    console.error("Failed to delete knowledge_base_media row:", deleteError);
    throw new Error("Failed to remove media");
  }

  revalidatePath("/dashboard/settings");
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  // Best-effort cleanup of this entry's Storage objects before the row (and
  // its knowledge_base_media rows, via ON DELETE CASCADE) disappears —
  // otherwise those files would be orphaned in the bucket forever.
  const { data: media } = await supabase
    .from("knowledge_base_media")
    .select("media_url")
    .eq("knowledge_base_id", id)
    .eq("tenant_id", tenantId);

  const paths = (media ?? [])
    .map((m) => storagePathFromPublicUrl(m.media_url))
    .filter((p): p is string => p !== null);

  if (paths.length > 0) {
    // Storage stays on supabaseServer — see the note on uploadKnowledgeMedia.
    const { error: storageError } = await supabaseServer.storage.from(MEDIA_BUCKET).remove(paths);
    if (storageError) {
      console.error("Failed to remove media files from Storage during entry delete:", storageError);
      // Not fatal — proceed with deleting the entry either way.
    }
  }

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
