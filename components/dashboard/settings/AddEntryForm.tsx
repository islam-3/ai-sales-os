"use client";

import { useState, useTransition, FormEvent } from "react";
import { AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TITLE_MAX_LENGTH } from "@/lib/knowledge-base";
import { Button } from "@/components/ui/button";
import { createKnowledgeEntry } from "@/app/dashboard/settings/actions";

export function AddEntryForm({
  categories,
  onDone,
}: {
  categories: string[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // The photo and video upload is gone. Image sending was removed from
  // the chat, so an attached file would be stored, listed and never
  // shown to anyone - which is worse than not offering it.
  //
  // Visitor uploads in the chat are a DIFFERENT path and are untouched.

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("content", content);
    formData.append("category", category);

    startTransition(async () => {
      try {
        const result = await createKnowledgeEntry(formData);
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
        <Label htmlFor="new-title" className="text-xs text-muted-foreground">
          Title
        </Label>
        <Input
          id="new-title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Warranty & guarantees"
          maxLength={TITLE_MAX_LENGTH}
          required
        />
        <p className="text-xs text-muted-foreground">
          A short label for this fact. Your assistant sees it too, so name it the way a
          customer would ask about it.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-content" className="text-xs text-muted-foreground">
          Content
        </Label>
        <Textarea
          id="new-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. We have been operating for over 12 years and have served more than 5,000 customers from over 30 countries."
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
          placeholder="e.g. About us"
          required
        />
        <datalist id="knowledge-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
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
