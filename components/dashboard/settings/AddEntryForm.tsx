"use client";

import { useEffect, useRef, useState, useTransition, FormEvent, ChangeEvent } from "react";
import { AlertTriangle, Paperclip, Video, X } from "lucide-react";
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
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // One object URL per pending file, rebuilt whenever the file list changes
  // and always revoked on the way out so they don't leak.
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => {
      next.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [files]);

  // Picking files again adds to the current selection rather than
  // replacing it, so multiple picks (or one multi-select) both work.
  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  }

  function removeFileAt(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);

    const formData = new FormData();
    formData.append("content", content);
    formData.append("category", category);
    files.forEach((file) => formData.append("files", file));

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

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Photos or videos (optional)</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFilesChange}
          className="hidden"
        />

        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {previews.map((p, i) => (
              <div
                key={`${p.file.name}-${i}`}
                className="flex w-fit items-center gap-2 rounded-md border bg-muted/50 p-2 text-xs text-muted-foreground"
              >
                {p.file.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="h-10 w-10 rounded object-cover" />
                ) : (
                  <Video className="h-4 w-4 shrink-0" />
                )}
                <span className="max-w-[12rem] truncate">{p.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFileAt(i)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${p.file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit gap-1.5"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          {previews.length > 0 ? "Attach more files" : "Attach files"}
        </Button>
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
