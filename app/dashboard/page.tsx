import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { computeKpis, getTopFrequent, LeadProfile } from "@/lib/dashboard";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { ChatLinkCard } from "@/components/dashboard/ChatLinkCard";
import { StatCards } from "@/components/dashboard/StatCards";
import { InsightsSection } from "@/components/dashboard/InsightsSection";
import { LeadsSection } from "@/components/dashboard/LeadsSection";

// Always fetch fresh — this is a live CRM view, not something to cache,
// and it needs to reflect status updates right after they happen.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
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

  const { supabase, tenantId, businessName, slug } = context;

  const { data: leadData, error } = await supabase
    .from("lead_profile")
    .select(
      "id, name, contact_info, status, created_at, ai_summary, qualification_score, qualification_data"
    )
    .eq("tenant_id", tenantId)
    .order("qualification_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const leads = (leadData ?? []) as unknown as LeadProfile[];

  const kpis = computeKpis(leads);

  // (a) Concerns/objections — priority and notes are both short, opinion-
  // flavored fields, so they're pooled into one frequency ranking.
  const concernEntries = getTopFrequent([
    ...leads.map((l) => l.qualification_data?.priority),
    ...leads.map((l) => l.qualification_data?.notes),
  ]);

  // (b) Services/treatments — main_concern is the closest proxy we have
  // for "what they came in for."
  const serviceEntries = getTopFrequent(leads.map((l) => l.qualification_data?.main_concern));

  return (
    <DashboardShell
      clinicName={businessName}
      title={
        <>
          Leads <span className="font-normal text-muted-foreground">({leads.length})</span>
        </>
      }
      headerSlot={<ChatLinkCard slug={slug} />}
    >
      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-card-p text-sm text-destructive">
          Failed to load leads: {error.message}
        </p>
      ) : (
        <div className="flex flex-col gap-section-y">
          <StatCards kpis={kpis} />
          <InsightsSection concernEntries={concernEntries} serviceEntries={serviceEntries} />
          <LeadsSection leads={leads} />
        </div>
      )}
    </DashboardShell>
  );
}
