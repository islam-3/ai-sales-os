"use client";

import { useState, useTransition } from "react";
import { updateLeadStatus } from "@/app/dashboard/actions";
import { LeadStatus, STATUS_META, STATUS_OPTIONS, isLeadStatus } from "@/lib/dashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function StatusDropdown({
  leadId,
  initialStatus,
}: {
  leadId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState<LeadStatus>(
    isLeadStatus(initialStatus) ? initialStatus : "new"
  );
  const [isPending, startTransition] = useTransition();

  function handleChange(newStatus: string) {
    if (!isLeadStatus(newStatus)) return;
    const previous = status;
    setStatus(newStatus); // optimistic

    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, newStatus);
      } catch (err) {
        console.error(err);
        setStatus(previous); // revert on failure
      }
    });
  }

  const meta = STATUS_META[status];

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger
        className={`h-7 w-auto gap-1.5 rounded-full border px-3 py-0 text-xs font-medium shadow-none focus:ring-1 focus:ring-offset-0 ${meta.badge}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option} value={option} className="text-sm">
            <span className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[option].dot}`} />
              {STATUS_META[option].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
