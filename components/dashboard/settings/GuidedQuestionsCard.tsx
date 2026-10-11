"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, SectionCardFooter } from "@/components/dashboard/SectionCard";
import type { GuidedQuestion, PricingShape } from "@/lib/guided-questions";
import type { QuestionProgress } from "@/lib/guided-progress";
import {
  clearGuidedAnswer,
  declineGuidedQuestion,
  saveGuidedAnswer,
} from "@/app/dashboard/settings/actions";

// Instead of an empty box, specific questions.
//
// Businesses paste their website's marketing copy here and do not
// realise the operational answers customers actually ask about are
// missing — warranty, what's included, how long it takes, who does the
// work. The assistant then looks weak and the platform gets blamed.
//
// The real clinic this was designed from had every one of those answers
// added by hand, AFTER live testing showed the assistant failing. Under
// 900 characters of operational fact, reverse-engineered by watching it
// fail. This asks for them up front instead.

type Props = {
  progress: QuestionProgress[];
  resolved: number;
  total: number;
  /** The tenant's own knowledge-base categories, for scoping an answer. */
  categories: string[];
  /** Named only so the owner knows which wording they are seeing. */
  packLabel: string | null;
};

export function GuidedQuestionsCard({ progress, resolved, total, categories, packLabel }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const router = useRouter();

  const outstanding = progress.filter((p) => !p.resolved);
  const done = progress.filter((p) => p.resolved);

  return (
    <SectionCard
      title="What customers ask"
      description={
        "Most businesses fill this page with the copy from their website, then find the assistant cannot answer what customers " +
        "actually ask. These are those questions. Every one can be skipped."
      }
      footer={
        <SectionCardFooter
          status={
            resolved === total ? (
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                All {total} dealt with
              </span>
            ) : (
              <span className="text-muted-foreground">
                {resolved} of {total} dealt with
                {packLabel ? ` · ${packLabel} questions` : ""}
              </span>
            )
          }
        >
          <span />
        </SectionCardFooter>
      }
    >
      {/* Unanswered first: the whole point is to surface the gap, and a
          list that opens with what is already done hides it. */}
      {outstanding.map((p) => (
        <QuestionRow
          key={p.question.key}
          progress={p}
          categories={categories}
          open={openKey === p.question.key}
          onToggle={() => setOpenKey(openKey === p.question.key ? null : p.question.key)}
          onDone={() => {
            setOpenKey(null);
            router.refresh();
          }}
        />
      ))}

      {done.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">Dealt with ({done.length})</p>
          {done.map((p) => (
            <QuestionRow
              key={p.question.key}
              progress={p}
              categories={categories}
              open={openKey === p.question.key}
              onToggle={() => setOpenKey(openKey === p.question.key ? null : p.question.key)}
              onDone={() => {
                setOpenKey(null);
                router.refresh();
              }}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function QuestionRow({
  progress,
  categories,
  open,
  onToggle,
  onDone,
}: {
  progress: QuestionProgress;
  categories: string[];
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const { question, byCategory, openCategories, resolved } = progress;

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{question.prompt}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {resolved ? <Summary byCategory={byCategory} /> : question.why}
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t p-3">
          <AnswerForm
            question={question}
            categories={categories}
            openCategories={openCategories}
            answered={byCategory}
            onDone={onDone}
          />
        </div>
      )}
    </div>
  );
}

/** What the owner said, per category, in one line. */
function Summary({ byCategory }: { byCategory: QuestionProgress["byCategory"] }) {
  return (
    <>
      {byCategory.map((c, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {c.category ?? "All"}:{" "}
          {c.state === "declined"
            ? "not saying"
            : c.state === "not_offered"
              ? "we don't offer this"
              : c.state === "existing"
                ? "already covered"
                : (c.content ?? "").slice(0, 40)}
        </span>
      ))}
    </>
  );
}

function AnswerForm({
  question,
  categories,
  openCategories,
  answered,
  onDone,
}: {
  question: GuidedQuestion;
  categories: string[];
  openCategories: string[];
  answered: QuestionProgress["byCategory"];
  onDone: () => void;
}) {
  // Pre-selected to the first category with nothing said about it, so
  // "add an answer for another category" needs no thought.
  const [category, setCategory] = useState<string | null>(
    openCategories[0] ?? (categories.length > 0 ? categories[0] : null)
  );
  const [shape, setShape] = useState<PricingShape | null>(question.shapes?.[0] ?? null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = answered.find((a) =>
    (a.category ?? "").trim().toLowerCase() === (category ?? "").trim().toLowerCase()
  );

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Nothing was changed.");
        return;
      }
      onDone();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    // A pricing shape with its own sentence needs no typing: the
    // confident version of "it depends" is words we chose, not words
    // the owner has to find.
    const content = shape?.sentence ?? text;
    return run(() =>
      saveGuidedAnswer({ questionKey: question.key, category, content })
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {categories.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">This answer applies to</Label>
          <div className="flex flex-wrap gap-1.5">
            {/* All categories is an explicit choice, never the default.
                A warranty answered in dental terms must not be served to
                a hair-transplant visitor as fact. */}
            {[...categories, null].map((c) => (
              <button
                key={c ?? "__all"}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  (c ?? "") === (category ?? "")
                    ? "border-foreground/30 bg-foreground/5 text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {c ?? "Everything"}
              </button>
            ))}
          </div>
        </div>
      )}

      {existing && (
        <p className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          Already answered for {existing.category ?? "everything"}. Saving replaces it.
        </p>
      )}

      {question.shapes && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">How your pricing works</Label>
          <div className="flex flex-col gap-1">
            {question.shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setShape(s)}
                className={`rounded-md border p-2 text-left text-xs ${
                  shape?.id === s.id ? "border-foreground/30 bg-foreground/5" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {(!question.shapes || shape?.needsText) && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`a-${question.key}`} className="text-xs text-muted-foreground">
            Your answer
          </Label>
          <Textarea
            id={`a-${question.key}`}
            rows={3}
            value={text}
            placeholder={shape?.placeholder ?? question.examples}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{question.examples}</p>
        </div>
      )}

      {shape?.sentence && (
        <p className="rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          Saved as: &ldquo;{shape.sentence}&rdquo;
          {shape.thenAsk && (
            <span className="mt-1 block">
              Worth answering &ldquo;what do you need from the customer&rdquo; next — quoting on
              assessment only works if the assistant knows what to gather.
            </span>
          )}
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy || (!shape?.sentence && !text.trim())} onClick={save}>
          {busy ? "Saving…" : "Save answer"}
        </Button>

        {/* Only where "we don't offer this" is a fact about the business.
            The sentence is defined in code and stored verbatim — a
            statement about what a business cannot do reaches a customer
            word for word, and one the model improvises is one nobody
            approved. */}
        {question.notOffered && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(() =>
                saveGuidedAnswer({
                  questionKey: question.key,
                  category,
                  content: question.notOffered!.sentence,
                  notOffered: true,
                })
              )
            }
          >
            {question.notOffered.label}
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => run(() => declineGuidedQuestion({ questionKey: question.key, category }))}
        >
          Prefer not to say
        </Button>

        {existing && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => run(() => clearGuidedAnswer({ questionKey: question.key, category }))}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
