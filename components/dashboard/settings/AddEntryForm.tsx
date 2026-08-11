"use client";

import { useState, useTransition, FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { createKnowledgeEntry } from "@/app/dashboard/settings/actions";

export function AddEntryForm({
  categories,
  onDone,
}: {
  categories: string[];
  onDone: () => void;
}) {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);

    startTransition(async () => {
      try {
        const result = await createKnowledgeEntry(content, category);
        if (result.embeddingFailed) {
          setWarning(
            "Saved, but the embedding couldn't be generated — this entry won't show up in chat search until it's re-indexed."
          );
          setTimeout(onDone, 1800);
        } else {
          onDone();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save entry");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-content" className="text-xs text-muted-foreground">
          Content
        </Label>
        <Textarea
          id="new-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. Our clinic has been operating for over 12 years and has treated over 5,000 patients from more than 30 countries."
          rows={3}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-category" className="text-xs text-muted-foreground">
          Category
        </Label>
        <Input
          id="new-category"
          list="knowledge-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. clinic_overview"
          required
        />
        <datalist id="knowledge-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {warning && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {warning}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save entry"}
        </Button>
      </div>
    </form>
  );
}
