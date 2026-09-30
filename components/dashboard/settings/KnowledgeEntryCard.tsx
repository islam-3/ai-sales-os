"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  KnowledgeEntry,
  TITLE_MAX_LENGTH,
  entrySnippet,
  entryTitle,
} from "@/lib/knowledge-base";
import {
  deleteKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/app/dashboard/settings/actions";

// One knowledge entry, as a compact row that expands in place.
//
// It used to render every entry's full text permanently, so a single long
// entry could fill the screen and a few dozen made the page unreadable.
// Collapsed is now the default: one line of title, one of snippet, and
// the actions — enough to find something, not enough to bury the rest.
export function KnowledgeEntryCard({
  entry,
  categories,
}: {
  entry: KnowledgeEntry;
  categories: string[];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [category, setCategory] = useState(entry.category ?? "");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // AlertDialogAction closes the dialog as soon as it's clicked (that's
  // its intended behavior), so a failed delete can't keep the dialog
  // open — instead it surfaces as a banner on the card itself.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();




  function handleSave() {
    setError(null);
    setWarning(null);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("content", content);
    formData.append("category", category);

    startTransition(async () => {
      try {
        const result = await updateKnowledgeEntry(entry.id, formData);
        if (result.embeddingFailed) {
          setWarning(
            "Saved, but re-indexing failed — chat search may still use the old version until this succeeds."
          );
        } else {
          setIsEditing(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save changes");
      }
    });
  }

  function handleCancel() {
    setTitle(entry.title);
    setContent(entry.content);
    setCategory(entry.category ?? "");
    setError(null);
    setWarning(null);
    setIsEditing(false);
  }

  function handleDelete() {
    setDeleteError(null);
    startDeleteTransition(async () => {
      try {
        await deleteKnowledgeEntry(entry.id);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : "Failed to delete entry");
      }
    });
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Warranty & guarantees"
            maxLength={TITLE_MAX_LENGTH}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Content</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Input
            list="knowledge-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="knowledge-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* The photo and video upload went with image sending. A business
            uploading twenty before-and-after photos and then watching the
            assistant never share them is a false expectation, and a worse
            one than never offering the field at all. Photos belong in the
            words of an entry now - "we have 200 before-and-after cases,
            the team shares them on WhatsApp". */}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {warning && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {warning}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  // The business's own title, with a derived fallback for rows that
  // predate the title column or were written outside this form.
  const displayTitle = entryTitle(entry);
  const snippet = entrySnippet(entry);

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start gap-2 p-3">
        {/*
          The row's own button covers only the text, not the whole row —
          nesting the edit and delete controls inside a button is invalid
          HTML and breaks keyboard use. This keeps one clear hit target
          for expanding and leaves the actions independent.
        */}
        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
              isExpanded ? "rotate-90" : ""
            }`}
            aria-hidden
          />

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 truncate text-sm font-medium text-foreground">
                {displayTitle}
              </span>

              {!entry.hasEmbedding && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning"
                  title="Not yet indexed for chat search"
                >
                  <AlertTriangle className="h-3 w-3" />
                  Not indexed
                </span>
              )}
            </span>

            {/* Hidden once expanded — the full text is right below it, so
                a truncated copy would just be a duplicate line. */}
            {snippet && !isExpanded && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {snippet}
              </span>
            )}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setIsEditing(true)}
            aria-label={`Edit entry: ${displayTitle}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label={`Delete entry: ${displayTitle}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes it from the knowledge base permanently, and it will no longer be
                  available to the chat assistant. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t bg-muted/20 px-3 py-3 pl-9">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {entry.content}
          </p>
        </div>
      )}

      {deleteError && (
        <p className="flex items-center gap-1.5 border-t px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {deleteError}
          {isDeleting && " (retrying…)"}
        </p>
      )}
    </div>
  );
}
