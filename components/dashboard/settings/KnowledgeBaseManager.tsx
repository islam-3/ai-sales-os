"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KnowledgeEntry, entryMatchesQuery } from "@/lib/knowledge-base";
import type { QuestionGroup } from "@/lib/unanswered-questions";
import type { StarterQuestion } from "@/lib/starter-questions";
import { AddEntryForm } from "./AddEntryForm";
import { KnowledgeEntryCard } from "./KnowledgeEntryCard";
import { DismissedQuestions, UnansweredQuestions } from "./UnansweredQuestions";

const ALL_CATEGORIES = "__all__";
const UNCATEGORIZED = "Uncategorized";

export function KnowledgeBaseManager({
  entries,
  unanswered,
  dismissed,
  starters,
}: {
  entries: KnowledgeEntry[];
  unanswered: QuestionGroup[];
  dismissed: QuestionGroup[];
  starters: StarterQuestion[];
}) {
  const [isAdding, setIsAdding] = useState(false);
  // Which title the add form opens with. Reset to empty when the form
  // is opened from the toolbar, so a prefill from a captured question
  // cannot linger into the next unrelated entry.
  const [prefillTitle, setPrefillTitle] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  // Collapsed rather than expanded, so the default (nothing in the set) is
  // every category open — an owner arriving at the page should see their
  // whole library at a glance, just compactly.
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      const trimmed = entry.category?.trim();
      if (trimmed) set.add(trimmed);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const isSearching = query.trim().length > 0;
  const isFiltering = categoryFilter !== ALL_CATEGORIES;

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const key = entry.category?.trim() || UNCATEGORIZED;
      if (isFiltering && key !== categoryFilter) return false;
      return entryMatchesQuery(entry, query);
    });
  }, [entries, query, categoryFilter, isFiltering]);

  const grouped = useMemo(() => {
    const map = new Map<string, KnowledgeEntry[]>();
    for (const entry of filtered) {
      const key = entry.category?.trim() || UNCATEGORIZED;
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function toggleCategory(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setCategoryFilter(ALL_CATEGORIES);
  }

  const hasEntries = entries.length > 0;

  /**
   * Opens the ordinary add-entry form with the title filled in.
   *
   * The key is remounting the form rather than only setting state: if it
   * is already open with something half-typed, React keeps the existing
   * `title` state and the prefill silently does nothing — which reads as
   * a broken button.
   */
  function addAnswerFor(title: string) {
    setPrefillTitle(title);
    setIsAdding(true);
    // After the state flush, so the form exists to scroll to. The list
    // sits above the form on a long page and the button would otherwise
    // appear to do nothing.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Customers asked — no answer yet ─────────────────────────── */}
      {/* At the top, above the search box and the library. It is the one
          thing on this page that says what to do next; below the
          toolbar it would sit under a filter nobody has used yet. */}
      <UnansweredQuestions
        groups={unanswered}
        starters={starters}
        onAddAnswer={addAnswerFor}
      />

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {hasEntries && (
          <>
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search entries…"
                aria-label="Search knowledge base entries"
                className="pl-9"
              />
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-52" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {!isAdding && (
          <Button
            onClick={() => {
              setPrefillTitle("");
              setIsAdding(true);
            }}
            size="sm"
            className="shrink-0 gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add entry
          </Button>
        )}
      </div>

      {isAdding && (
        <div ref={formRef}>
          <AddEntryForm
            // Remounted whenever the prefill changes, so clicking [Add
            // answer] on a second question while the form is open
            // actually replaces the title instead of being ignored.
            key={prefillTitle}
            categories={categories}
            initialTitle={prefillTitle}
            onDone={() => setIsAdding(false)}
          />
        </div>
      )}

      {/* ── Result summary ──────────────────────────────────────────── */}
      {hasEntries && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {isSearching || isFiltering ? (
              <>
                {filtered.length} of {entries.length}{" "}
                {entries.length === 1 ? "entry" : "entries"}
              </>
            ) : (
              <>
                {entries.length} {entries.length === 1 ? "entry" : "entries"} in{" "}
                {categories.length} categor{categories.length === 1 ? "y" : "ies"}
              </>
            )}
          </span>
          {(isSearching || isFiltering) && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      )}

      {/* ── Empty states ────────────────────────────────────────────── */}
      {!hasEntries && !isAdding && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here yet. Add facts about the business — your team, guarantees, pricing,
            before/after stories — for the chat assistant to draw on.
          </p>
        </div>
      )}

      {hasEntries && grouped.length === 0 && (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No entries match {isSearching ? <>&ldquo;{query.trim()}&rdquo;</> : "this filter"}.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* ── Grouped list ────────────────────────────────────────────── */}
      {grouped.map(([category, items]) => {
        // A category collapsed by hand stays collapsed, but an active
        // search overrides it: matches hidden inside a closed group would
        // make the search box look broken.
        const isCollapsed = collapsedCategories.has(category) && !isSearching;

        return (
          <section key={category}>
            <button
              type="button"
              onClick={() => toggleCategory(category)}
              aria-expanded={!isCollapsed}
              className="mb-2 flex w-full items-center gap-1.5 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                  isCollapsed ? "" : "rotate-90"
                }`}
                aria-hidden
              />
              <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            </button>

            {!isCollapsed && (
              <div className="flex flex-col gap-2">
                {items.map((entry) => (
                  <KnowledgeEntryCard key={entry.id} entry={entry} categories={categories} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Dismissed questions, collapsed, at the bottom — out of the way
          but reachable, so an accidental Dismiss is recoverable. */}
      <DismissedQuestions groups={dismissed} />
    </div>
  );
}
