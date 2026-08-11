import { supabaseServer } from "@/lib/supabase-server";
import { TENANT_ID } from "@/lib/constants";
import { KnowledgeEntry } from "@/lib/knowledge-base";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { KnowledgeBaseManager } from "@/components/dashboard/settings/KnowledgeBaseManager";

// Always fetch fresh — content edited here should be immediately visible,
// same reasoning as the leads dashboard.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [{ data: tenant }, { data: rows, error }] = await Promise.all([
    supabaseServer.from("tenants").select("business_name").eq("id", TENANT_ID).maybeSingle(),
    supabaseServer
      .from("knowledge_base")
      .select("id, category, content, embedding, created_at")
      .eq("tenant_id", TENANT_ID)
      .order("category", { ascending: true })
      .order("created_at", { ascending: false }),
  ]);

  const clinicName = tenant?.business_name || "Dental Clinic CRM";

  const entries: KnowledgeEntry[] = (rows ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    content: row.content,
    hasEmbedding: row.embedding !== null,
    created_at: row.created_at,
  }));

  return (
    <div className="dark min-h-screen bg-background">
      <DashboardHeader clinicName={clinicName} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Knowledge Base{" "}
            <span className="font-medium text-muted-foreground">({entries.length})</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Facts about the clinic your chat assistant can draw on when talking to leads.
          </p>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            Failed to load knowledge base: {error.message}
          </p>
        ) : (
          <KnowledgeBaseManager entries={entries} />
        )}
      </main>
    </div>
  );
}
