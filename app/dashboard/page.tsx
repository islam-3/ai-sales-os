import { supabaseServer } from "@/lib/supabase-server";
import { TENANT_ID } from "@/lib/constants";
import StatusDropdown from "./StatusDropdown";
import {
  CalendarIcon,
  CameraIcon,
  ChevronIcon,
  ClockIcon,
  ConcernIcon,
  FlagIcon,
  NoteIcon,
  PhoneIcon,
  PinIcon,
  UserIcon,
} from "./icons";

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

const QUALIFICATION_FIELDS: {
  key: keyof QualificationData;
  label: string;
  icon: typeof ConcernIcon;
}[] = [
  { key: "main_concern", label: "Main concern", icon: ConcernIcon },
  { key: "priority", label: "Priority", icon: FlagIcon },
  { key: "timeline", label: "Timeline", icon: ClockIcon },
  { key: "travel_country", label: "Travel country", icon: PinIcon },
  { key: "duration_of_issue", label: "Duration of issue", icon: CalendarIcon },
  { key: "age", label: "Age", icon: UserIcon },
  { key: "notes", label: "Notes", icon: NoteIcon },
];

function scoreTierClasses(score: number | null) {
  if (score !== null && score >= 70) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  }
  if (score !== null && score >= 40) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  }
  return "border-slate-700 bg-slate-800/60 text-slate-500";
}

function ScoreBadge({ score }: { score: number | null }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-base font-bold tabular-nums ${scoreTierClasses(
          score
        )}`}
      >
        {score ?? "–"}
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Score
      </span>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5 px-6 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            {clinicName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-semibold text-slate-200">{clinicName}</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6 flex items-baseline gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">Leads</h1>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-sm font-medium text-slate-400">
            {leads.length}
          </span>
        </div>

        {error && (
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
            Failed to load leads: {error.message}
          </p>
        )}

        {!error && leads.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center">
            <p className="text-sm text-slate-500">No leads yet.</p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {leads.map((lead) => {
            const qualificationEntries = QUALIFICATION_FIELDS.map((field) => ({
              ...field,
              value: lead.qualification_data?.[field.key],
            })).filter((e) => e.value !== undefined && e.value !== null && e.value !== "");

            const attachmentCount = lead.qualification_data?.attachments?.length ?? 0;
            const hasDetails = qualificationEntries.length > 0 || attachmentCount > 0;

            return (
              <div
                key={lead.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-sm shadow-black/20 transition-colors hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-slate-50">
                      {lead.name || <span className="italic text-slate-500">Unknown lead</span>}
                    </h3>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {lead.contact_info ? (
                        <>
                          <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <span className="truncate text-sm text-slate-400">
                            {lead.contact_info}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm italic text-slate-600">No contact info yet</span>
                      )}
                    </div>
                  </div>

                  <ScoreBadge score={lead.qualification_score} />
                </div>

                {lead.ai_summary && (
                  <p className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-3 text-sm leading-relaxed text-slate-300">
                    {lead.ai_summary}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-800 pt-3.5">
                  <StatusDropdown leadId={lead.id} initialStatus={lead.status} />
                  <span className="text-xs text-slate-500">{formatDate(lead.created_at)}</span>
                </div>

                {hasDetails && (
                  <details className="group mt-3.5">
                    <summary className="flex cursor-pointer select-none items-center gap-1.5 text-sm font-medium text-slate-400 marker:hidden [&::-webkit-details-marker]:hidden hover:text-slate-300">
                      <ChevronIcon className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                      Qualification details
                    </summary>
                    <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border border-slate-800 bg-slate-950/40 p-4 sm:grid-cols-2">
                      {qualificationEntries.map(({ key, label, icon: Icon, value }) => (
                        <div key={key} className="flex items-start gap-2.5">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              {label}
                            </div>
                            <div className="text-sm text-slate-200">{String(value)}</div>
                          </div>
                        </div>
                      ))}
                      {attachmentCount > 0 && (
                        <div className="flex items-start gap-2.5">
                          <CameraIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Photos
                            </div>
                            <div className="text-sm text-slate-200">
                              {attachmentCount} attached
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
