"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import type { OnboardingState } from "@/lib/onboarding";
import { dismissOnboarding } from "@/app/dashboard/onboarding-actions";

export function OnboardingChecklist({ state }: { state: OnboardingState }) {
  const router = useRouter();
  const [isDismissing, startDismiss] = useTransition();
  // Hide immediately on click rather than waiting for the round trip —
  // a checklist that lingers after "Dismiss" feels broken.
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  function handleDismiss() {
    setHidden(true);
    startDismiss(async () => {
      try {
        await dismissOnboarding();
        router.refresh();
      } catch (err) {
        console.error("Failed to dismiss getting started:", err);
        // Put it back if the write failed, so the state the owner sees
        // matches what's actually stored.
        setHidden(false);
      }
    });
  }

  const { steps, completedCount } = state;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b px-card-p py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Getting started
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Three quick steps to get your assistant ready for real visitors.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="tabular-figures text-xs text-muted-foreground">
            {completedCount} of {steps.length} done
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isDismissing}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>

      <ul className="divide-y">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3 px-card-p py-3.5">
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                step.done ? "border-success bg-success text-success-foreground" : "border-border"
              }`}
            >
              {step.done && <Check className="h-3 w-3" />}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-medium ${
                  step.done ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                {step.title}
                <span className="sr-only">{step.done ? " — done" : " — not done yet"}</span>
              </p>
              {!step.done && (
                <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
              )}
            </div>

            {!step.done && (
              <Link
                href={step.href}
                className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-medium text-brand transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {step.action}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
