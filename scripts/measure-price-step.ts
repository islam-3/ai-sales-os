// Does every reply to a price question now end with a concrete next step?
//
//   LIVE=1 BASE_URL=http://localhost:3100 DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/measure-price-step.ts
//
// PAID. Turns 1-3 of the six smoke conversations (turn 3 is the price
// question) x Sonnet and gpt-6.1-terra x 3 runs = 36 conversations of 3
// turns, about 324 calls (reply, classifier, extraction per turn),
// about $1.00. State that and get a yes before setting LIVE=1.
//
// Run against a LOCAL build of the change; nothing is deployed for it.
// test-clinic only; capture skipped as in the smoke test.
//
// What it reports, per arm and language:
//   - the price reply ends with a step (the target is every one);
//   - whether the MODEL gave it or the CODE appended the fixed sentence;
//   - that an appended sentence is in the visitor's script;
//   - that the price question was read (asks_about_price);
//   - that turns 1-2 were left alone.
// And writes docs/price-step-<date>.md with every price turn side by side.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { say, SLUG, type Reply } from "./_chat-client";
import { CASES, type Case } from "./_smoke-cases";
import { detectScript } from "../lib/visitor-language";
import { PRICE_STEP_SENTENCES } from "../lib/price-next-step";

const RUNS = Number(process.env.RUNS ?? 3);
const PRICE_TURN = 2; // zero-indexed: the third visitor message
const ARMS: { label: string; model?: string }[] = [{ label: "sonnet" }, { label: "gpt-6.1-terra", model: "gpt-6.1-terra" }];
const QUESTION = /[?؟？]/;
const ALL_SENTENCES = Object.values(PRICE_STEP_SENTENCES).flatMap((v) => [v.case, v.details]);

type Row = {
  arm: string;
  run: number;
  case: Case;
  turns: { visitor: string; reply: string; priceStep?: string; asksPrice?: boolean }[];
};

async function main() {
  if (process.env.LIVE !== "1") {
    console.log(`(skipped: ${CASES.length * ARMS.length * RUNS} three-turn conversations, about 324 calls and $1.00 — set LIVE=1 to run it, after stating the cost)`);
    process.exit(0);
  }
  const rows: Row[] = [];
  for (let run = 1; run <= RUNS; run++) {
    for (const c of CASES) {
      for (const arm of ARMS) {
        const row: Row = { arm: arm.label, run, case: c, turns: [] };
        const sessionId = crypto.randomUUID();
        for (let i = 0; i <= PRICE_TURN; i++) {
          let r: Reply;
          try {
            r = await say(sessionId, c.turns[i], SLUG, { skipCapture: true, includeSignals: true, ...(arm.model && { replyModel: arm.model }) });
          } catch (error) {
            row.turns.push({ visitor: c.turns[i], reply: `(request failed: ${String((error as Error).message).slice(0, 80)})` });
            continue;
          }
          row.turns.push({ visitor: c.turns[i], reply: r.reply, priceStep: r.priceStep, asksPrice: r.signals?.asks_about_price });
          await new Promise((res) => setTimeout(res, 1500));
        }
        const p = row.turns[PRICE_TURN];
        console.log(`run ${run} · ${arm.label.padEnd(13)} · ${c.label.padEnd(34)} price turn: ${p?.priceStep ?? "?"}${p?.asksPrice ? "" : " (asks_about_price NOT read)"}`);
        rows.push(row);
      }
    }
  }
  report(rows);
}

function report(rows: Row[]) {
  const date = new Date().toISOString().slice(0, 10);
  const langs = CASES.map((c) => c.label.split(" ")[0]);
  const out: string[] = [`# Price next step, ${date}`, "", `Turns 1-3 of the six smoke conversations, ${RUNS} runs, local build, test-clinic.`, ""];
  out.push("| Arm | Language | Price replies ending with a step | Model gave it | Code appended | Appended in the right script | asks_about_price read | Turns 1-2 touched |");
  out.push("|---|---|---|---|---|---|---|---|");
  const totals = new Map<string, number[]>();
  for (const arm of ARMS.map((a) => a.label)) {
    for (const lang of langs) {
      const set = rows.filter((r) => r.arm === arm && r.case.label.startsWith(lang));
      const price = set.map((r) => r.turns[PRICE_TURN]).filter(Boolean);
      const ends = price.filter((t) => QUESTION.test(t.reply)).length;
      const model = price.filter((t) => t.priceStep === "model_gave_step").length;
      const appended = price.filter((t) => t.priceStep === "appended");
      const rightScript = appended.filter((t) => {
        const sentence = ALL_SENTENCES.find((s) => t.reply.endsWith(s));
        return sentence !== undefined && detectScript([sentence]) === detectScript([t.visitor]) || (sentence !== undefined && detectScript([t.visitor]) === null);
      }).length;
      const read = price.filter((t) => t.asksPrice).length;
      const touched = set.flatMap((r) => r.turns.slice(0, PRICE_TURN)).filter((t) => t.priceStep && t.priceStep !== "not_needed").length;
      const t = totals.get(arm) ?? totals.set(arm, [0, 0, 0, 0, 0, 0, 0]).get(arm)!;
      [price.length, ends, model, appended.length, rightScript, read, touched].forEach((v, i) => (t[i] += v));
      out.push(`| ${arm} | ${lang} | ${ends}/${price.length} | ${model} | ${appended.length} | ${rightScript}/${appended.length} | ${read}/${price.length} | ${touched} |`);
    }
  }
  for (const [arm, t] of Array.from(totals)) {
    out.push(`| **${arm}** | **all** | **${t[1]}/${t[0]}** | ${t[2]} | ${t[3]} | ${t[4]}/${t[3]} | ${t[5]}/${t[0]} | ${t[6]} |`);
  }
  out.push("", "## Every price turn, side by side", "");
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  for (let run = 1; run <= RUNS; run++) {
    out.push(`### Run ${run}`, "", `| Language | Visitor | ${ARMS.map((a) => a.label).join(" | ")} |`, `|---|---|${ARMS.map(() => "---").join("|")}|`);
    for (const c of CASES) {
      const cells = ARMS.map((a) => {
        const t = rows.find((r) => r.arm === a.label && r.run === run && r.case === c)?.turns[PRICE_TURN];
        return t ? `${cell(t.reply)}<br><br>_[${t.priceStep ?? "?"}]_` : "—";
      });
      out.push(`| ${c.label.split(" ")[0]} | ${cell(c.turns[PRICE_TURN])} | ${cells.join(" | ")} |`);
    }
    out.push("");
  }
  const path = join(__dirname, "..", "docs", `price-step-${date}.md`);
  writeFileSync(path, out.join("\n"));
  console.log(`\nwrote ${path}\n`);
  console.log(out.slice(0, 6 + ARMS.length * langs.length + ARMS.length).join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
