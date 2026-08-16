"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shows the business's own public chat link (built from the current
// origin, so it's correct in dev and in production alike) with a one-click
// copy button — meant for the owner to grab and drop into ads/their site.
export function ChatLinkCard({ slug }: { slug: string }) {
  const [url, setUrl] = useState(`/chat/${slug}`);
  const [copied, setCopied] = useState(false);

  // window isn't available during server rendering, so the origin is
  // filled in once mounted in the browser.
  useEffect(() => {
    setUrl(`${window.location.origin}/chat/${slug}`);
  }, [slug]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy chat link:", err);
      // The URL is still visible and selectable as plain text either way.
    }
  }

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Your chat link</p>
        <p className="truncate text-sm text-foreground">{url}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
