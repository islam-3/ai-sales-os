// Shared types, styling maps, and pure computation helpers for the CRM
// dashboard. Kept free of Supabase calls / React so the KPI and insight
// logic is easy to reason about and reuse across server components.

// Two states only: "new" is the default — the lead hasn't been delivered
// anywhere yet. "sent" means the business has marked it as sent/handled;
// for now that's a manual toggle here, and will later be set automatically
// once real CRM integrations (e.g. Bitrix24) are wired up.
export const STATUS_OPTIONS = ["new", "sent"] as const;
export type LeadStatus = (typeof STATUS_OPTIONS)[number];

// Built from semantic design tokens rather than fixed palette shades, so
// these read correctly in both light and dark — the previous zinc/slate
// literals were tuned for a dark card and washed out on a light one.
// Colour here carries meaning: "new" is a neutral, un-acted-on state;
// "sent" has been handled, so it takes the success token.
export const STATUS_META: Record<LeadStatus, { label: string; dot: string; badge: string }> = {
  new: {
    label: "New",
    dot: "bg-muted-foreground",
    badge: "border-border bg-muted text-muted-foreground",
  },
  sent: {
    label: "Sent",
    dot: "bg-success",
    badge: "border-success/30 bg-success/10 text-success",
  },
};

export function isLeadStatus(value: string): value is LeadStatus {
  return (STATUS_OPTIONS as readonly string[]).includes(value);
}

export type QualificationData = {
  age?: number;
  main_concern?: string;
  priority?: string;
  duration_of_issue?: string;
  timeline?: string;
  travel_country?: string;
  notes?: string;
  attachments?: string[];
};

export type LeadProfile = {
  id: string;
  name: string | null;
  contact_info: string | null;
  status: string;
  created_at: string;
  ai_summary: string | null;
  qualification_score: number | null;
  qualification_data: QualificationData | null;
};

export type ScoreTier = "hot" | "warm" | "cold";

export function getScoreTier(score: number | null): ScoreTier {
  if (score !== null && score >= 70) return "hot";
  if (score !== null && score >= 40) return "warm";
  return "cold";
}

// Semantic tokens again, for the same reason as STATUS_META: a lead
// score is a heat scale, so it maps onto success / warning / neutral
// rather than fixed grey shades that only worked on a dark card.
export const SCORE_TIER_CLASSES: Record<ScoreTier, string> = {
  hot: "border-success/30 bg-success/10 text-success",
  warm: "border-warning/30 bg-warning/10 text-warning",
  cold: "border-border bg-muted text-muted-foreground",
};

export function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type TopEntry = { label: string; count: number };

// Counts occurrences of each value (trimmed, case-insensitive for
// grouping) and returns the top N, most frequent first. The first-seen
// casing is kept for display. Free-text fields won't group perfectly
// until enough leads share near-identical phrasing — see the empty state
// in BarList for the sparse-data case.
export function getTopFrequent(values: (string | null | undefined)[], limit = 5): TopEntry[] {
  const counts = new Map<string, TopEntry>();

  for (const raw of values) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { label: trimmed, count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export type DashboardKpis = {
  totalLeads: number;
  todayCount: number;
  thisWeekCount: number;
  thisMonthCount: number;
  avgScore: number | null;
  // % of leads marked "sent" — the closest equivalent to the old
  // "conversion rate" now that status is just new/sent, not a funnel.
  sentRate: number;
  statusCounts: Record<LeadStatus, number>;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function computeKpis(leads: LeadProfile[]): DashboardKpis {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  let todayCount = 0;
  let thisWeekCount = 0;
  let thisMonthCount = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let sentCount = 0;

  const statusCounts = Object.fromEntries(
    STATUS_OPTIONS.map((status) => [status, 0])
  ) as Record<LeadStatus, number>;

  for (const lead of leads) {
    const createdAt = new Date(lead.created_at);
    if (createdAt >= todayStart) todayCount += 1;
    if (createdAt >= weekStart) thisWeekCount += 1;
    if (createdAt >= monthStart) thisMonthCount += 1;

    if (lead.qualification_score !== null) {
      scoreSum += lead.qualification_score;
      scoreCount += 1;
    }

    if (lead.status === "sent") sentCount += 1;
    if (isLeadStatus(lead.status)) statusCounts[lead.status] += 1;
  }

  return {
    totalLeads: leads.length,
    todayCount,
    thisWeekCount,
    thisMonthCount,
    avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    sentRate: leads.length > 0 ? Math.round((sentCount / leads.length) * 100) : 0,
    statusCounts,
  };
}
