"use client";

import { useState, useTransition } from "react";
import { MessageCircleQuestion, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuestionGroup } from "@/lib/unanswered-questions";
import type { StarterQuestion } from "@/lib/starter-questions";
import {
  dismissQuestionGroup,
  restoreQuestionGroup,
} from "@/app/dashboard/settings/unanswered-actions";

/**
 * How many lines are shown before the list has to be asked for.
 *
 * Three, because activeGroups already sorts by count and the top of that
 * ranking is the whole point of the card — it says what is costing the
 * business most. Nine lines of equal visual weight said nothing and took
 * over the page, which is how the twelve-question card before this one
 * failed too: a list long enough to scroll past is a list nobody reads.
 */
const COLLAPSED_COUNT = 3;

/**
 * "Customers asked — no answer yet".
 *
 * ── What this replaced ────────────────────────────────────────────────
 * A card that asked the business twelve questions of our devising and
 * counted their answers. It was built, used by an owner, and failed: it
 * read "0 of 12" while the warranty, the brands, the durations and the
 * packages all sat in the list below it, so the owner was being asked to
 * redo work they had already done.
 *
 * Nothing here is our question. Every line is something a real customer
 * typed, which a model judge then confirmed is not answered anywhere in
 * what the business has written — judged against the material, never by
 * reading how the assistant's reply sounded.
 */
export function UnansweredQuestions({
  groups,
  starters,
  onAddAnswer,
}: {
  groups: QuestionGroup[];
  /** Shown only on a tenant with no captured questions at all. */
  starters: StarterQuestion[];
  /** Opens the ordinary add-entry form with the title filled in. */
  onAddAnswer: (title: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Nothing captured and nothing to suggest: no card at all. An empty
  // box explaining what would appear here is a box an owner scrolls
  // past on every visit.
  if (groups.length === 0 && starters.length === 0) return null;

  function dismiss(groupId: string) {
    setError(null);
    setActing(groupId);
    startTransition(async () => {
      try {
        await dismissQuestionGroup(groupId);
      } catch {
        setError("Could not hide that. Try again.");
      } finally {
        setActing(null);
      }
    });
  }

  const isStarters = groups.length === 0;
  const shown = expanded ? groups : groups.slice(0, COLLAPSED_COUNT);
  const hidden = groups.length - shown.length;

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-card-p">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <MessageCircleQuestion className="h-4 w-4 text-muted-foreground" aria-hidden />
            {isStarters ? "Questions customers usually ask" : "Customers asked — no answer yet"}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {isStarters
              ? "Nobody has asked anything you couldn't answer yet. These four get asked of almost every business — answering them now means your assistant has them ready."
              : "Your assistant had nothing to tell these customers. Add an answer and it will have one next time."}
          </p>
        </div>

        <ul className="flex flex-col divide-y">
          {shown.map((group) => (
            <li
              key={group.groupId}
              className="flex flex-col gap-1.5 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{group.question}</p>
                {/* The script labels used to sit here. Dropped to keep the
                    row to one line — `scripts` is still on QuestionGroup
                    and still captured, so bringing them back is a render
                    change and not a data one. */}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>
                    {group.count === 1 ? "1 customer asked" : `${group.count} customers asked`}
                  </span>
                  {group.returned && (
                    <>
                      <span aria-hidden>·</span>
                      {/* Said plainly, because an owner who hid this
                          deserves to know why it is back rather than
                          wondering whether Dismiss works. */}
                      <span className="font-medium text-foreground">
                        asked again since you hid it
                      </span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <a
                    href={`/dashboard/conversations/${encodeURIComponent(group.latest.sessionId)}`}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    Read the conversation
                  </a>
                </p>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  onClick={() => onAddAnswer(group.question)}
                  className="h-7 gap-1 px-2.5 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Add answer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismiss(group.groupId)}
                  disabled={pending && acting === group.groupId}
                  className="h-7 gap-1 px-2 text-xs"
                >
                  {group.returned ? (
                    "Hide again"
                  ) : (
                    <>
                      <X className="h-3 w-3" />
                      Dismiss
                    </>
                  )}
                </Button>
              </div>
            </li>
          ))}

          {starters.map((starter) => (
            <li
              key={starter.key}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <p className="min-w-0 flex-1 text-sm text-foreground">{starter.question}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAddAnswer(starter.title)}
                className="shrink-0 gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add answer
              </Button>
            </li>
          ))}
        </ul>

        {/* Only when there is something behind it. A control that expands
            nothing is a control an owner learns to distrust. */}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Show all {groups.length} questions
          </button>
        )}
        {expanded && groups.length > COLLAPSED_COUNT && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="self-start text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            Show fewer
          </button>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}

/**
 * The dismissed ones, behind a disclosure.
 *
 * Separate from the list above and collapsed, so dismissing genuinely
 * clears the page — but recoverable, because the alternative is an owner
 * who dismissed something by accident having no way back and no
 * indication that one exists.
 */
export function DismissedQuestions({ groups }: { groups: QuestionGroup[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (groups.length === 0) return null;

  function restore(groupId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await restoreQuestionGroup(groupId);
      } catch {
        setError("Could not bring that back. Try again.");
      }
    });
  }

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-muted-foreground hover:text-foreground hover:underline"
      >
        {groups.length} dismissed {groups.length === 1 ? "question" : "questions"}
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {groups.map((group) => (
            <li key={group.groupId} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-muted-foreground">{group.question}</span>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => restore(group.groupId)}
              >
                Bring back
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
