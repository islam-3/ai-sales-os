import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { getUsageBannerContent, type SubscriptionState } from "@/lib/subscription";

// Surfaces a usage or trial warning to the business owner. Renders
// nothing at all below the warning threshold — a dashboard that always
// carries a billing strip trains owners to ignore it, which defeats the
// point of having one.
//
// Deliberately never says service is suspended, because it isn't: over
// the limit, visitors keep being answered. The copy lives in
// getUsageBannerContent so severity and wording stay in one place.
export function UsageBanner({ state }: { state: SubscriptionState }) {
  const content = getUsageBannerContent(state);
  if (!content) return null;

  const isSevere = content.tone === "destructive";

  // Tokens rather than raw colours, so both themes are handled by the
  // same declaration. The /10 tint and /25 border keep the banner
  // readable on the dark surface without a second set of dark: variants.
  const container = isSevere
    ? "border-destructive/25 bg-destructive/10"
    : "border-warning/25 bg-warning/10";
  const iconColor = isSevere ? "text-destructive" : "text-warning";

  return (
    <div className={`mb-6 rounded-xl border p-4 ${container}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{content.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{content.body}</p>

          {state.limit !== null && (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {state.used.toLocaleString()} of {state.limit.toLocaleString()} conversations used
            </p>
          )}

          <Link
            href="/dashboard/billing"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
          >
            {content.ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
