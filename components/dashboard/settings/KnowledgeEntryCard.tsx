"use client";

import { useEffect, useRef, useState, useTransition, ChangeEvent } from "react";
import { AlertTriangle, Paperclip, Pencil, Trash2, Video, X } from "lucide-react";
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
import {
  deleteKnowledgeEntry,
  removeKnowledgeMedia,
  updateKnowledgeEntry,
} from "@/app/dashboard/settings/actions";
import { MediaThumb } from "./MediaThumb";

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
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // One object URL per pending new file, rebuilt whenever the list changes
  // and always revoked on the way out so they don't leak.
  const [previews, setPreviews] = useState<{ file: File; url: string }[]>([]);
  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => {
      next.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [files]);

  // Removing an already-saved media item happens immediately (its own
  // server call), independent of the Save button — tracked per media id so
  // several can be in flight without interfering with each other.
  const [removingMediaIds, setRemovingMediaIds] = useState<Set<string>>(new Set());
  const [mediaError, setMediaError] = useState<string | null>(null);

  // AlertDialogAction closes the dialog as soon as it's clicked (that's
  // its intended behavior), so a failed delete can't keep the dialog
  // open — instead it surfaces as a banner on the card itself.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  function handleFilesChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
    e.target.value = "";
  }

  function removeFileAt(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleRemoveExistingMedia(mediaId: string) {
    setMediaError(null);
    setRemovingMediaIds((prev) => new Set(prev).add(mediaId));
    try {
      await removeKnowledgeMedia(mediaId);
      // On success the parent re-fetches (revalidatePath) and this item
      // simply stops appearing in entry.media once fresh props arrive.
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Failed to remove media");
      setRemovingMediaIds((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
    }
  }

  function handleSave() {
    setError(null);
    setWarning(null);

    const formData = new FormData();
    formData.append("content", content);
    formData.append("category", category);
    files.forEach((file) => formData.append("files", file));

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
    setContent(entry.content);
    setCategory(entry.category ?? "");
    setFiles([]);
    setError(null);
    setWarning(null);
    setMediaError(null);
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

          {entry.media.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {entry.media.map((m) => (
                <div key={m.id} className="flex w-fit items-center gap-2 rounded-md border bg-muted/50 p-2">
                  <MediaThumb url={m.url} type={m.type} size="sm" />
                  <button
                    type="button"
                    onClick={() => handleRemoveExistingMedia(m.id)}
                    disabled={removingMediaIds.has(m.id)}
                    className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    {removingMediaIds.has(m.id) ? "Removing…" : "Remove"}
                  </button>
                </div>
              ))}
            </div>
          )}

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
            {entry.media.length > 0 || previews.length > 0 ? "Attach more files" : "Attach files"}
          </Button>

          {mediaError && <p className="text-sm text-destructive">{mediaError}</p>}
        </div>

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

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          {entry.media.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {entry.media.map((m) => (
                <MediaThumb key={m.id} url={m.url} type={m.type} />
              ))}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{entry.content}</p>
            {!entry.hasEmbedding && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Not yet indexed for chat search
              </p>
            )}
          </div>
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
        <p className="mt-3 flex items-center gap-1.5 border-t pt-3 text-sm text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {deleteError}
          {isDeleting && " (retrying…)"}
        </p>
      )}
    </div>
  );
}
