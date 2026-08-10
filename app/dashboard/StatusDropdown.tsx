"use client";

import { useState, useTransition, ChangeEvent } from "react";
import { updateLeadStatus } from "./actions";
import { ChevronIcon } from "./icons";

const STATUS_OPTIONS = ["new", "contacted", "qualified", "converted"] as const;

const STATUS_STYLES: Record<string, string> = {
  new: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  contacted: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  qualified: "border-purple-500/30 bg-purple-500/10 text-purple-300",
  converted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

export default function StatusDropdown({
  leadId,
  initialStatus,
}: {
  leadId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [isPending, startTransition] = useTransition();

  function handleChange(e: ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    const previousStatus = status;
    setStatus(newStatus); // optimistic

    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, newStatus);
      } catch (err) {
        console.error(err);
        setStatus(previousStatus); // revert on failure
      }
    });
  }

  const styles = STATUS_STYLES[status] ?? STATUS_STYLES.new;

  return (
    <div className="relative inline-flex">
      <select
        value={status}
        onChange={handleChange}
        disabled={isPending}
        className={`appearance-none rounded-full border py-1 pl-3 pr-7 text-xs font-semibold capitalize outline-none transition-opacity disabled:opacity-50 ${styles}`}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option} className="bg-slate-900 text-slate-100">
            {option}
          </option>
        ))}
      </select>
      <ChevronIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2" />
    </div>
  );
}
