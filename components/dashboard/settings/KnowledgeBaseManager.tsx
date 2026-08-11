"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KnowledgeEntry } from "@/lib/knowledge-base";
import { AddEntryForm } from "./AddEntryForm";
import { KnowledgeEntryCard } from "./KnowledgeEntryCard";

export function KnowledgeBaseManager({ entries }: { entries: KnowledgeEntry[] }) {
  const [isAdding, setIsAdding] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      const trimmed = entry.category?.trim();
      if (trimmed) set.add(trimmed);
    }
    return Array.from(set).sort();
  }, [entries]);

  const grouped = useMemo(() => {
    const map = new Map<string, KnowledgeEntry[]>();
    for (const entry of entries) {
      const key = entry.category?.trim() || "Uncategorized";
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [entries]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {entries.length === 0
            ? "No entries yet — add the first one below."
            : `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
        </p>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add entry
          </Button>
        )}
      </div>

      {isAdding && <AddEntryForm categories={categories} onDone={() => setIsAdding(false)} />}

      {grouped.length === 0 && !isAdding && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Add facts about the clinic — doctors, guarantees, technology,
            before/after stories — for the chat assistant to draw on.
          </p>
        </div>
      )}

      {grouped.map(([category, items]) => (
        <div key={category}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {category} <span className="font-normal">({items.length})</span>
          </h2>
          <div className="flex flex-col gap-3">
            {items.map((entry) => (
              <KnowledgeEntryCard key={entry.id} entry={entry} categories={categories} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
