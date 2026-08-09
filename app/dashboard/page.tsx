import { supabaseServer } from "@/lib/supabase-server";
import { TENANT_ID } from "@/lib/constants";
import StatusDropdown from "./StatusDropdown";

// Always fetch fresh — this is a live CRM view, not something to cache,
// and it needs to reflect status updates right after they happen.
export const dynamic = "force-dynamic";

type QualificationData = {
  age?: number;
  main_concern?: string;
  priority?: string;
  duration_of_issue?: string;
  timeline?: string;
  travel_country?: string;
  notes?: string;
  attachments?: string[];
};

type LeadProfile = {
  id: string;
  name: string | null;
  contact_info: string | null;
  status: string;
  created_at: string;
  ai_summary: string | null;
  qualification_score: number | null;
  qualification_data: QualificationData | null;
};

const QUALIFICATION_FIELDS: { key: keyof QualificationData; label: string }[] = [
  { key: "main_concern", label: "Main concern" },
  { key: "priority", label: "Priority" },
  { key: "timeline", label: "Timeline" },
  { key: "travel_country", label: "Travel country" },
  { key: "duration_of_issue", label: "Duration of issue" },
  { key: "age", label: "Age" },
  { key: "notes", label: "Notes" },
];

function scoreBadgeClasses(score: number | null) {
  if (score !== null && score >= 70) {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
  if (score !== null && score >= 40) {
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  }
  return "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function DashboardPage() {
  const { data, error } = await supabaseServer
    .from("lead_profile")
    .select(
      "id, name, contact_info, status, created_at, ai_summary, qualification_score, qualification_data"
    )
    .eq("tenant_id", TENANT_ID)
    .order("qualification_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const leads = (data ?? []) as unknown as LeadProfile[];

  return (
    <div className="min-h-screen bg-white p-6 dark:bg-black">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-6 text-xl font-semibold">Leads</h1>

        {error && (
          <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
            Failed to load leads: {error.message}
          </p>
        )}

        {!error && leads.length === 0 && (
          <p className="text-sm text-black/40 dark:text-white/40">No leads yet.</p>
        )}

        <div className="flex flex-col gap-4">
          {leads.map((lead) => {
            const qualificationEntries = QUALIFICATION_FIELDS.map(({ key, label }) => ({
              label,
              value: lead.qualification_data?.[key],
            })).filter((e) => e.value !== undefined && e.value !== null && e.value !== "");

            const attachmentCount = lead.qualification_data?.attachments?.length ?? 0;

            return (
              <div
                key={lead.id}
                className="rounded-lg border border-black/10 p-4 dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{lead.name || "Unknown"}</div>
                    <div className="text-sm text-black/60 dark:text-white/60">
                      {lead.contact_info || "No contact info yet"}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${scoreBadgeClasses(
                      lead.qualification_score
                    )}`}
                    title="Qualification score"
                  >
                    {lead.qualification_score ?? "—"}
                  </span>
                </div>

                {lead.ai_summary && (
                  <p className="mt-3 rounded-md bg-black/5 p-3 text-sm dark:bg-white/5">
                    {lead.ai_summary}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-between gap-3">
                  <StatusDropdown leadId={lead.id} initialStatus={lead.status} />
                  <span className="text-xs text-black/40 dark:text-white/40">
                    {formatDate(lead.created_at)}
                  </span>
                </div>

                {(qualificationEntries.length > 0 || attachmentCount > 0) && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer select-none text-black/60 dark:text-white/60">
                      Details
                    </summary>
                    <dl className="mt-2 flex flex-col gap-1">
                      {qualificationEntries.map(({ label, value }) => (
                        <div key={label} className="flex gap-2">
                          <dt className="w-36 shrink-0 text-black/40 dark:text-white/40">
                            {label}:
                          </dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                      {attachmentCount > 0 && (
                        <div className="flex gap-2">
                          <dt className="w-36 shrink-0 text-black/40 dark:text-white/40">
                            Photos:
                          </dt>
                          <dd>{attachmentCount} attached</dd>
                        </div>
                      )}
                    </dl>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
