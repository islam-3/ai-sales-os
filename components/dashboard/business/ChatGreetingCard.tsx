"use client";

import { useState } from "react";
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
  blockedFromPublishing,
  chatIntroStatus,
  isRtlText,
  ownLabel,
  resolveChatIntroStrings,
  resolveIntroLine,
  staleKeys,
  type ChatIntroKey,
  type ChatIntroStrings,
} from "@/lib/chat-intro-i18n";
import { detectScript, scriptForLanguage } from "@/lib/visitor-language";
import type { TenantSettings } from "@/lib/tenant-settings";

type Props = {
  settings: TenantSettings;
  businessName: string;
  /** Which chips this tenant actually shows, and the ones it never will. */
  shownChipKeys: ChatIntroKey[];
  /** Chips built from the owner's own category names, which are never translated. */
  ownWordChips: string[];
  /** The line the greeting derives from the business description, if any. */
  introLine: string | null;
};

/**
 * Remounts the editor whenever the stored translation changes.
 *
 * Without this the editor's state was initialised once and never again,
 * so pressing Generate stored a correct translation and changed nothing
 * on screen — it looked like the button did nothing at all, and the
 * fields kept showing English that could then be approved.
 */
export function ChatGreetingCard(props: Props) {
  const stored = props.settings.chat_intro;
  const revision = [
    stored?.language ?? "-",
    stored?.sourceHash ?? "-",
    stored?.approved ? "live" : "draft",
    JSON.stringify(stored?.strings ?? null),
    JSON.stringify(stored?.ownLabels ?? null),
  ].join("|");
  return <GreetingEditor key={revision} {...props} />;
}

function GreetingEditor({
  settings,
  businessName,
  shownChipKeys,
  ownWordChips,
  introLine,
}: Props) {
  const router = useRouter();
  const language = settings.chat_language?.trim() ?? "";
  const status = chatIntroStatus(settings);
  const stale = staleKeys(settings.chat_intro);

  // What a visitor is greeted with this moment, whatever the draft says.
  const liveStrings = resolveChatIntroStrings(language, settings.chat_intro);

  // Never pre-filled with the English source: an untranslated draft that
  // looks like a draft is how English gets approved as Arabic.
  const [draft, setDraft] = useState<ChatIntroStrings | null>(
    settings.chat_intro?.strings ?? null
  );
  // The owner's own words for their own categories and city. Owner-written,
  // so they apply as soon as they are saved rather than waiting for
  // sign-off - there is nothing generated to review.
  const [labels, setLabels] = useState<Record<string, string>>(
    settings.chat_intro?.ownLabels ?? {}
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<null | "generate" | "save" | "approve">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const place = settings.location?.city ?? settings.location?.country ?? null;

  const blocked = draft
    ? blockedFromPublishing(language, draft, (text) => detectScript([text]), scriptForLanguage)
    : null;

  async function run(kind: "generate" | "save" | "approve") {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const result =
        kind === "generate"
          ? await generateChatIntroTranslation()
          : await saveChatIntroTranslation(draft ?? liveStrings, kind === "approve", labels);

      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Nothing was changed.");
        return;
      }
      setNotice(
        kind === "generate"
          ? `Translated into ${language}. Read it below, then make it live.`
          : kind === "approve"
            ? "Live. Visitors are greeted with this now."
            : "Draft saved. Not live yet."
      );
      router.refresh();
    } catch {
      // A thrown action still has to say something: a button that reports
      // nothing is indistinguishable from one that does nothing.
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  }

  if (!language) {
    return (
      <Card>
        <Header title="Greeting and starter chips" />
        <p className="mt-1 text-xs text-muted-foreground">
          Every first-time visitor sees this before they type anything. Set a default chat language
          above to show it in a language other than English.
        </p>
      </Card>
    );
  }

  const fallbackName = status.showing === "built-in" ? language : "English";

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Header title="Greeting and starter chips" />
        <StatusBadge showing={status.showing} pending={status.pending} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        The first thing every visitor sees, before they have typed anything. Once they write, the
        assistant replies in their own language — this is the part it cannot adapt.
      </p>

      {/* The primary action leads when there is nothing to review yet. */}
      {!draft && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed p-4">
          <p className="text-xs text-muted-foreground">
            Nothing has been translated yet, so visitors are greeted in {fallbackName}.
          </p>
          <div>
            <Button type="button" disabled={busy !== null} onClick={() => run("generate")}>
              {busy === "generate" ? "Translating…" : `Generate ${language} greeting`}
            </Button>
          </div>
        </div>
      )}

      <Preview
        label={`What visitors see now — ${status.showing === "approved" ? language : fallbackName}`}
        strings={liveStrings}
        businessName={businessName}
        place={place}
        chipKeys={shownChipKeys}
        ownWordChips={ownWordChips}
        labels={labels}
        introLine={introLine}
        language={language}
        muted
      />

      {draft && (
        <>
          <Preview
            label={`Your draft — ${language}${status.showing === "approved" ? " (live)" : " (not live yet)"}`}
            strings={draft}
            businessName={businessName}
            place={place}
            chipKeys={shownChipKeys}
            ownWordChips={ownWordChips}
            labels={labels}
            introLine={introLine}
            language={language}
          />

          {stale.length > 0 && (
            <Banner tone="warn">
              We changed the wording of {stale.length} line{stale.length === 1 ? "" : "s"} since this
              was translated. Review {stale.length === 1 ? "it" : "them"} and make it live again;
              everything else keeps your wording.
            </Banner>
          )}

          {blocked === "unchanged-from-english" && (
            <Banner tone="warn">
              This is still the English wording, so it cannot be made live as your {language}{" "}
              greeting.
            </Banner>
          )}
          {blocked === "wrong-script" && (
            <Banner tone="warn">
              This does not look like {language}. Check the wording before making it live.
            </Banner>
          )}

          {error && <Banner tone="error">{error}</Banner>}
          {notice && !error && <Banner tone="ok">{notice}</Banner>}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" disabled={busy !== null || blocked !== null} onClick={() => run("approve")}>
              {busy === "approve"
                ? "Publishing…"
                : status.showing === "approved"
                  ? "Save & keep live"
                  : "Approve & make live"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing((v) => !v)}>
              {editing ? "Hide wording" : "Edit wording"}
            </Button>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => run("generate")}>
              {busy === "generate" ? "Translating…" : "Translate again"}
            </Button>
          </div>

          {editing && (
            <Fields
              draft={draft}
              stale={stale}
              businessName={businessName}
              place={place}
              shownChipKeys={shownChipKeys}
              ownWordChips={ownWordChips}
              labels={labels}
              language={language}
              introLine={introLine}
              busy={busy !== null}
              onChange={(key, value) => setDraft({ ...draft, [key]: value })}
              onLabelChange={(original, value) => setLabels({ ...labels, [original]: value })}
              onSaveDraft={() => run("save")}
            />
          )}
        </>
      )}

      {!draft && error && <Banner tone="error">{error}</Banner>}
      {!draft && notice && !error && <Banner tone="ok">{notice}</Banner>}
    </Card>
  );
}

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

function StatusBadge({ showing, pending }: { showing: string; pending: string | null }) {
  if (showing === "approved") {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
        Live
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      {pending === "awaiting-approval" ? "Not live yet" : "Not live"}
    </span>
  );
}

/** Substitutes the real name and city, exactly as the chat page does. */
function fill(template: string, businessName: string, place: string | null) {
  return template.replace("{business}", businessName).replace("{place}", place ?? "");
}

function Preview({
  label,
  strings,
  businessName,
  place,
  chipKeys,
  ownWordChips,
  labels,
  introLine,
  language,
  muted,
}: {
  label: string;
  strings: ChatIntroStrings;
  businessName: string;
  place: string | null;
  chipKeys: ChatIntroKey[];
  ownWordChips: string[];
  labels: Record<string, string>;
  introLine: string | null;
  language: string;
  muted?: boolean;
}) {
  // Shown exactly as the chat will show it, the owner's own words
  // included - otherwise the preview reads better than the real thing.
  const shownPlace = place ? ownLabel(place, labels) : null;
  const shownIntro = introLine ? resolveIntroLine(introLine, labels, language) : null;
  const title = shownPlace
    ? fill(strings.opener_with_place, businessName, shownPlace)
    : fill(strings.opener, businessName, null);
  const rtl = isRtlText(`${title} ${strings.help}`);

  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div
        className={`rounded-lg border p-4 ${muted ? "bg-muted/30" : "bg-background"}`}
        dir={rtl ? "rtl" : "ltr"}
      >
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {/* Rendered the way the chat renders it, dropped line and all.
              Leaving it out of the preview is how an English sentence
              survived inside an Arabic greeting unnoticed. */}
          {shownIntro ? `${shownIntro} ${strings.help}` : strings.help}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chipKeys.map((key) => (
            <span key={key} className="rounded-full border px-2.5 py-1 text-xs">
              {strings[key]}
            </span>
          ))}
          {ownWordChips.map((chip) => (
            <span key={chip} className="rounded-full border px-2.5 py-1 text-xs">
              {ownLabel(chip, labels)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

const FIELD_HINTS: Partial<Record<ChatIntroKey, string>> = {
  opener_with_place: "Opening line",
  opener: "Opening line when no city is set",
  help: "The line inviting them to write",
};

function Fields({
  draft,
  stale,
  businessName,
  place,
  shownChipKeys,
  ownWordChips,
  labels,
  language,
  introLine,
  busy,
  onChange,
  onLabelChange,
  onSaveDraft,
}: {
  draft: ChatIntroStrings;
  stale: ChatIntroKey[];
  businessName: string;
  place: string | null;
  shownChipKeys: ChatIntroKey[];
  ownWordChips: string[];
  labels: Record<string, string>;
  language: string;
  introLine: string | null;
  busy: boolean;
  onChange: (key: ChatIntroKey, value: string) => void;
  onLabelChange: (original: string, value: string) => void;
  onSaveDraft: () => void;
}) {
  const [showOthers, setShowOthers] = useState(false);
  const rtl = isRtlText(Object.values(draft).join(" "));
  const greetingKeys: ChatIntroKey[] = place
    ? ["opener_with_place", "help"]
    : ["opener", "help"];
  const otherChipKeys = (Object.keys(CHAT_INTRO_SOURCE) as ChatIntroKey[]).filter(
    (k) => k.startsWith("chip_") || k.startsWith("fallback_")
  ).filter((k) => !shownChipKeys.includes(k));

  return (
    <div className="mt-4 flex flex-col gap-4 border-t pt-4">
      <FieldGroup
        title="Greeting"
        keys={greetingKeys}
        draft={draft}
        stale={stale}
        rtl={rtl}
        businessName={businessName}
        place={place}
        onChange={onChange}
      />
      <FieldGroup
        title="Starter chips visitors see"
        keys={shownChipKeys}
        draft={draft}
        stale={stale}
        rtl={rtl}
        businessName={businessName}
        place={place}
        onChange={onChange}
      />

      <OwnWordFields
        language={language}
        place={place}
        introLine={introLine}
        ownWordChips={ownWordChips}
        labels={labels}
        rtl={rtl}
        onChange={onLabelChange}
      />

      {otherChipKeys.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOthers((v) => !v)}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            {showOthers ? "Hide" : "Show"} other chips that may appear ({otherChipKeys.length})
          </button>
          {showOthers && (
            <div className="mt-3">
              <FieldGroup
                title=""
                keys={otherChipKeys}
                draft={draft}
                stale={stale}
                rtl={rtl}
                businessName={businessName}
                place={place}
                onChange={onChange}
              />
            </div>
          )}
        </div>
      )}

      <div>
        <Button type="button" variant="outline" disabled={busy} onClick={onSaveDraft}>
          Save draft
        </Button>
      </div>
    </div>
  );
}

function FieldGroup({
  title,
  keys,
  draft,
  stale,
  rtl,
  businessName,
  place,
  onChange,
}: {
  title: string;
  keys: ChatIntroKey[];
  draft: ChatIntroStrings;
  stale: ChatIntroKey[];
  rtl: boolean;
  businessName: string;
  place: string | null;
  onChange: (key: ChatIntroKey, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {title && <p className="text-xs font-medium text-muted-foreground">{title}</p>}
      {keys.map((key) => (
        <TokenField
          key={key}
          fieldKey={key}
          value={draft[key]}
          stale={stale.includes(key)}
          rtl={rtl}
          businessName={businessName}
          place={place}
          onChange={(value) => onChange(key, value)}
        />
      ))}
    </div>
  );
}

/**
 * One editable line, with {business} and {place} shown as fixed tokens.
 *
 * The owner edits the words around them and cannot delete or mistype the
 * placeholders, which previously appeared raw and could be broken with a
 * stray keystroke. A field with no placeholder is an ordinary input.
 */
function TokenField({
  fieldKey,
  value,
  stale,
  rtl,
  businessName,
  place,
  onChange,
}: {
  fieldKey: ChatIntroKey;
  value: string;
  stale: boolean;
  rtl: boolean;
  businessName: string;
  place: string | null;
  onChange: (value: string) => void;
}) {
  const source = CHAT_INTRO_SOURCE[fieldKey];
  const label = FIELD_HINTS[fieldKey] ?? source;
  const parts = value.split(/(\{business\}|\{place\})/);
  const hasTokens = parts.some((p) => p === "{business}" || p === "{place}");

  function replaceSegment(index: number, next: string) {
    const rebuilt = parts.map((p, i) => (i === index ? next : p)).join("");
    onChange(rebuilt);
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">
        {label}
        {stale && <span className="ml-2 text-amber-700 dark:text-amber-300">· wording changed</span>}
      </Label>

      {hasTokens ? (
        <div
          className="flex flex-wrap items-center gap-1 rounded-md border p-1.5"
          dir={rtl ? "rtl" : "ltr"}
        >
          {parts.map((part, index) =>
            part === "{business}" || part === "{place}" ? (
              <span
                key={index}
                className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                title="Filled in automatically and cannot be edited"
              >
                {part === "{business}" ? businessName : (place ?? "your city")}
              </span>
            ) : (
              <input
                key={index}
                value={part}
                dir={rtl ? "rtl" : "ltr"}
                onChange={(e) => replaceSegment(index, e.target.value)}
                className="min-w-[2rem] flex-1 bg-transparent px-1 text-sm outline-none"
              />
            )
          )}
        </div>
      ) : (
        <Input value={value} dir={rtl ? "rtl" : "ltr"} onChange={(e) => onChange(e.target.value)} />
      )}

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none opacity-70">English original</summary>
        <span>{source}</span>
      </details>
    </div>
  );
}

/**
 * The owner's own words: their categories and their city.
 *
 * These are business details, so nothing may translate them but the
 * person who owns them - a model guessing a city or a service name is
 * stating a fact about the business it has no way to know. Left empty,
 * the original stands, which is why an Arabic greeting could sit above
 * buttons reading "Dental treatment" until now.
 */
function OwnWordFields({
  language,
  place,
  introLine,
  ownWordChips,
  labels,
  rtl,
  onChange,
}: {
  language: string;
  place: string | null;
  introLine: string | null;
  ownWordChips: string[];
  labels: Record<string, string>;
  rtl: boolean;
  onChange: (original: string, value: string) => void;
}) {
  const originals = [...(place ? [place] : []), ...ownWordChips];
  const introOmitted =
    introLine !== null && !labels[introLine]?.trim() && resolveIntroLine(introLine, labels, language) === null;
  if (originals.length === 0 && introLine === null) return null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground">Your own words</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Your categories and city, as they should read in {language}. We never translate these
          ourselves — they are your details to state. Leave one empty to keep it as it is.
        </p>
      </div>
      {introLine && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">
            The line about your business
            {introOmitted && (
              <span className="ml-2 text-amber-700 dark:text-amber-300">
                · left out until you write it in {language}
              </span>
            )}
          </Label>
          <textarea
            value={labels[introLine] ?? ""}
            dir={rtl ? "rtl" : "ltr"}
            placeholder={introLine}
            rows={2}
            onChange={(e) => onChange(introLine, e.target.value)}
            className="w-full rounded-md border bg-transparent p-2 text-sm outline-none"
          />
          <p className="text-[11px] text-muted-foreground">
            Taken from your business description. Left empty, it is dropped from the greeting rather
            than shown in another language.
          </p>
        </div>
      )}

      {originals.map((original) => (
        <div key={original} className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">{original}</Label>
          <Input
            value={labels[original] ?? ""}
            dir={rtl ? "rtl" : "ltr"}
            placeholder={original}
            onChange={(e) => onChange(original, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
