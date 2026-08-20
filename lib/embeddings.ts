import { openai } from "@/lib/openai";
import { recordUsage } from "@/lib/usage";

export const EMBEDDING_MODEL = "text-embedding-3-small";

// Generates an OpenAI embedding vector for a piece of text. Shared by the
// one-time backfill script (scripts/embed-knowledge-base.ts) and the
// settings page's create/update actions, so a knowledge_base entry is
// always embedded the same way regardless of where the write comes from.
//
// `tenantId` is optional purely so the backfill script — which runs
// outside any request and has no Supabase session — can keep calling this
// unchanged. When it's supplied the call is recorded as spend; when it
// isn't, the embedding still happens, it just isn't attributed.
export async function generateEmbedding(text: string, tenantId?: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });

  if (tenantId) {
    // Not awaited — an owner saving a knowledge entry shouldn't wait on
    // bookkeeping, and recordUsage never rejects.
    void recordUsage({
      tenantId,
      sessionId: null,
      callType: "knowledge_embedding",
      provider: "openai",
      model: EMBEDDING_MODEL,
      tokens: { inputTokens: response.usage?.prompt_tokens ?? 0 },
    });
  }

  return response.data[0].embedding;
}
