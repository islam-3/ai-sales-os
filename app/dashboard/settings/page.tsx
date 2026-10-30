import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { KnowledgeEntry } from "@/lib/knowledge-base";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { KnowledgeBaseManager } from "@/components/dashboard/settings/KnowledgeBaseManager";
import { groupAsks, activeGroups, type UnansweredAsk } from "@/lib/unanswered-questions";
import { remainingStarters } from "@/lib/starter-questions";
import { parseTenantSettings } from "@/lib/tenant-settings";

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

  const [
    { data: rows, error },
    { data: askRows, error: askError },
    { data: tenantRow },
  ] = await Promise.all([
    supabase
      .from("knowledge_base")
      .select("id, title, category, content, embedding, created_at, question_key")
      .eq("tenant_id", tenantId)
      .order("category", { ascending: true })
      .order("created_at", { ascending: false }),
    // The embedding column is deliberately NOT selected. Grouping was
    // decided at capture time and stored as group_id; re-deriving it
    // here would mean shipping 1,536 floats per ask to a page that only
    // renders text, and would let a threshold change silently re-form
    // groups an owner has already dismissed.
    supabase
      .from("unanswered_questions")
      .select("id, session_id, asked_at, question_raw, question_short, script, group_id, dismissed_at")
      .eq("tenant_id", tenantId)
      .order("asked_at", { ascending: true }),
    // Only for the dismissed starters. A failed read shows all four,
    // which is the harmless direction.
    supabase.from("tenants").select("settings").eq("id", tenantId).maybeSingle(),
  ]);

  const entries: KnowledgeEntry[] = (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "",
    category: row.category,
    content: row.content,
    hasEmbedding: row.embedding !== null,
    created_at: row.created_at,
  }));

  if (askError) {
    // Not fatal, and not silent. The knowledge base is the page; this
    // list is the prompt above it, and losing the prompt must not lose
    // the page.
    console.error("Failed to load captured questions:", askError);
  }

  const asks: UnansweredAsk[] = (askRows ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    askedAt: row.asked_at,
    questionRaw: row.question_raw,
    questionShort: row.question_short,
    script: row.script,
    embedding: null,
    groupId: row.group_id,
    dismissedAt: row.dismissed_at,
  }));

  const active = activeGroups(asks);
  // Dismissed and not yet back. Shown collapsed at the foot of the page
  // so an accidental dismissal is recoverable.
  const dismissed = groupAsks(asks).filter((g) => g.dismissedAt !== null && !g.returned);

  // Suggestions, only while no real question has ever been captured —
  // including dismissed ones, because a tenant whose owner has dismissed
  // questions is not a tenant that needs starter suggestions.
  const starters = remainingStarters(
    (rows ?? []).map((r) => r.question_key).filter((k): k is string => !!k),
    asks.length,
    parseTenantSettings(tenantRow?.settings).dismissed_starters ?? []
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
        <KnowledgeBaseManager
          entries={entries}
          unanswered={active}
          dismissed={dismissed}
          starters={starters}
        />
      )}
    </DashboardShell>
  );
}
