"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markChatLinkCopied } from "@/app/dashboard/onboarding-actions";

// Shows the business's own public chat link (built from the current
// origin, so it's correct in dev and in production alike) with a one-click
// copy button — meant for the owner to grab and drop into ads/their site.
export function ChatLinkCard({
  slug,
  /** False once the getting-started step for this is already ticked. */
  trackFirstUse = false,
}: {
  slug: string;
  trackFirstUse?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(`/chat/${slug}`);
  const [copied, setCopied] = useState(false);

  // window isn't available during server rendering, so the origin is
  // filled in once mounted in the browser.
  useEffect(() => {
    setUrl(`${window.location.origin}/chat/${slug}`);
  }, [slug]);

  // Ticks the "copy your chat link" checklist step. Failing to record it
  // must never break copying, so this is best-effort and swallows its
  // own errors — the worst case is the step stays unticked.
  async function recordFirstUse() {
    if (!trackFirstUse) return;
    try {
      await markChatLinkCopied();
      router.refresh();
    } catch (err) {
      console.error("Failed to record chat link use:", err);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy chat link:", err);
      // The URL is still visible and selectable as plain text either way.
    }
    // Deliberately outside the try: the owner has engaged with their link
    // either way, and on a browser that blocks clipboard access the copy
    // can fail while the intent was still clear.
    void recordFirstUse();
  }

  return (
    <div
      id="chat-link"
      className="mb-6 flex items-center justify-between gap-4 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">Your chat link</p>
        <p className="truncate text-sm text-foreground">{url}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Opening the link counts as trying it out, the same as copying. */}
        <Button asChild type="button" variant="ghost" size="sm" className="gap-1.5">
          <a href={url} target="_blank" rel="noreferrer" onClick={() => void recordFirstUse()}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open
          </a>
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
