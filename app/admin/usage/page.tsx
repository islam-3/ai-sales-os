import { isPlatformAdmin } from "@/lib/platform-admin";
import { supabaseServer } from "@/lib/supabase-server";

// Internal platform-owner view of AI spend. Always live — these numbers
// are for decision-making, so a cached figure would be worse than slow.
export const dynamic = "force-dynamic";

const DAYS = 30;

function usd(n: number): string {
  // Per-call costs are fractions of a cent, so totals need more than the
  // usual two decimals to be readable at this volume.
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

type TenantTotal = {
  tenantId: string;
  businessName: string;
  costUsd: number;
  callCount: number;
  conversationCount: number;
};

export default async function AdminUsagePage() {
  // Middleware already requires a session for /admin; this additionally
  // requires that the session belongs to a platform admin. Fails closed
  // when PLATFORM_ADMIN_EMAILS is unset.
  if (!(await isPlatformAdmin())) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-page-x">
        <div className="max-w-sm rounded-xl border bg-card p-card-p text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            This page is only available to platform administrators.
          </p>
        </div>
      </div>
    );
  }

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  // service_role: these are cross-tenant totals, which RLS deliberately
  // prevents any individual owner from seeing. Reached only after the
  // admin check above.
  const [{ data: conversations }, { data: events }, { data: tenants }] = await Promise.all([
    supabaseServer.from("usage_by_conversation").select("session_id, tenant_id, cost_usd, is_lead"),
    supabaseServer
      .from("usage_events")
      .select("tenant_id, session_id, call_type, cost_usd, input_tokens, output_tokens")
      .gte("created_at", since),
    supabaseServer.from("tenants").select("id, business_name"),
  ]);

  const convos = conversations ?? [];
  const rows = events ?? [];
  const nameById = new Map((tenants ?? []).map((t) => [t.id, t.business_name as string]));

  const num = (v: unknown) => Number(v ?? 0);

  const convoCosts = convos.map((c) => num(c.cost_usd));
  const leadCosts = convos.filter((c) => c.is_lead).map((c) => num(c.cost_usd));

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const totalRecent = sum(rows.map((r) => num(r.cost_usd)));

  // Per call type — the breakdown that shows where the money actually
  // goes, and therefore what the optimisation pass should target.
  const byCallType = new Map<string, { cost: number; count: number }>();
  for (const r of rows) {
    const key = String(r.call_type);
    const acc = byCallType.get(key) ?? { cost: 0, count: 0 };
    acc.cost += num(r.cost_usd);
    acc.count += 1;
    byCallType.set(key, acc);
  }

  const byTenant = new Map<string, TenantTotal>();
  for (const r of rows) {
    const id = String(r.tenant_id);
    const acc =
      byTenant.get(id) ??
      ({
        tenantId: id,
        businessName: nameById.get(id) ?? "(deleted tenant)",
        costUsd: 0,
        callCount: 0,
        conversationCount: 0,
      } as TenantTotal);
    acc.costUsd += num(r.cost_usd);
    acc.callCount += 1;
    byTenant.set(id, acc);
  }
  for (const [id, acc] of Array.from(byTenant.entries())) {
    acc.conversationCount = new Set(
      rows.filter((r) => String(r.tenant_id) === id && r.session_id).map((r) => r.session_id)
    ).size;
  }
  const tenantTotals = Array.from(byTenant.values()).sort((a, b) => b.costUsd - a.costUsd);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-page-x py-page-y">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI cost</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Internal view. Figures depend on the rates in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">lib/ai-pricing.ts</code> — verify
          those against current provider pricing before relying on them.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Avg per conversation",
              value: usd(avg(convoCosts)),
              sub: `${convoCosts.length} conversations, all time`,
            },
            {
              label: "Avg per lead",
              value: usd(avg(leadCosts)),
              sub: `${leadCosts.length} became leads`,
            },
            {
              label: `Total, last ${DAYS} days`,
              value: usd(totalRecent),
              sub: `${rows.length} billable calls`,
            },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border bg-card p-card-p shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className="tabular-figures mt-1 text-2xl font-semibold text-foreground">
                {c.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{c.sub}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-base font-semibold tracking-tight text-foreground">
          Where the cost goes
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Call type</th>
                <th className="px-4 py-2.5 text-right font-medium">Calls</th>
                <th className="px-4 py-2.5 text-right font-medium">Cost</th>
                <th className="px-4 py-2.5 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Array.from(byCallType.entries())
                .sort((a, b) => b[1].cost - a[1].cost)
                .map(([type, v]) => (
                  <tr key={type}>
                    <td className="px-4 py-2.5 text-foreground">{type}</td>
                    <td className="tabular-figures px-4 py-2.5 text-right text-muted-foreground">
                      {v.count}
                    </td>
                    <td className="tabular-figures px-4 py-2.5 text-right text-foreground">
                      {usd(v.cost)}
                    </td>
                    <td className="tabular-figures px-4 py-2.5 text-right text-muted-foreground">
                      {totalRecent > 0 ? `${((v.cost / totalRecent) * 100).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                ))}
              {byCallType.size === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No usage recorded in the last {DAYS} days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-base font-semibold tracking-tight text-foreground">
          By tenant, last {DAYS} days
        </h2>
        <div className="mt-3 overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Business</th>
                <th className="px-4 py-2.5 text-right font-medium">Conversations</th>
                <th className="px-4 py-2.5 text-right font-medium">Calls</th>
                <th className="px-4 py-2.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tenantTotals.map((t) => (
                <tr key={t.tenantId}>
                  <td className="px-4 py-2.5 text-foreground">{t.businessName}</td>
                  <td className="tabular-figures px-4 py-2.5 text-right text-muted-foreground">
                    {t.conversationCount}
                  </td>
                  <td className="tabular-figures px-4 py-2.5 text-right text-muted-foreground">
                    {t.callCount}
                  </td>
                  <td className="tabular-figures px-4 py-2.5 text-right text-foreground">
                    {usd(t.costUsd)}
                  </td>
                </tr>
              ))}
              {tenantTotals.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No usage recorded in the last {DAYS} days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
