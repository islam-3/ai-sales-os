import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Plan } from "@/lib/plans";

// One purchasable plan.
//
// The upgrade button is disabled everywhere for now: `paddlePriceId` is
// null until the payment integration lands, and a button that looks live
// but does nothing is worse than one that's honestly unavailable. When
// Paddle is wired up, this becomes a checkout call and the disabled state
// falls away on its own.
export function PlanCard({
  plan,
  isCurrent,
  isRecommended,
}: {
  plan: Plan;
  isCurrent: boolean;
  isRecommended: boolean;
}) {
  const purchasable = plan.purchasable && plan.paddlePriceId !== null;

  return (
    <div
      className={`flex flex-col rounded-xl border bg-card p-4 shadow-sm ${
        isRecommended ? "border-primary" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">{plan.name}</h3>
        {isCurrent ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Current
          </span>
        ) : isRecommended ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
            Suggested
          </span>
        ) : null}
      </div>

      <p className="mt-2">
        <span className="text-2xl font-semibold tracking-tight text-card-foreground">
          ${plan.priceUsd}
        </span>
        <span className="text-sm text-muted-foreground"> / month</span>
      </p>

      <ul className="mt-3 flex flex-1 flex-col gap-1.5">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant={isRecommended ? "default" : "outline"}
        size="sm"
        className="mt-4 w-full"
        disabled={!purchasable || isCurrent}
      >
        {isCurrent ? "Current plan" : purchasable ? `Upgrade to ${plan.name}` : "Coming soon"}
      </Button>
    </div>
  );
}
