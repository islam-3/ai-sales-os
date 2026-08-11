"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
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
import { KnowledgeEntry } from "@/lib/knowledge-base";
import { deleteKnowledgeEntry, updateKnowledgeEntry } from "@/app/dashboard/settings/actions";

export function KnowledgeEntryCard({
  entry,
  categories,
}: {
  entry: KnowledgeEntry;
  categories: string[];
}) {
  const [isEditing, setIsEditing] = useState(false);
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
    startTransition(async () => {
      try {
        const result = await updateKnowledgeEntry(entry.id, content, category);
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
          <Label className="text-xs text-muted-foreground">Content</Label>
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
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

        {error && <p className="text-sm text-red-400">{error}</p>}
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

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm text-foreground/90">{entry.content}</p>
          {!entry.hasEmbedding && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Not yet indexed for chat search
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setIsEditing(true)}
            aria-label="Edit entry"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="Delete entry"
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

      {deleteError && (
        <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-sm text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {deleteError}
          {isDeleting && " (retrying…)"}
        </p>
      )}
    </div>
  );
}
