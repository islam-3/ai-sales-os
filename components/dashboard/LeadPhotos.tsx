"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, ImageOff, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getLeadPhotos, type LeadPhoto } from "@/app/dashboard/actions";

// Renders a lead's chat-uploaded photos as thumbnails, with a lightbox on
// click. URLs are signed on demand rather than for every lead on page
// load: the bucket is private, signatures are short-lived, and most leads
// are never expanded — signing them all up front would be wasted work
// that also expires while sitting unused.
export function LeadPhotos({ leadId, count }: { leadId: string; count: number }) {
  const [photos, setPhotos] = useState<LeadPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<LeadPhoto | null>(null);

  useEffect(() => {
    let cancelled = false;

    getLeadPhotos(leadId)
      .then((result) => {
        if (!cancelled) setPhotos(result);
      })
      .catch((err) => {
        console.error("Failed to load lead photos:", err);
        if (!cancelled) setError("Couldn't load photos. Try reopening this lead.");
      });

    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (error) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-destructive">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        {error}
      </p>
    );
  }

  if (photos === null) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        Loading {count === 1 ? "photo" : `${count} photos`}…
      </p>
    );
  }

  // The lead claims attachments but none could be signed — usually the
  // objects were removed from the bucket. Say so rather than rendering an
  // empty gap the owner can't interpret.
  if (photos.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ImageOff className="h-3.5 w-3.5 shrink-0" />
        {count > 0 ? "Photos are no longer available" : "No photos attached"}
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo, i) => (
          <button
            key={photo.path || i}
            type="button"
            onClick={() => setActive(photo)}
            aria-label={`View photo ${i + 1} of ${photos.length} full size`}
            className="overflow-hidden rounded-md border transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`Lead photo ${i + 1}`}
              className="h-20 w-20 object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-3xl">
          {/* pr-10 keeps the Download button clear of the dialog's own
              absolutely-positioned close button in the top-right. */}
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0 pr-10">
            <DialogTitle className="text-sm font-medium text-muted-foreground">
              Photo shared by this lead
            </DialogTitle>
            {active && (
              // A plain link, not a fetch-to-blob dance: the signed URL
              // already carries Content-Disposition: attachment, so the
              // browser saves it instead of navigating. `download` is
              // kept as a same-origin-only hint; the header is what
              // actually does the work here.
              <a
                href={active.downloadUrl}
                download={active.filename}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Download className="h-3.5 w-3.5" />
                Download
              </a>
            )}
          </DialogHeader>
          {active && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.url}
              alt="Lead photo, full size"
              className="max-h-[75vh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
