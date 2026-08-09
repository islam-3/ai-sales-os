"use client";

import { useState, useTransition, ChangeEvent } from "react";
import { updateLeadStatus } from "./actions";

const STATUS_OPTIONS = ["new", "contacted", "qualified", "converted"] as const;

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

  return (
    <select
      value={status}
      onChange={handleChange}
      disabled={isPending}
      className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs capitalize outline-none disabled:opacity-50 dark:border-white/10"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
