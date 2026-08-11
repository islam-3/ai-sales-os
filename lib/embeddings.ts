import { openai } from "@/lib/openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";

// Generates an OpenAI embedding vector for a piece of text. Shared by the
// one-time backfill script (scripts/embed-knowledge-base.ts) and the
// settings page's create/update actions, so a knowledge_base entry is
// always embedded the same way regardless of where the write comes from.
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}
