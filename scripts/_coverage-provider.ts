// Which coverage reader the measure-coverage-* scripts call.
//
// Default: readAnsweredDimensions (Haiku), exactly what the route calls.
// COVERAGE_PROVIDER=openai: readAnsweredDimensionsOpenAI with
// COVERAGE_MODEL (default gpt-6-luna), counting cost and FAILED calls.
// A failed call returns null, and the scripts, like the route, then fall
// back to word matching, which can still pass in English. So a run on
// OpenAI with any failed call is reported as a failure, never a pass.

import { readAnsweredDimensions, readAnsweredDimensionsOpenAI, type AnsweredDimensions } from "../lib/coverage-answered";
import { calculateCostUsd } from "../lib/ai-pricing";

export const COVERAGE_OPENAI = process.env.COVERAGE_PROVIDER === "openai";
export const COVERAGE_MODEL = process.env.COVERAGE_MODEL ?? "gpt-6-luna";
const arm = { calls: 0, failed: 0, cost: 0 };

export async function readAnswered(visitor: string[], assistant: string[]): Promise<AnsweredDimensions | null> {
  if (!COVERAGE_OPENAI) return readAnsweredDimensions(visitor, assistant);
  const { openai } = await import("../lib/openai");
  arm.calls++;
  const r = await readAnsweredDimensionsOpenAI(openai, COVERAGE_MODEL, visitor, assistant, (t) => {
    arm.cost += calculateCostUsd(COVERAGE_MODEL, t);
  });
  if (r === null) arm.failed++;
  return r;
}

/** One line for the end of a run; sets a failing exit code if any call failed. */
export function reportCoverageArm(): void {
  if (!COVERAGE_OPENAI) return console.log("\nreader: Haiku (readAnsweredDimensions)");
  console.log(`\nreader: ${COVERAGE_MODEL} (OpenAI)   calls ${arm.calls}   FAILED ${arm.failed}   cost $${arm.cost.toFixed(5)}`);
  if (arm.failed) {
    console.log("FAIL: a failed call falls back to word matching, so this run's result is not the model's");
    process.exitCode = 1;
  }
}
