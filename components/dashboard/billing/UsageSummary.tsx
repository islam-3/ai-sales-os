import type { SubscriptionState } from "@/lib/subscription";

// Where the owner is right now: which plan, how much of it they've used,
// and when the counter resets. Shown whether or not they're near a limit
// — unlike the banner, this page is where you come to look.

const STATUS_LABELS: Record<SubscriptionState["status"], string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment overdue",
  canceled: "Canceled",
};

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function UsageSummary({ state }: { state: SubscriptionState }) {
  const { plan, used, limit, fraction, level, isTrial } = state;

  // Clamped so an over-limit tenant gets a full bar rather than one that
  // overflows its container.
  const barFraction = fraction === null ? 0 : Math.min(fraction, 1);

  const barColor =
    level === "exceeded" ? "bg-destructive" : level === "approaching" ? "bg-warning" : "bg-primary";

  const resetLabel = isTrial ? "Trial ends" : "Resets on";
  const resetDate = isTrial ? state.trialEndsAt : state.periodEndsAt;

  return (
    <section className="rounded-xl border bg-card p-card-p shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-card-foreground">
            {plan?.name ?? "No plan"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan?.description ?? "This account is on an unrecognised plan. Please contact support."}
          </p>
        </div>
        <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {STATUS_LABELS[state.status]}
        </span>
      </div>

      {limit !== null && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-card-foreground">
              {used.toLocaleString()}{" "}
              <span className="font-normal text-muted-foreground">
                of {limit.toLocaleString()} conversations
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              {resetLabel} {formatDate(resetDate)}
            </p>
          </div>

          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-label="Conversations used this period"
          >
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.round(barFraction * 100)}%` }}
            />
          </div>

          {level === "exceeded" && (
            <p className="mt-2 text-xs text-muted-foreground">
              You&apos;re over the included amount. Your assistant is still answering
              visitors — nothing has been switched off.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
