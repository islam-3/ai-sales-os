"use client";

import { ImageIcon, Video } from "lucide-react";
import { MediaType } from "@/lib/knowledge-base";

// Small square preview used both for a saved entry's attached media and
// for a not-yet-uploaded file selected in the add/edit form. Images get a
// real thumbnail; video gets an icon + label since generating a client-side
// video thumbnail isn't worth the complexity here.
export function MediaThumb({
  url,
  type,
  size = "md",
}: {
  url: string;
  type: MediaType;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-12 w-12" : "h-16 w-16";

  if (type === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Attached media"
          className={`${dims} rounded-md border object-cover`}
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`flex ${dims} shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border bg-muted text-muted-foreground hover:text-foreground`}
      aria-label="Attached video — open in new tab"
    >
      <Video className="h-4 w-4" />
      <span className="text-[10px] font-medium">Video</span>
    </a>
  );
}

export function MediaTypeIcon({ type, className }: { type: MediaType; className?: string }) {
  return type === "image" ? (
    <ImageIcon className={className} />
  ) : (
    <Video className={className} />
  );
}
