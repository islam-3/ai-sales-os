import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { KnowledgeEntry } from "@/lib/knowledge-base";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { KnowledgeBaseManager } from "@/components/dashboard/settings/KnowledgeBaseManager";

// Always fetch fresh — content edited here should be immediately visible,
// same reasoning as the leads dashboard.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await getCurrentTenant();

  // middleware.ts already keeps signed-out visitors away from /dashboard;
  // this only fires if the session is somehow missing its tenant.
  if (!context) {
    return (
      <DashboardMessage>
        We couldn&apos;t find a clinic for your account. Please log in again.
      </DashboardMessage>
    );
  }

  const { supabase, tenantId, businessName } = context;

  const { data: rows, error } = await supabase
    .from("knowledge_base")
    .select(
      "id, category, content, embedding, created_at, knowledge_base_media(id, media_url, media_type, created_at)"
    )
    .eq("tenant_id", tenantId)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });

  const entries: KnowledgeEntry[] = (rows ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    content: row.content,
    hasEmbedding: row.embedding !== null,
    media: (row.knowledge_base_media ?? [])
      .filter((m) => m.media_type === "image" || m.media_type === "video")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        id: m.id,
        url: m.media_url,
        type: m.media_type as "image" | "video",
      })),
    created_at: row.created_at,
  }));

  return (
    <DashboardShell
      clinicName={businessName}
      title={
        <>
          Knowledge Base{" "}
          <span className="font-normal text-muted-foreground">({entries.length})</span>
        </>
      }
      description="Facts about the clinic your chat assistant can draw on when talking to leads."
    >
      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-card-p text-sm text-destructive">
          Failed to load knowledge base: {error.message}
        </p>
      ) : (
        <KnowledgeBaseManager entries={entries} />
      )}
    </DashboardShell>
  );
}
