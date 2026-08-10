import {
  Calendar,
  Camera,
  ChevronDown,
  Clock,
  Flag,
  MapPin,
  Stethoscope,
  User,
  FileText,
} from "lucide-react";
import { QualificationData } from "@/lib/dashboard";

const FIELDS: { key: keyof QualificationData; label: string; icon: typeof Stethoscope }[] = [
  { key: "main_concern", label: "Main concern", icon: Stethoscope },
  { key: "priority", label: "Priority", icon: Flag },
  { key: "timeline", label: "Timeline", icon: Clock },
  { key: "travel_country", label: "Travel country", icon: MapPin },
  { key: "duration_of_issue", label: "Duration of issue", icon: Calendar },
  { key: "age", label: "Age", icon: User },
  { key: "notes", label: "Notes", icon: FileText },
];

export function QualificationDetails({ data }: { data: QualificationData | null }) {
  const entries = FIELDS.map((field) => ({
    ...field,
    value: data?.[field.key],
  })).filter((e) => e.value !== undefined && e.value !== null && e.value !== "");

  const attachmentCount = data?.attachments?.length ?? 0;

  if (entries.length === 0 && attachmentCount === 0) return null;

  return (
    <details className="group mt-3.5">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 text-sm font-medium text-muted-foreground marker:hidden [&::-webkit-details-marker]:hidden hover:text-foreground">
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
        Qualification details
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
        {entries.map(({ key, label, icon: Icon, value }) => (
          <div key={key} className="flex items-start gap-2.5">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </div>
              <div className="text-sm text-foreground/80">{String(value)}</div>
            </div>
          </div>
        ))}
        {attachmentCount > 0 && (
          <div className="flex items-start gap-2.5">
            <Camera className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Photos
              </div>
              <div className="text-sm text-foreground/80">{attachmentCount} attached</div>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
