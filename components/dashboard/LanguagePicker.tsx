"use client";

// Type to filter, pick from a fixed list.
//
// These were free-text inputs, which meant an owner could type "Arabic",
// "العربية" or "arabic " and get three values that nothing downstream
// could match. The list is finite so the stored value is always a code.
//
// Both names are shown on every row — "Arabic — العربية" — because an
// owner searching for their own language usually types it in their own
// script, and an English-only list is hardest to use in exactly the case
// that matters most.

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  LANGUAGES,
  languageByCode,
  languageLabel,
  searchLanguages,
  type Language,
} from "@/lib/languages";

/** A row, with an optional count shown on the right. */
function Row({
  language,
  selected,
  count,
  onPick,
}: {
  language: Language;
  selected: boolean;
  count?: number;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
    >
      <span className="flex items-center gap-2">
        <Check className={selected ? "h-3.5 w-3.5" : "h-3.5 w-3.5 opacity-0"} />
        <span>
          {language.name}
          {language.native !== language.name && (
            <span className="ml-1.5 text-muted-foreground" dir={language.rtl ? "rtl" : "ltr"}>
              {language.native}
            </span>
          )}
        </span>
      </span>
      {count !== undefined && <span className="text-xs text-muted-foreground">{count}</span>}
    </button>
  );
}

function List({
  query,
  setQuery,
  children,
}: {
  query: string;
  setQuery: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute z-20 mt-1 w-full rounded-md border bg-card shadow-lg">
      <div className="border-b p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search…"
          className="h-8"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">{children}</div>
    </div>
  );
}

/** Closes the dropdown when focus leaves it entirely. */
function useDismiss(close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!ref.current?.contains(e.relatedTarget as Node | null)) close();
  };
  return { ref, onBlur };
}

/**
 * One language.
 *
 * `value` is a code, or "" for nothing chosen.
 */
export function LanguagePicker({
  id,
  value,
  onChange,
  placeholder = "Choose a language",
  /** Shown above the rest, with counts. */
  priority,
}: {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  priority?: { code: string; count: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { ref, onBlur } = useDismiss(() => setOpen(false));

  const chosen = languageByCode(value);
  const matches = useMemo(() => searchLanguages(query), [query]);

  // Languages that already have leads go on top with their counts, so
  // the useful ones are not buried among a hundred empty ones.
  const top = useMemo(() => {
    if (!priority?.length) return [];
    return priority
      .map((p) => ({ language: languageByCode(p.code), count: p.count }))
      .filter((p): p is { language: Language; count: number } => !!p.language)
      .filter((p) => matches.some((m) => m.code === p.language.code));
  }, [priority, matches]);

  const topCodes = new Set(top.map((t) => t.language.code));
  const rest = matches.filter((m) => !topCodes.has(m.code));

  return (
    <div className="relative" ref={ref} onBlur={onBlur}>
      <button
        id={id}
        type="button"
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
        }}
        className="flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 text-sm"
      >
        <span className={chosen ? "" : "text-muted-foreground"}>
          {chosen ? languageLabel(chosen) : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-60" />
      </button>

      {open && (
        <List query={query} setQuery={setQuery}>
          {top.length > 0 && (
            <>
              {top.map(({ language, count }) => (
                <Row
                  key={`top-${language.code}`}
                  language={language}
                  selected={language.code === value}
                  count={count}
                  onPick={() => {
                    onChange(language.code);
                    setOpen(false);
                  }}
                />
              ))}
              <div className="my-1 border-t" />
            </>
          )}
          {rest.map((language) => (
            <Row
              key={language.code}
              language={language}
              selected={language.code === value}
              onPick={() => {
                onChange(language.code);
                setOpen(false);
              }}
            />
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">No language matches that.</p>
          )}
        </List>
      )}
    </div>
  );
}

/**
 * Several languages.
 *
 * `value` is a list of codes. Order is the order they were added, which
 * matters: the first is used as a suggestion elsewhere.
 */
export function LanguageMultiPicker({
  id,
  value,
  onChange,
  placeholder = "Add a language",
}: {
  id?: string;
  value: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { ref, onBlur } = useDismiss(() => setOpen(false));

  const chosen = value.map(languageByCode).filter((l): l is Language => !!l);
  const matches = useMemo(() => searchLanguages(query), [query]);

  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div className="relative" ref={ref} onBlur={onBlur}>
      <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border bg-transparent p-1.5">
        {chosen.map((language) => (
          <span
            key={language.code}
            className="flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs"
          >
            {language.name}
            <button
              type="button"
              aria-label={`Remove ${language.name}`}
              onClick={() => toggle(language.code)}
              className="opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <button
          id={id}
          type="button"
          onClick={() => {
            setQuery("");
            setOpen((o) => !o);
          }}
          className="px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {chosen.length === 0 ? placeholder : "+ add"}
        </button>
      </div>

      {open && (
        <List query={query} setQuery={setQuery}>
          {matches.map((language) => (
            <Row
              key={language.code}
              language={language}
              selected={value.includes(language.code)}
              onPick={() => toggle(language.code)}
            />
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">No language matches that.</p>
          )}
        </List>
      )}
    </div>
  );
}

/** Every language, for callers that need the raw list. */
export { LANGUAGES };
