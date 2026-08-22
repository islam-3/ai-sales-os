// Plan definitions.
//
// These live in code rather than a `plans` table on purpose. They are
// identical for every tenant, so a table would cost a join or a second
// round trip on every enforcement check to fetch data that never varies
// per row. They also never change alone — a limit change ships together
// with pricing copy, the upgrade CTA, and (later) a Paddle price ID — so
// keeping them here means one reviewable commit instead of a migration
// and a deploy that have to agree with each other.
//
// The tenant row stores only `plan_id` as free text. Adding a plan is a
// change to this file and nothing else.

export type PlanId = "trial" | "starter" | "growth" | "pro";

export type Plan = {
  id: PlanId;
  name: string;
  /** Conversations included per billing period. */
  conversationLimit: number;
  /** Monthly price in USD. Null for the trial, which is never sold. */
  priceUsd: number | null;
  description: string;
  /** Shown on the billing page. Order matters; kept short on purpose. */
  features: string[];
  /**
   * Paddle price identifier, filled in from env when the payment
   * integration lands. Null means "not purchasable yet", which is what
   * keeps the upgrade buttons disabled today.
   */
  paddlePriceId: string | null;
  /** Trial is a state every tenant starts in, not something on the pricing table. */
  purchasable: boolean;
};

/** A new tenant starts here: 100 conversations, 7 days. */
export const TRIAL_CONVERSATION_LIMIT = 100;
export const TRIAL_DURATION_DAYS = 7;

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Free trial",
    conversationLimit: TRIAL_CONVERSATION_LIMIT,
    priceUsd: null,
    description: `${TRIAL_CONVERSATION_LIMIT} conversations over ${TRIAL_DURATION_DAYS} days, so you can see real leads before paying.`,
    features: [
      `${TRIAL_CONVERSATION_LIMIT} conversations`,
      `${TRIAL_DURATION_DAYS} days`,
      "All features included",
    ],
    paddlePriceId: null,
    purchasable: false,
  },
  starter: {
    id: "starter",
    name: "Starter",
    conversationLimit: 1500,
    priceUsd: 49,
    description: "For a single location getting started with online leads.",
    features: ["1,500 conversations / month", "Unlimited team logins", "Email support"],
    paddlePriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_STARTER ?? null,
    purchasable: true,
  },
  growth: {
    id: "growth",
    name: "Growth",
    conversationLimit: 3000,
    priceUsd: 99,
    description: "For a busy practice running ads and handling steady enquiry volume.",
    features: ["3,000 conversations / month", "Unlimited team logins", "Priority support"],
    paddlePriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH ?? null,
    purchasable: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    conversationLimit: 6000,
    priceUsd: 179,
    description: "For multi-location businesses or high-volume campaigns.",
    features: ["6,000 conversations / month", "Unlimited team logins", "Priority support"],
    paddlePriceId: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO ?? null,
    purchasable: true,
  },
};

/** The paid plans, in upgrade order, for the billing page. */
export const PURCHASABLE_PLANS: Plan[] = [PLANS.starter, PLANS.growth, PLANS.pro];

/**
 * Looks up a plan by the free-text `plan_id` stored on the tenant.
 *
 * Returns null for anything unrecognised rather than falling back to a
 * plan. Enforcement is advisory, so the safe failure mode is to show no
 * warnings at all: a typo or a half-finished new plan must never nag a
 * paying customer about a limit that doesn't apply to them. The console
 * warning is how it gets noticed instead.
 */
export function getPlan(planId: string | null | undefined): Plan | null {
  if (!planId) return null;
  const plan = PLANS[planId as PlanId];
  if (!plan) {
    console.warn(
      `Unknown plan_id "${planId}" — no usage warnings will be shown for this tenant. ` +
        `Add it to PLANS in lib/plans.ts.`
    );
    return null;
  }
  return plan;
}

/** The next plan up, or null at the top. Drives the upgrade CTA. */
export function nextPlanUp(planId: string | null | undefined): Plan | null {
  const order: PlanId[] = ["trial", "starter", "growth", "pro"];
  const index = order.indexOf(planId as PlanId);
  if (index === -1) return null;
  const next = order[index + 1];
  return next ? PLANS[next] : null;
}
