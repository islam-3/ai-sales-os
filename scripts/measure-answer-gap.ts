// How well does the answer-gap judge do, per language?
//
//   SPLIT=tune    DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-answer-gap.ts
//   SPLIT=heldout ...   <- run ONCE, at the end
//
// The number that matters is the FALSE POSITIVE rate: a question the
// business has already answered, reported as a gap. That tells an owner
// to re-add their own warranty, and it is what made the previous design
// unusable. Target is zero on held-out data.
//
// Recall matters too, but second: a list that catches nothing is empty
// and useless. The floor agreed was about half of genuinely unanswered
// questions.
//
// Labels and the tune/held-out split live in scripts/answer-gap-cases.ts
// and were committed before lib/answer-gap.ts was written. Tuning looks
// at `tune` only. `heldout` is run once and reported.
//
// test-clinic only.

import { supabaseServer } from "../lib/supabase-server";
import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";
import { anthropic } from "../lib/anthropic";
import { judgeAnswerGap, type KnowledgeForJudge } from "../lib/answer-gap";
import { ANSWER_GAP_CASES, LANGUAGES, type CaseLanguage } from "./answer-gap-cases";

const SLUG = process.env.SLUG ?? TEST_TENANT_SLUG;
const SPLIT = (process.env.SPLIT ?? "tune") as "tune" | "heldout";

type Tally = { tp: number; fp: number; fn: number; tn: number; failed: number };
const empty = (): Tally => ({ tp: 0, fp: 0, fn: 0, tn: 0, failed: 0 });

/**
 * A "positive" is the judge saying there is a GAP.
 *
 * So a false positive is a gap reported for something already answered —
 * the one that costs trust — and precision is the share of reported gaps
 * that are real.
 */
function score(t: Tally) {
  // Null, never 1, when there is nothing to divide. The first run of
  // this harness had every single call fail on a billing refusal and
  // reported "precision 100%, recall 100%, ZERO false gaps" — because an
  // empty tally defaulted to perfect. A measurement that reads as a pass
  // when it measured nothing is worse than one that crashes.
  const scored = t.tp + t.fp + t.fn + t.tn;
  if (scored === 0) return { precision: null, recall: null, scored };
  return {
    precision: t.tp + t.fp === 0 ? null : t.tp / (t.tp + t.fp),
    recall: t.tp + t.fn === 0 ? null : t.tp / (t.tp + t.fn),
    scored,
  };
}

const pct = (n: number | null) => (n === null ? "  — " : `${(n * 100).toFixed(0)}%`);

async function main() {
  const { data: tenant, error } = await supabaseServer
    .from("tenants").select("id, settings").eq("slug", SLUG).single();
  if (error) throw error;
  if (!isTestTenant((tenant.settings ?? {}) as { is_test?: boolean })) {
    throw new Error(refusalMessage(SLUG));
  }

  const { data: rows } = await supabaseServer
    .from("knowledge_base")
    .select("title, content")
    .eq("tenant_id", tenant.id);
  const knowledge: KnowledgeForJudge[] = (rows ?? []).map((r) => ({
    title: r.title ?? "",
    content: r.content,
  }));

  const cases = ANSWER_GAP_CASES.filter((c) => c.split === SPLIT);
  console.log(`[${SPLIT}] ${cases.length} cases x ${LANGUAGES.length} languages against ${knowledge.length} entries`);
  console.log(`answered: ${cases.filter((c) => c.answered).length}  unanswered: ${cases.filter((c) => !c.answered).length} (${cases.filter((c) => c.partial).length} partial)\n`);

  const byLang: Record<string, Tally> = {};
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];
  const partialTally = empty();

  for (const lang of LANGUAGES) {
    byLang[lang] = empty();
    console.log(`── ${lang} ──`);
    for (const c of cases) {
      const verdict = await judgeAnswerGap(anthropic, c[lang as CaseLanguage], knowledge);
      if (verdict.failed) {
        byLang[lang].failed++;
        console.log(`  ${c.id.padEnd(15)} JUDGE UNREACHABLE: ${verdict.note.slice(0, 50)}`);
        continue;
      }

      const saysGap = !verdict.answered;
      const isGap = !c.answered;
      const t = byLang[lang];
      if (isGap && saysGap) t.tp++;
      else if (!isGap && saysGap) t.fp++;
      else if (isGap && !saysGap) t.fn++;
      else t.tn++;

      if (c.partial) {
        if (saysGap) partialTally.tp++;
        else partialTally.fn++;
      }

      const wrong = isGap !== saysGap;
      if (wrong && !isGap) falsePositives.push(`${lang} ${c.id}: ${verdict.note.slice(0, 70)}`);
      if (wrong && isGap) falseNegatives.push(`${lang} ${c.id}: pointed at "${verdict.entryTitle}"`);

      console.log(
        `  ${c.id.padEnd(15)} label=${isGap ? "GAP " : "ok  "} judge=${saysGap ? "GAP " : "ok  "} ` +
          `${wrong ? (isGap ? "  missed" : "  FALSE GAP") : ""}`
      );
    }
    console.log();
  }

  console.log("═".repeat(70));
  console.log(`  [${SPLIT}] per language`);
  console.log("═".repeat(70));
  const total = empty();
  for (const lang of LANGUAGES) {
    const t = byLang[lang];
    total.tp += t.tp; total.fp += t.fp; total.fn += t.fn; total.tn += t.tn; total.failed += t.failed;
    const s = score(t);
    console.log(
      `  ${lang}  precision ${pct(s.precision).padStart(4)}  recall ${pct(s.recall).padStart(4)}` +
        `   false gaps ${t.fp}   missed ${t.fn}${t.failed ? `   unreachable ${t.failed}` : ""}`
    );
  }
  const s = score(total);
  console.log(
    `\n  all   precision ${pct(s.precision)}  recall ${pct(s.recall)}   FALSE GAPS ${total.fp}   missed ${total.fn}`
  );
  console.log(
    `  partially answered, caught as gaps: ${partialTally.tp}/${partialTally.tp + partialTally.fn}`
  );

  if (falsePositives.length) {
    console.log(`\n  FALSE GAPS — each one tells an owner to rewrite what they already wrote:`);
    falsePositives.forEach((f) => console.log(`    ${f}`));
  }
  if (falseNegatives.length) {
    console.log(`\n  Missed gaps — cheap, but listed:`);
    falseNegatives.forEach((f) => console.log(`    ${f}`));
  }

  // An incomplete run is not a result, and must never read like a clean
  // sheet. The first run of this harness had every call refused on a
  // billing error and printed "precision 100%, recall 100%, ZERO false
  // gaps" — a measurement reporting a pass on nothing at all, which is
  // the exact failure mode this project has written guards against twice
  // before and which I then shipped into my own harness.
  if (total.failed > 0 || s.scored === 0) {
    console.log(
      `\n  INCOMPLETE — ${total.failed} call(s) never reached the model, ${s.scored} scored.` +
        `\n  Nothing above is a measurement. Fix the cause and run it again.`
    );
    process.exit(1);
  }

  console.log(
    `\n  ${total.fp === 0 ? "ZERO false gaps" : `${total.fp} FALSE GAPS — not shippable`}` +
      `, recall ${pct(s.recall)} against a floor of 50%`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
