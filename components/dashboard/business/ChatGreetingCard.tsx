"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { greetingNeedsReview, isRtlText, storedGreetingFor } from "@/lib/chat-intro-i18n";
import { firstSentenceOf, splitStoredGreeting } from "@/lib/chat-intro";
import { GREETING_MAX_CHARS } from "@/lib/greeting-prompts";
import { languageName } from "@/lib/languages";
import type { TenantSettings } from "@/lib/tenant-settings";
import {
  saveGreeting,
  suggestGreeting,
  translateGreeting,
} from "@/app/dashboard/business/actions";

// The welcome message a visitor sees before they have typed anything.
//
// ── What this replaced, and why ──────────────────────────────────────
// Fifteen separately translatable strings — an opener, an opener with a
// city in it, a line inviting them to write, and a label for each
// category we could recognise — assembled at render time with
// {business} and {place} substituted in. Every piece existed because WE
// needed it translatable independently, and the business owner paid for
// that with a fifteen-field form to fill in for a welcome message.
//
// It is one field now, written as a visitor reads it, with the business
// name typed into the prose like any other word. The chips stay
// structured, because they are buttons, but as a plain list.
//
// The placeholders are gone deliberately. A business renames itself once
// in several years, so templating was permanent complexity for a case
// that barely happens — and working out which words in someone's prose
// are "the business name" is text interpretation, which is where every
// hard bug in this project has come from. The cost is a greeting that
// goes stale on a rename, and that is handled visibly rather than by
// inference: see the reminder below.

type Props = {
  settings: TenantSettings;
  businessName: string;
  /** What visitors see right now, whatever is or is not stored. */
  liveText: string;
  liveChips: string[];
  /** The chips derived from the knowledge base, for a first-time editor. */
  derivedChips: string[];
};

/**
 * Remounts the editor when what is stored changes.
 *
 * Without it the fields initialise once and never again, so pressing a
 * button saved the right thing and changed nothing on screen — which
 * looked exactly like a button that did nothing.
 */
export function ChatGreetingCard(props: Props) {
  const stored = storedGreetingFor(props.settings.chat_intro?.greetings, props.settings.chat_language);
  const revision = [
    props.settings.chat_language ?? "-",
    stored?.approved ? "live" : "draft",
    stored?.text ?? "-",
    JSON.stringify(stored?.chips ?? null),
  ].join("|");
  return <GreetingEditor key={revision} {...props} />;
}

function GreetingEditor({ settings, businessName, liveText, liveChips, derivedChips }: Props) {
  const router = useRouter();
  const language = settings.chat_language?.trim() ?? "";
  const languageLabel = languageName(language) || language || "English";
  const stored = storedGreetingFor(settings.chat_intro?.greetings, language);

  const [text, setText] = useState(stored?.text ?? liveText);
  // Absent means derive, so a first-time editor starts from the derived
  // chips rather than from nothing. Nothing persists until Save, which
  // is what keeps "never set" distinguishable from "set to these".
  const [chips, setChips] = useState<string[]>(stored?.chips ?? derivedChips);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "suggest" | "translate" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const place = settings.location?.city ?? settings.location?.country ?? null;
  const renameNeeded = greetingNeedsReview(stored, { businessName, place });
  const rtl = isRtlText(text);

  // A translation nobody has read yet. The only state where something is
  // stored and NOT live, and the only reason an approval step exists.
  const awaitingReview = !!stored && !stored.approved;

  const dirty = text !== (stored?.text ?? liveText) ||
    JSON.stringify(chips) !== JSON.stringify(stored?.chips ?? derivedChips);

  async function run(kind: "suggest" | "translate" | "save") {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      if (kind === "suggest") {
        const result = await suggestGreeting();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        // Into the field, not into the database. Nothing a model wrote
        // goes live without the owner having had it in front of them.
        setText(result.text);
        setEditing(true);
        setNotice("A suggestion — read it, change what you want, then save.");
        return;
      }

      const result =
        kind === "translate" ? await translateGreeting(text, chips) : await saveGreeting(text, chips);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(
        kind === "translate"
          ? `Translated into ${languageLabel}. Read it, then save to make it live.`
          : "Saved. This is what visitors see now."
      );
      router.refresh();
    } catch {
      // A thrown action still has to say something: a button that
      // reports nothing is indistinguishable from one that does nothing.
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  const shown = splitStoredGreeting(text, firstSentenceOf(text));

  return (
    <Card>
      <Header title="Welcome message" />
      <p className="mt-1 text-xs text-muted-foreground">
        The first thing every visitor sees, before they have typed anything. Once they write, the
        assistant replies in their own language — this is the part it cannot adapt.
      </p>

      {renameNeeded && (
        <div className="mt-4">
          <Banner tone="warn">
            You changed your {renameNeeded.name && renameNeeded.place
              ? "business name and city"
              : renameNeeded.name
                ? "business name"
                : "city"}{" "}
            — check your welcome message still reads correctly. We do not edit your words.
          </Banner>
        </div>
      )}

      {/* What a visitor actually sees, laid out as they see it. */}
      <div className="mt-4 rounded-lg border bg-muted/30 p-4" dir={rtl ? "rtl" : "ltr"}>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {awaitingReview ? `Not live yet — ${languageLabel}` : "What visitors see"}
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">{shown.title || "—"}</p>
        {shown.sub && <p className="mt-1 text-sm text-muted-foreground">{shown.sub}</p>}
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip, i) => (
              <span key={`${chip}-${i}`} className="rounded-full border bg-background px-2.5 py-1 text-xs">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>

      {awaitingReview && (
        <Banner tone="warn">
          This was translated for you and has not been made live. Read it, then save.
        </Banner>
      )}

      {error && <Banner tone="error">{error}</Banner>}
      {notice && !error && <Banner tone="ok">{notice}</Banner>}

      {editing && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="greeting-text" className="text-xs text-muted-foreground">
              The message
            </Label>
            <textarea
              id="greeting-text"
              value={text}
              dir={rtl ? "rtl" : "ltr"}
              rows={4}
              onChange={(e) => setText(e.target.value)}
              className="w-full rounded-md border bg-transparent p-2.5 text-sm outline-none"
            />
            <p className="text-[11px] text-muted-foreground">
              Write it exactly as a visitor will read it, including your business name.{" "}
              {text.length > GREETING_MAX_CHARS && (
                <span className="text-amber-700 dark:text-amber-500">
                  {text.length} characters — long for a phone screen.
                </span>
              )}
            </p>
          </div>

          <ChipList chips={chips} rtl={rtl} onChange={setChips} derived={derivedChips} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" disabled={busy !== null || !dirty} onClick={() => run("save")}>
          {busy === "save" ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={() => setEditing((v) => !v)}>
          {editing ? "Hide" : "Edit"}
        </Button>
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => run("suggest")}>
          {busy === "suggest" ? "Writing…" : "Suggest wording"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null || !text.trim()}
          onClick={() => run("translate")}
        >
          {busy === "translate" ? "Translating…" : `Translate to ${languageLabel}`}
        </Button>
      </div>
      {!liveChips.length && !chips.length && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          No buttons — visitors just type. Add some under Edit if you want them.
        </p>
      )}
    </Card>
  );
}

/**
 * The starter chips: add, edit, remove, reorder.
 *
 * A plain list rather than a labelled field each, which is what twelve
 * of the fifteen old fields were. They stay structured because they are
 * buttons a visitor taps, not prose.
 */
function ChipList({
  chips,
  rtl,
  derived,
  onChange,
}: {
  chips: string[];
  rtl: boolean;
  /** What they would be if the owner had never set any. */
  derived: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const move = (from: number, to: number) => {
    if (to < 0 || to >= chips.length) return;
    const next = [...chips];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Starter buttons</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Tapped instead of typing. Leave the list empty to show none.
        </p>
      </div>

      {chips.map((chip, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={chip}
            dir={rtl ? "rtl" : "ltr"}
            onChange={(e) => {
              const next = [...chips];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move "${chip}" up`}
            disabled={i === 0}
            onClick={() => move(i, i - 1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move "${chip}" down`}
            disabled={i === chips.length - 1}
            onClick={() => move(i, i + 1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove "${chip}"`}
            onClick={() => onChange(chips.filter((_, j) => j !== i))}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-1.5">
        <Input
          value={draft}
          dir={rtl ? "rtl" : "ltr"}
          placeholder="Add a button…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !draft.trim()) return;
            e.preventDefault();
            onChange([...chips, draft.trim()]);
            setDraft("");
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!draft.trim()}
          onClick={() => {
            onChange([...chips, draft.trim()]);
            setDraft("");
          }}
        >
          Add
        </Button>
      </div>

      {/* Only offered when it would actually change something, so it is
          not a button that appears to do nothing. */}
      {derived.length > 0 && JSON.stringify(derived) !== JSON.stringify(chips) && (
        <button
          type="button"
          onClick={() => onChange(derived)}
          className="self-start text-[11px] text-muted-foreground underline underline-offset-2"
        >
          Use the ones from my knowledge base
        </button>
      )}
    </div>
  );
}

// Local, as they were before: three one-line presentational helpers used
// only by this card.
function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-xl border p-5">{children}</section>;
}

function Header({ title }: { title: string }) {
  return <h2 className="text-sm font-medium">{title}</h2>;
}

function Banner({ tone, children }: { tone: "warn" | "error" | "ok"; children: React.ReactNode }) {
  const styles = {
    warn: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    error: "bg-destructive/10 text-destructive",
    ok: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  }[tone];
  return <p className={`mt-3 rounded-md p-3 text-xs ${styles}`}>{children}</p>;
}
