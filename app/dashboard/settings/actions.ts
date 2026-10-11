"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { generateEmbedding } from "@/lib/embeddings";
import { TITLE_MAX_LENGTH, embeddingTextFor } from "@/lib/knowledge-base";
import { type SessionClient } from "@/lib/supabase-session";
import { packForIndustry, questionByKey } from "@/lib/guided-questions";
import { classifyModelError } from "@/lib/model-errors";

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

// ─────────────────────────────────────────────────────────────────────
// Guided data entry
//
// An answer is an ordinary knowledge_base row — same table, same
// embedding, same prompt path. That is the whole integration: nothing
// new to retrieve from, and an answer written here is indistinguishable
// to the assistant from one typed freehand.
//
// What distinguishes them is two columns set explicitly when the owner
// acts: which question it answers, and how it came to exist. Neither is
// ever derived by reading the text.
// ─────────────────────────────────────────────────────────────────────

/**
 * Saves one answer, as a knowledge entry.
 *
 * `category` null means it applies whatever the customer asks about,
 * which is an explicit choice rather than the default — a warranty
 * answered in dental terms must not be served to a hair-transplant
 * visitor as fact.
 *
 * Re-saving the same question for the same category replaces that
 * answer. A DIFFERENT category creates another row, because the same
 * question genuinely has different answers per service line.
 */
export async function saveGuidedAnswer(input: {
  questionKey: string;
  category: string | null;
  content: string;
  /** Set when the owner picked a defined "we don't offer this" sentence. */
  notOffered?: boolean;
}): Promise<{ ok: boolean; error?: string; embeddingFailed?: boolean }> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const content = input.content.trim();
  if (!content) return { ok: false, error: "Write an answer first, or choose one of the options." };

  const { data: tenant } = await supabase
    .from("tenants").select("industry").eq("id", tenantId).maybeSingle();
  const question = questionByKey(input.questionKey, tenant?.industry ?? null);
  if (!question) return { ok: false, error: "That question no longer exists." };

  // The title is the question. embeddingTextFor puts it in front of the
  // body, so a visitor asking "what's the warranty" matches an entry
  // titled "Guarantee and cover" on the title alone — which is exactly
  // the signal semantic search wants.
  const title = input.category
    ? `${question.entryTitle} — ${input.category}`
    : question.entryTitle;

  const existing = await findGuidedEntry(supabase, tenantId, input.questionKey, input.category);

  let embedding: number[] | null = null;
  let embeddingFailed = false;
  try {
    embedding = await generateEmbedding(embeddingTextFor({ title, content }));
  } catch (err) {
    // The row is worth saving without it. An unembedded entry still
    // reaches the prompt through the category dump; it only misses
    // similarity ranking, and scripts/embed-knowledge-base.ts backfills.
    console.error("Failed to embed a guided answer:", classifyModelError(err).detail);
    embeddingFailed = true;
  }

  const row = {
    tenant_id: tenantId,
    title,
    content,
    category: input.category,
    question_key: input.questionKey,
    answer_kind: input.notOffered ? "not_offered" : "answered",
    ...(embedding ? { embedding } : {}),
  };

  const { error } = existing
    ? await supabase.from("knowledge_base").update(row).eq("id", existing.id)
    : await supabase.from("knowledge_base").insert(row);

  if (error) {
    console.error("Failed to save a guided answer:", error);
    return { ok: false, error: "Could not save. Nothing was changed." };
  }

  // Answering clears any earlier decline for the same scope: the thing
  // they wrote is the truth.
  await setDecline(supabase, tenantId, input.questionKey, input.category, false);

  revalidatePath("/dashboard/settings");
  return { ok: true, embeddingFailed };
}

/**
 * Records that the owner would rather not answer.
 *
 * Writes NOTHING to the knowledge base. That is the point: "prefer not
 * to say" has to leave the assistant with nothing at all, because a row
 * saying the business declined to comment would be read out to a
 * customer — worse than the silence they asked for.
 */
export async function declineGuidedQuestion(input: {
  questionKey: string;
  category: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const ok = await setDecline(supabase, tenantId, input.questionKey, input.category, true);
  if (!ok) return { ok: false, error: "Could not save. Nothing was changed." };

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/**
 * Ties an entry the owner already had to a question.
 *
 * The honest answer to "is this already covered?". Embeddings can ORDER
 * their existing entries by how close each is to the question, which is
 * what semantic similarity is actually good for; they cannot decide that
 * one answers it. So the owner decides and the decision is stored.
 */
export async function markGuidedQuestionCovered(input: {
  questionKey: string;
  entryId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("knowledge_base")
    .update({ question_key: input.questionKey, answer_kind: "existing" })
    .eq("id", input.entryId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("Failed to mark a question covered:", error);
    return { ok: false, error: "Could not save. Nothing was changed." };
  }

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

/** Undoes any of the above for one question and category. */
export async function clearGuidedAnswer(input: {
  questionKey: string;
  category: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const existing = await findGuidedEntry(supabase, tenantId, input.questionKey, input.category);
  if (existing) {
    // An entry the owner already had is UNTIED, not deleted — it was
    // their content before this feature existed and still is.
    const { error } =
      existing.answer_kind === "existing"
        ? await supabase
            .from("knowledge_base")
            .update({ question_key: null, answer_kind: null })
            .eq("id", existing.id)
        : await supabase.from("knowledge_base").delete().eq("id", existing.id);
    if (error) {
      console.error("Failed to clear a guided answer:", error);
      return { ok: false, error: "Could not save. Nothing was changed." };
    }
  }

  await setDecline(supabase, tenantId, input.questionKey, input.category, false);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

async function findGuidedEntry(
  supabase: SessionClient,
  tenantId: string,
  questionKey: string,
  category: string | null
): Promise<{ id: string; answer_kind: string | null } | null> {
  const query = supabase
    .from("knowledge_base")
    .select("id, answer_kind")
    .eq("tenant_id", tenantId)
    .eq("question_key", questionKey);
  const { data } = category === null
    ? await query.is("category", null)
    : await query.eq("category", category);
  return (data ?? [])[0] ?? null;
}

/** Adds or removes one decline, leaving every other one alone. */
async function setDecline(
  supabase: SessionClient,
  tenantId: string,
  questionKey: string,
  category: string | null,
  declined: boolean
): Promise<boolean> {
  const { data } = await supabase
    .from("tenants").select("settings").eq("id", tenantId).maybeSingle();
  const raw = (data?.settings ?? {}) as Record<string, unknown>;
  const guided = { ...((raw.guided ?? {}) as Record<string, unknown>) };
  const all = { ...((guided.declined ?? {}) as Record<string, (string | null)[]>) };

  const same = (a: string | null, b: string | null) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  const current = (all[questionKey] ?? []).filter((c) => !same(c, category));

  if (declined) current.push(category);
  if (current.length > 0) all[questionKey] = current;
  else delete all[questionKey];

  guided.declined = all;

  const { error } = await supabase
    .from("tenants")
    .update({ settings: { ...raw, guided } })
    .eq("id", tenantId);
  if (error) {
    console.error("Failed to record a guided decline:", error);
    return false;
  }
  return true;
}

/**
 * Notes that this tenant's industry has no pack.
 *
 * So the next pack is chosen from what businesses actually signed up as,
 * rather than from a guess. Written once and cleared the moment a pack
 * does cover them, so the list stays a list of real gaps.
 */
export async function recordIndustryPackGap(): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data } = await supabase
    .from("tenants").select("industry, settings").eq("id", tenantId).maybeSingle();
  if (!data) return;

  const industry = (data.industry ?? "").trim();
  const raw = (data.settings ?? {}) as Record<string, unknown>;
  const guided = { ...((raw.guided ?? {}) as Record<string, unknown>) };
  const covered = !!packForIndustry(industry);
  const recorded = typeof guided.noPackFor === "string" ? guided.noPackFor : null;

  // Nothing to do when the record already says the right thing.
  if (covered ? recorded === null : recorded === industry) return;

  if (covered || !industry) delete guided.noPackFor;
  else guided.noPackFor = industry;

  const { error } = await supabase
    .from("tenants")
    .update({ settings: { ...raw, guided } })
    .eq("id", tenantId);
  if (error) console.error("Failed to record an industry pack gap:", error);
}
