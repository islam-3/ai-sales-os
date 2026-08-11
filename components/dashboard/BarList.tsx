import { TopEntry } from "@/lib/dashboard";

export function BarList({
  entries,
  emptyMessage = "Not enough data yet — insights appear as leads come in.",
}: {
  entries: TopEntry[];
  emptyMessage?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  const max = Math.max(...entries.map((e) => e.count));

  return (
    <ul className="flex flex-col gap-3.5">
      {entries.map((entry, i) => (
        <li key={entry.label} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-xs font-medium text-muted-foreground">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-foreground">{entry.label}</span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                {entry.count}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-zinc-300/60"
                style={{ width: `${Math.max(6, (entry.count / max) * 100)}%` }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
