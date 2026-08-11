export type KnowledgeEntry = {
  id: string;
  category: string | null;
  content: string;
  hasEmbedding: boolean;
  created_at: string;
};
