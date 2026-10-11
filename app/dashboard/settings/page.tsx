import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { KnowledgeEntry } from "@/lib/knowledge-base";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { KnowledgeBaseManager } from "@/components/dashboard/settings/KnowledgeBaseManager";
import { GuidedQuestionsCard } from "@/components/dashboard/settings/GuidedQuestionsCard";
import { guidedProgress, type GuidedEntry } from "@/lib/guided-progress";
import { packForIndustry, questionsFor } from "@/lib/guided-questions";
import { parseTenantSettings } from "@/lib/tenant-settings";
import { recordIndustryPackGap } from "./actions";

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
        We couldn&apos;t find a business for your account. Please log in again.
      </DashboardMessage>
    );
  }

  const { supabase, tenantId, businessName } = context;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("industry, settings")
    .eq("id", tenantId)
    .maybeSingle();

  // Noted so the next pack is chosen from what businesses actually
  // signed up as, rather than from a guess. Not awaited into the render:
  // it is bookkeeping, and a visitor to this page should never wait on
  // it or see it fail.
  void recordIndustryPackGap();

  const { data: rows, error } = await supabase
    .from("knowledge_base")
    .select(
      "id, title, category, content, embedding, created_at, question_key, answer_kind"
    )
    .eq("tenant_id", tenantId)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });

  const entries: KnowledgeEntry[] = (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "",
    category: row.category,
    content: row.content,
    hasEmbedding: row.embedding !== null,
    created_at: row.created_at,
  }));

  const settings = parseTenantSettings(tenant?.settings);
  const industry = tenant?.industry ?? null;
  const pack = packForIndustry(industry);

  const guidedEntries: GuidedEntry[] = (rows ?? [])
    .filter((row) => !!row.question_key && !!row.answer_kind)
    .map((row) => ({
      id: row.id,
      questionKey: row.question_key as string,
      category: row.category,
      answerKind: row.answer_kind as GuidedEntry["answerKind"],
      content: row.content,
    }));

  const categories: string[] = [];
  for (const row of rows ?? []) {
    const c = (row.category ?? "").trim();
    if (c && !categories.includes(c)) categories.push(c);
  }

  const progress = guidedProgress(
    questionsFor(industry),
    guidedEntries,
    settings.guided?.declined ?? {},
    categories
  );

  return (
    <DashboardShell
      businessName={businessName}
      title={
        <>
          Knowledge Base{" "}
          <span className="font-normal text-muted-foreground">({entries.length})</span>
        </>
      }
      description="Facts about your business your chat assistant can draw on when talking to leads."
    >
      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-card-p text-sm text-destructive">
          Failed to load knowledge base: {error.message}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <GuidedQuestionsCard
            progress={progress.questions}
            resolved={progress.resolved}
            total={progress.total}
            categories={categories}
            packLabel={pack?.label ?? null}
          />
          <KnowledgeBaseManager entries={entries} />
        </div>
      )}
    </DashboardShell>
  );
}
