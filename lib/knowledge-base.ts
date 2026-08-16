export type MediaType = "image" | "video";

export type KnowledgeMedia = {
  id: string;
  url: string;
  type: MediaType;
};

export type KnowledgeEntry = {
  id: string;
  category: string | null;
  content: string;
  hasEmbedding: boolean;
  media: KnowledgeMedia[];
  created_at: string;
};
