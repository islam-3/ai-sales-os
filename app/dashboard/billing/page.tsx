import { Check } from "lucide-react";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { getSubscriptionState, TENANT_SUBSCRIPTION_COLUMNS } from "@/lib/subscription";
import { PURCHASABLE_PLANS } from "@/lib/plans";
import { UsageSummary } from "@/components/dashboard/billing/UsageSummary";
import { PlanCard } from "@/components/dashboard/billing/PlanCard";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const context = await getCurrentTenant();

  if (!context) {
    return (
      <DashboardMessage>
        We couldn&apos;t find a business for your account. Please log in again.
      </DashboardMessage>
    );
  }

  const { supabase, tenantId, businessName } = context;

  // RLS restricts this to the caller's own tenant — the session client
  // physically cannot read another business's usage or plan.
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select(TENANT_SUBSCRIPTION_COLUMNS)
    .eq("id", tenantId)
    .maybeSingle();

  const subscription = getSubscriptionState({
    plan_id: tenantRow?.plan_id ?? null,
    subscription_status: tenantRow?.subscription_status ?? null,
    trial_started_at: tenantRow?.trial_started_at ?? null,
    trial_ends_at: tenantRow?.trial_ends_at ?? null,
    current_period_start: tenantRow?.current_period_start ?? null,
    current_period_end: tenantRow?.current_period_end ?? null,
    current_period_conversations: tenantRow?.current_period_conversations ?? null,
  });

  return (
    <DashboardShell clinicName={businessName} title="Plan & usage">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-section-y">
        <UsageSummary state={subscription} />

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Plans</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every plan includes the full assistant, unlimited team logins, and all your
              lead data. The only difference is how many conversations are included each
              month.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {PURCHASABLE_PLANS.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrent={subscription.plan?.id === plan.id}
                isRecommended={subscription.suggestedUpgrade?.id === plan.id}
              />
            ))}
          </div>

          {/*
            Payments aren't wired up yet, so this says so plainly rather
            than letting an owner click an upgrade button that silently
            does nothing. When Paddle lands, this note goes and the
            buttons in PlanCard become live checkout calls.
          */}
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Online payments are being set up. Nothing is charged yet, and going over
                your limit will not switch off your assistant or stop you receiving leads.
                To change plan in the meantime, get in touch and we&apos;ll move you across.
              </span>
            </p>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
