// Derives a tenant's subscription state from its stored columns.
//
// The single most important property of everything in this file: it is
// ADVISORY. Nothing here can stop a conversation. A visitor talking to a
// business that is over its limit, out of trial, or past due gets exactly
// the same experience as any other visitor. The output is used only to
// decide what the business owner is told on their dashboard.
//
// That's a deliberate product decision — a lead lost because a customer's
// card expired is worse for both sides than the overage.

import { getPlan, nextPlanUp, type Plan } from "./plans";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";

/** The tenant columns this module needs. Kept narrow so callers can select only these. */
export type TenantSubscriptionRow = {
  plan_id: string | null;
  subscription_status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  current_period_conversations: number | null;
};

export const TENANT_SUBSCRIPTION_COLUMNS =
  "plan_id, subscription_status, trial_started_at, trial_ends_at, current_period_start, current_period_end, current_period_conversations";

/** Warn once usage reaches this share of the limit. */
export const WARN_AT_FRACTION = 0.8;
/** Warn this many days before a trial runs out. */
export const TRIAL_ENDING_SOON_DAYS = 2;

export type UsageLevel = "ok" | "approaching" | "exceeded";

export type SubscriptionState = {
  plan: Plan | null;
  status: SubscriptionStatus;
  /** Conversations used in the current period, normalised for a lapsed period. */
  used: number;
  /** Null when the plan is unrecognised — the UI then shows no limit at all. */
  limit: number | null;
  /** 0-1, clamped for display. Null when there's no limit to measure against. */
  fraction: number | null;
  level: UsageLevel;
  isTrial: boolean;
  trialEndsAt: Date | null;
  /** Trial is over: either the 7 days elapsed or the conversation cap was hit. */
  trialExpired: boolean;
  trialDaysRemaining: number | null;
  trialEndingSoon: boolean;
  periodEndsAt: Date | null;
  /** The plan we'd point the owner at. Null at the top of the range. */
  suggestedUpgrade: Plan | null;
  /** True when the dashboard should surface a banner at all. */
  shouldWarn: boolean;
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isKnownStatus(value: string | null): value is SubscriptionStatus {
  return value === "trialing" || value === "active" || value === "past_due" || value === "canceled";
}

/**
 * Reads the stored columns and works out what to tell the owner.
 *
 * `now` is injectable so the thresholds can be tested at specific points
 * in a trial without waiting seven days.
 */
export function getSubscriptionState(
  tenant: TenantSubscriptionRow,
  now: Date = new Date()
): SubscriptionState {
  const plan = getPlan(tenant.plan_id);
  const status: SubscriptionStatus = isKnownStatus(tenant.subscription_status)
    ? tenant.subscription_status
    : "trialing";

  const periodEndsAt = parseDate(tenant.current_period_end);
  const trialEndsAt = parseDate(tenant.trial_ends_at);
  const isTrial = status === "trialing";

  // Mirrors record_conversation_start: only paid statuses roll over. If a
  // paid tenant's period has lapsed but nobody has chatted since, the
  // counter is stale — the next conversation will reset it — so show 0
  // rather than last period's total.
  const periodLapsed =
    periodEndsAt !== null && now >= periodEndsAt && (status === "active" || status === "past_due");
  const used = periodLapsed ? 0 : tenant.current_period_conversations ?? 0;

  const limit = plan ? plan.conversationLimit : null;
  const fraction = limit && limit > 0 ? used / limit : null;

  let level: UsageLevel = "ok";
  if (fraction !== null) {
    if (fraction >= 1) level = "exceeded";
    else if (fraction >= WARN_AT_FRACTION) level = "approaching";
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const trialDaysRemaining =
    isTrial && trialEndsAt ? Math.ceil((trialEndsAt.getTime() - now.getTime()) / msPerDay) : null;

  // Either cap ends a trial: the seven days, or the hundred conversations.
  const trialTimeUp = isTrial && trialEndsAt !== null && now >= trialEndsAt;
  const trialQuotaUp = isTrial && level === "exceeded";
  const trialExpired = trialTimeUp || trialQuotaUp;

  const trialEndingSoon =
    isTrial &&
    !trialExpired &&
    trialDaysRemaining !== null &&
    trialDaysRemaining <= TRIAL_ENDING_SOON_DAYS;

  const suggestedUpgrade = nextPlanUp(tenant.plan_id);

  const shouldWarn =
    trialExpired || trialEndingSoon || level === "approaching" || level === "exceeded";

  return {
    plan,
    status,
    used,
    limit,
    fraction,
    level,
    isTrial,
    trialEndsAt,
    trialExpired,
    trialDaysRemaining,
    trialEndingSoon,
    periodEndsAt,
    suggestedUpgrade,
    shouldWarn,
  };
}

export type BannerTone = "warning" | "destructive";

export type UsageBannerContent = {
  tone: BannerTone;
  title: string;
  body: string;
  ctaLabel: string;
};

/**
 * The exact words for the dashboard banner, or null when there's nothing
 * worth saying. Kept next to the logic that decides severity so the two
 * can't drift — and so the reassurance that service continues is never
 * accidentally dropped from an over-limit message.
 */
export function getUsageBannerContent(state: SubscriptionState): UsageBannerContent | null {
  if (!state.shouldWarn) return null;

  const used = state.used.toLocaleString();
  const limit = state.limit?.toLocaleString() ?? "";

  if (state.trialExpired) {
    const reason =
      state.level === "exceeded"
        ? `You've used all ${limit} conversations in your free trial.`
        : "Your free trial has ended.";
    return {
      tone: "destructive",
      title: "Your free trial has ended",
      body: `${reason} Your assistant is still answering visitors and you won't be cut off — choose a plan to keep it that way.`,
      ctaLabel: "Choose a plan",
    };
  }

  if (state.trialEndingSoon) {
    const days = state.trialDaysRemaining ?? 0;
    const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    return {
      tone: "warning",
      title: `Your free trial ends ${when}`,
      body: `You've used ${used} of your ${limit} trial conversations. Pick a plan now and your assistant keeps running without interruption.`,
      ctaLabel: "Choose a plan",
    };
  }

  if (state.level === "exceeded") {
    return {
      tone: "destructive",
      title: "You're over your monthly limit",
      body: `You've had ${used} conversations this period on the ${state.plan?.name ?? "current"} plan, which includes ${limit}. Nothing has been switched off and visitors are still being answered — upgrading keeps your bill predictable.`,
      ctaLabel: state.suggestedUpgrade ? `Upgrade to ${state.suggestedUpgrade.name}` : "View plans",
    };
  }

  // A trial isn't monthly and isn't something you "upgrade" from mid-way,
  // so it gets its own wording rather than the paid-plan copy.
  if (state.isTrial) {
    return {
      tone: "warning",
      title: "You're approaching your trial limit",
      body: `You've used ${used} of your ${limit} trial conversations. You won't be cut off when you reach ${limit} — pick a plan whenever you're ready.`,
      ctaLabel: "Choose a plan",
    };
  }

  return {
    tone: "warning",
    title: "You're approaching your monthly limit",
    body: `You've used ${used} of ${limit} conversations this period. You won't be cut off if you go over, but it's worth a look.`,
    ctaLabel: state.suggestedUpgrade ? `Upgrade to ${state.suggestedUpgrade.name}` : "View plans",
  };
}
