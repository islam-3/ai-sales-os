"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";
import {
  greetingNeedsReview,
  isRtlText,
  storedGreetingFor,
  translationSourceFor,
} from "@/lib/chat-intro-i18n";
import { firstSentenceOf, splitStoredGreeting } from "@/lib/chat-intro";
import { GREETING_MAX_CHARS } from "@/lib/greeting-prompts";
import { languageName } from "@/lib/languages";
import type { TenantSettings } from "@/lib/tenant-settings";
import { saveGreeting, suggestGreeting, translateGreeting } from "@/app/dashboard/business/actions";

// The welcome message a visitor sees before they have typed anything.
//
// One field of prose, written as a visitor reads it, plus a plain list
// of buttons. What it replaced was fifteen separately translatable
// strings assembled with {business} and {place} substituted in — every
// piece of which existed because WE needed it translatable, and which
// the owner paid for with a fifteen-field form for a welcome message.
//
// Built from the same SectionCard, Button, Input and Textarea as every
// other card on this page. The previous version used its own card and
// default-size buttons, so it sat a shade darker than the card above it
// with visibly different controls.

type Props = {
  settings: TenantSettings;
  businessName: string;
  /** What visitors see right now, whatever is or is not stored. */
  liveText: string;
  /** The chips derived from the knowledge base, for a first-time editor. */
  derivedChips: string[];
};

/**
 * Remounts the editor when what is stored changes.
 *
 * Without it the fields initialise once and never again, so pressing a
 * button saved the right thing and changed nothing on screen — which
 * looked exactly like a button that does nothing.
 */
export function ChatGreetingCard(props: Props) {
  const stored = storedGreetingFor(
    props.settings.chat_intro?.greetings,
    props.settings.chat_language
  );
  const revision = [
    props.settings.chat_language ?? "-",
    stored?.approved ? "live" : "draft",
    stored?.text ?? "-",
    JSON.stringify(stored?.chips ?? null),
  ].join("|");
  return <GreetingEditor key={revision} {...props} />;
}

function GreetingEditor({ settings, businessName, liveText, derivedChips }: Props) {
  const router = useRouter();
  const language = settings.chat_language?.trim() ?? "";
  const languageLabel = languageName(language) || language || "English";
  const greetings = settings.chat_intro?.greetings;
  const stored = storedGreetingFor(greetings, language);

  const [text, setText] = useState(stored?.text ?? liveText);
  // Absent means derive, so a first-time editor starts from the derived
  // chips rather than from nothing. Nothing persists until Save, which
  // is what keeps "never set" distinguishable from "set to these".
  const [chips, setChips] = useState<string[]>(stored?.chips ?? derivedChips);
  // Whether the current text came from Suggest wording and has not been
  // retyped, so a save can record where the words came from.
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "suggest" | "translate" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const place = settings.location?.city ?? settings.location?.country ?? null;
  const renameNeeded = greetingNeedsReview(stored, { businessName, place });
  const rtl = isRtlText(text);

  // A translation nobody has read yet: the only state where something is
  // stored and NOT live, and the only reason an approval step exists.
  const awaitingReview = !!stored && !stored.approved;

  // ── Is there anything to translate? ────────────────────────────────
  // Decided from which language key the greeting is filed under, never
  // from the words. Non-null means the owner has a greeting in some
  // other language and none in the one visitors are greeted in.
  //
  // It stays available while a translation is UNAPPROVED, so a bad one
  // can be redone from the original rather than hand-edited; once saved,
  // a greeting exists for this language and there is nothing left to do.
  const translateFrom = translationSourceFor(greetings, language, {
    ignoreExisting: awaitingReview,
  });

  const dirty =
    text !== (stored?.text ?? liveText) ||
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
        setFromSuggestion(true);
        setEditing(true);
        setNotice("A suggestion — read it, change what you want, then save.");
        return;
      }

      const result =
        kind === "translate" ? await translateGreeting() : await saveGreeting(text, chips, fromSuggestion);
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
    <SectionCard
      title="Welcome message"
      description="The first thing every visitor sees, before they have typed anything. Once they write, the assistant replies in their own language — this is the part it cannot adapt."
      footer={
        <SectionCardFooter
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : notice ? (
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {notice}
              </span>
            ) : null
          }
        >
          <Button type="button" size="sm" disabled={busy !== null || !dirty} onClick={() => run("save")}>
            {busy === "save" ? "Saving…" : "Save changes"}
          </Button>
        </SectionCardFooter>
      }
    >
      {renameNeeded && (
        <Notice>
          You changed your{" "}
          {renameNeeded.name && renameNeeded.place
            ? "business name and city"
            : renameNeeded.name
              ? "business name"
              : "city"}{" "}
          — check your welcome message still reads correctly. We do not edit your words.
        </Notice>
      )}

      {/* The most important line in this card. The owner's greeting is
          stored and safe, and visitors are NOT seeing it — they are
          being greeted with our built-in default for their language.
          Without saying so, "my greeting is saved" and "my greeting is
          live" look identical from here. */}
      {translateFrom && !awaitingReview && (
        <Notice>
          Your welcome message is written in{" "}
          {languageName(translateFrom.language) || translateFrom.language}, and visitors are greeted
          in {languageLabel}. They are seeing our built-in {languageLabel} greeting at the moment —
          your own words are kept and will come back if you switch the chat language.
        </Notice>
      )}

      {awaitingReview && (
        <Notice>
          This was translated for you and is not live yet. Read it, then save.
        </Notice>
      )}

      {/* What a visitor actually sees, laid out as they see it. */}
      <div className="rounded-lg border bg-muted/30 p-4" dir={rtl ? "rtl" : "ltr"}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {awaitingReview ? `Not live yet — ${languageLabel}` : "What visitors see"}
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">{shown.title || "—"}</p>
        {shown.sub && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{shown.sub}</p>}
        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip, i) => (
              <span
                key={`${chip}-${i}`}
                className="rounded-full border bg-background px-2.5 py-1 text-xs text-foreground"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="greeting-text" className="text-xs text-muted-foreground">
              The message
            </Label>
            <Textarea
              id="greeting-text"
              value={text}
              dir={rtl ? "rtl" : "ltr"}
              rows={4}
              onChange={(e) => {
                setText(e.target.value);
                setFromSuggestion(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Write it exactly as a visitor will read it, including your business name.
              {text.length > GREETING_MAX_CHARS && (
                <span className="text-warning"> {text.length} characters — long for a phone screen.</span>
              )}
            </p>
          </div>

          <ChipList chips={chips} rtl={rtl} derived={derivedChips} onChange={setChips} />
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
          {editing ? "Hide" : "Edit"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => run("suggest")}
        >
          {busy === "suggest" ? "Writing…" : "Suggest wording"}
        </Button>
        {/* Shown only when there is a greeting in another language to
            translate FROM. On a tenant writing English for English
            visitors there is nothing to do, and this used to offer to
            translate English into English. */}
        {translateFrom && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() => run("translate")}
          >
            {busy === "translate"
              ? "Translating…"
              : `Translate from ${languageName(translateFrom.language) || translateFrom.language} to ${languageLabel}`}
          </Button>
        )}
      </div>
    </SectionCard>
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

  const add = () => {
    if (!draft.trim()) return;
    onChange([...chips, draft.trim()]);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Label className="text-xs text-muted-foreground">Starter buttons</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
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
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Move "${chip}" down`}
            disabled={i === chips.length - 1}
            onClick={() => move(i, i + 1)}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove "${chip}"`}
            onClick={() => onChange(chips.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
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
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
        />
        <Button type="button" size="sm" variant="outline" disabled={!draft.trim()} onClick={add}>
          Add
        </Button>
      </div>

      {/* Offered only when it would change something, so it is never a
          button that appears to do nothing. */}
      {derived.length > 0 && JSON.stringify(derived) !== JSON.stringify(chips) && (
        <button
          type="button"
          onClick={() => onChange(derived)}
          className="self-start text-xs text-muted-foreground underline underline-offset-2"
        >
          Use the ones from my knowledge base
        </button>
      )}
    </div>
  );
}

/**
 * An inline note inside a SectionCard.
 *
 * border-warning/30 on bg-warning/10 with text-warning, which is the
 * shape every other notice on the dashboard already uses — see
 * LegalPage and the usage banner. NOT warning-foreground: that one is
 * built to sit on a solid bg-warning and is near-white in light mode,
 * so on a 10% tint it would be unreadable.
 */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-warning">
      {children}
    </p>
  );
}
