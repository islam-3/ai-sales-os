import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { computeKpis, getTopFrequent, LeadProfile } from "@/lib/dashboard";
import { parseTenantSettings } from "@/lib/tenant-settings";
import { getOnboardingState } from "@/lib/onboarding";
import { getSubscriptionState, TENANT_SUBSCRIPTION_COLUMNS } from "@/lib/subscription";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { ChatLinkCard } from "@/components/dashboard/ChatLinkCard";
import { OnboardingChecklist } from "@/components/dashboard/OnboardingChecklist";
import { UsageBanner } from "@/components/dashboard/UsageBanner";
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

  // Fetched alongside the leads rather than in series — the checklist
  // renders above the fold, so it shouldn't add a round trip to the
  // page's time-to-first-byte.
  const [
    { data: leadData, error },
    { data: tenantRow },
    { count: knowledgeEntryCount },
  ] = await Promise.all([
    supabase
      .from("lead_profile")
      .select(
        "id, name, contact_info, status, created_at, ai_summary, qualification_score, qualification_data"
      )
      .eq("tenant_id", tenantId)
      .order("qualification_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("tenants")
      .select(`industry, description, settings, ${TENANT_SUBSCRIPTION_COLUMNS}`)
      .eq("id", tenantId)
      .maybeSingle(),
    // head:true fetches the count without pulling any rows back.
    supabase
      .from("knowledge_base")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
  ]);

  const settings = parseTenantSettings(tenantRow?.settings);
  const onboarding = getOnboardingState({
    industry: tenantRow?.industry ?? null,
    description: tenantRow?.description ?? null,
    knowledgeEntryCount: knowledgeEntryCount ?? 0,
    settings,
  });

  // Derived from the tenant row already fetched above, so the banner
  // costs no extra query. Falls back to a trialing shape if the row is
  // somehow missing rather than throwing on the dashboard's main view.
  const subscription = getSubscriptionState({
    plan_id: tenantRow?.plan_id ?? null,
    subscription_status: tenantRow?.subscription_status ?? null,
    trial_started_at: tenantRow?.trial_started_at ?? null,
    trial_ends_at: tenantRow?.trial_ends_at ?? null,
    current_period_start: tenantRow?.current_period_start ?? null,
    current_period_end: tenantRow?.current_period_end ?? null,
    current_period_conversations: tenantRow?.current_period_conversations ?? null,
  });

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
      headerSlot={
        <>
          <UsageBanner state={subscription} />
          {onboarding.visible && <OnboardingChecklist state={onboarding} />}
          <ChatLinkCard
            slug={slug}
            trackFirstUse={settings.onboarding?.chat_link_copied !== true}
          />
        </>
      }
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
