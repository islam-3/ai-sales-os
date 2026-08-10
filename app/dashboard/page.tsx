import { supabaseServer } from "@/lib/supabase-server";
import { TENANT_ID } from "@/lib/constants";
import { computeKpis, getTopFrequent, LeadProfile } from "@/lib/dashboard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { StatCards } from "@/components/dashboard/StatCards";
import { InsightsSection } from "@/components/dashboard/InsightsSection";
import { LeadsSection } from "@/components/dashboard/LeadsSection";

// Always fetch fresh — this is a live CRM view, not something to cache,
// and it needs to reflect status updates right after they happen.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ data: tenant }, { data: leadData, error }] = await Promise.all([
    supabaseServer.from("tenants").select("business_name").eq("id", TENANT_ID).maybeSingle(),
    supabaseServer
      .from("lead_profile")
      .select(
        "id, name, contact_info, status, created_at, ai_summary, qualification_score, qualification_data"
      )
      .eq("tenant_id", TENANT_ID)
      .order("qualification_score", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const clinicName = tenant?.business_name || "Dental Clinic CRM";
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
    <div className="dark min-h-screen bg-background">
      <DashboardHeader clinicName={clinicName} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Leads <span className="font-medium text-muted-foreground">({leads.length})</span>
          </h1>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
            Failed to load leads: {error.message}
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            <StatCards kpis={kpis} />
            <InsightsSection concernEntries={concernEntries} serviceEntries={serviceEntries} />
            <LeadsSection leads={leads} />
          </div>
        )}
      </main>
    </div>
  );
}
