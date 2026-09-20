"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateChatIntroTranslation,
  saveChatIntroTranslation,
} from "@/app/dashboard/business/actions";
import {
  CHAT_INTRO_SOURCE,
  chatIntroStatus,
  isRtlText,
  resolveChatIntroStrings,
  staleKeys,
  type ChatIntroKey,
  type ChatIntroStrings,
} from "@/lib/chat-intro-i18n";
import type { TenantSettings } from "@/lib/tenant-settings";

const GREETING_KEYS: ChatIntroKey[] = ["opener_with_place", "opener", "help"];
const CHIP_KEYS = (Object.keys(CHAT_INTRO_SOURCE) as ChatIntroKey[]).filter(
  (k) => !GREETING_KEYS.includes(k)
);

/** What each string is for, in the owner's terms rather than ours. */
const FIELD_HINTS: Partial<Record<ChatIntroKey, string>> = {
  opener_with_place: "Opening line when your city is set",
  opener: "Opening line when it is not",
  help: "The line that invites them to write",
};

export function ChatGreetingCard({
  settings,
  businessName,
}: {
  settings: TenantSettings;
  businessName: string;
}) {
  const router = useRouter();
  const status = chatIntroStatus(settings);
  const stale = staleKeys(settings.chat_intro);

  const live = resolveChatIntroStrings(settings.chat_language ?? "", settings.chat_intro);
  const [draft, setDraft] = useState<ChatIntroStrings>(
    settings.chat_intro?.strings ?? live
  );
  const [busy, setBusy] = useState<null | "generate" | "save" | "approve">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const place = settings.location?.city ?? settings.location?.country ?? null;
  const rtl = isRtlText(Object.values(draft).join(" "));

  // The preview is the point of this card: it is what a first-time
  // visitor reads before they type a word, with the real name and city
  // substituted in exactly as the chat does it.
  const previewTitle = place
    ? draft.opener_with_place.replace("{business}", businessName).replace("{place}", place)
    : draft.opener.replace("{business}", businessName);

  function set(key: ChatIntroKey, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  async function run(kind: "generate" | "save" | "approve", e?: FormEvent) {
    e?.preventDefault();
    setBusy(kind);
    setError(null);
    setSaved(false);
    try {
      const result =
        kind === "generate"
          ? await generateChatIntroTranslation()
          : await saveChatIntroTranslation(draft, kind === "approve");
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (!settings.chat_language) {
    return (
      <section className="rounded-xl border p-5">
        <h2 className="text-sm font-medium">Greeting &amp; starter chips</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every first-time visitor sees this before they type anything. Set a default chat language
          above to show it in a language other than English.
        </p>
      </section>
    );
  }

  const fallbackName = status.showing === "built-in" ? settings.chat_language : "English";

  return (
    <section className="rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Greeting &amp; starter chips</h2>
        <StatusBadge status={status.showing} pending={status.pending} />
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        This is the first thing every visitor sees, before they have typed anything. The assistant
        answers in whatever language they write in — this is the part it cannot adapt, so it is
        worth reading properly.
      </p>

      {status.pending && (
        <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {status.pending === "not-generated" &&
            `Your ${settings.chat_language} visitors are currently greeted in ${fallbackName}. Generate a translation and approve it to change that.`}
          {status.pending === "awaiting-approval" &&
            `Not live yet. Until you approve it, visitors are greeted in ${fallbackName}.`}
          {status.pending === "out-of-date" &&
            `We changed the wording of ${stale.length} line${stale.length === 1 ? "" : "s"} since this was translated. Review ${stale.length === 1 ? "it" : "them"} below and approve again; everything else keeps your wording.`}
        </p>
      )}

      <div className="mt-4 rounded-lg border bg-muted/40 p-4" dir={rtl ? "rtl" : "ltr"}>
        <p className="text-sm font-medium">{previewTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{draft.help}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CHIP_KEYS.slice(0, 4).map((key) => (
            <span key={key} className="rounded-full border px-2.5 py-1 text-xs">
              {draft[key]}
            </span>
          ))}
        </div>
      </div>

      <form onSubmit={(e) => run("save", e)} className="mt-4 flex flex-col gap-4">
        <Fields
          title="Greeting"
          keys={GREETING_KEYS}
          draft={draft}
          stale={stale}
          rtl={rtl}
          onChange={set}
        />
        <Fields
          title="Starter chips"
          keys={CHIP_KEYS}
          draft={draft}
          stale={stale}
          rtl={rtl}
          onChange={set}
        />

        {error && <p className="text-xs text-destructive">{error}</p>}
        {saved && !error && <p className="text-xs text-muted-foreground">Saved.</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => run("generate")}>
            {busy === "generate" ? "Translating…" : "Generate translation"}
          </Button>
          <Button type="submit" variant="outline" disabled={busy !== null}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </Button>
          <Button type="button" disabled={busy !== null} onClick={() => run("approve")}>
            {busy === "approve"
              ? "Publishing…"
              : status.showing === "approved"
                ? "Save & keep live"
                : "Approve & make live"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function StatusBadge({
  status,
  pending,
}: {
  status: "english" | "built-in" | "approved";
  pending: string | null;
}) {
  if (status === "approved") {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
        Live
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      {pending === "awaiting-approval" ? "Not approved" : "Not live"}
    </span>
  );
}

function Fields({
  title,
  keys,
  draft,
  stale,
  rtl,
  onChange,
}: {
  title: string;
  keys: ChatIntroKey[];
  draft: ChatIntroStrings;
  stale: ChatIntroKey[];
  rtl: boolean;
  onChange: (key: ChatIntroKey, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {keys.map((key) => (
        <div key={key} className="flex flex-col gap-1">
          <Label htmlFor={`intro-${key}`} className="text-xs text-muted-foreground">
            {FIELD_HINTS[key] ?? CHAT_INTRO_SOURCE[key]}
            {stale.includes(key) && (
              <span className="ml-2 text-amber-700 dark:text-amber-300">· wording changed</span>
            )}
          </Label>
          <Input
            id={`intro-${key}`}
            value={draft[key]}
            dir={rtl ? "rtl" : "ltr"}
            onChange={(e) => onChange(key, e.target.value)}
          />
          {FIELD_HINTS[key] && (
            <p className="text-[11px] text-muted-foreground">English: {CHAT_INTRO_SOURCE[key]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
