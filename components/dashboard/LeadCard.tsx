import { Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusDropdown } from "./StatusDropdown";
import { QualificationDetails } from "./QualificationDetails";
import { LeadProfile, formatDate, getScoreTier, SCORE_TIER_CLASSES } from "@/lib/dashboard";

function ScoreBadge({ score }: { score: number | null }) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-semibold tabular-nums ${
          SCORE_TIER_CLASSES[getScoreTier(score)]
        }`}
      >
        {score ?? "–"}
      </div>
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Score
      </span>
    </div>
  );
}

export function LeadCard({ lead }: { lead: LeadProfile }) {
  return (
    <Card className="shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {lead.name || <span className="italic text-muted-foreground">Unknown lead</span>}
            </h3>
            <div className="mt-1.5 flex items-center gap-1.5">
              {lead.contact_info ? (
                <>
                  <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate text-sm text-slate-500">{lead.contact_info}</span>
                </>
              ) : (
                <span className="text-sm italic text-muted-foreground">No contact info yet</span>
              )}
            </div>
          </div>

          <ScoreBadge score={lead.qualification_score} />
        </div>

        {lead.ai_summary && (
          <p className="mt-4 rounded-lg border bg-slate-50/60 px-3.5 py-3 text-sm leading-relaxed text-slate-600">
            {lead.ai_summary}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3.5">
          <StatusDropdown leadId={lead.id} initialStatus={lead.status} />
          <span className="text-xs text-muted-foreground">{formatDate(lead.created_at)}</span>
        </div>

        <QualificationDetails data={lead.qualification_data} />
      </CardContent>
    </Card>
  );
}
