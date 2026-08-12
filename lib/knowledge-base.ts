export type MediaType = "image" | "video";

export type KnowledgeEntry = {
  id: string;
  category: string | null;
  content: string;
  hasEmbedding: boolean;
  mediaUrl: string | null;
  mediaType: MediaType | null;
  created_at: string;
};
