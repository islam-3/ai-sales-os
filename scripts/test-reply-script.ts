// Judging a reply's script without counting the business's own names.
//
//   npx tsx scripts/test-reply-script.ts
//
// FREE. Pure functions only.

import { detectScript, replyScript } from "../lib/visitor-language";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const business = {
  name: "TEST — Prof Clinic (automated runs)",
  material: "We use Implant Swiss dental implants. We use premium Straumann zirconia crowns. We provide 20 years warranty on the crowns.",
};

// The reply that was misjudged on 2026-11-20, verbatim.
const chinese = "您好！在 TEST — Prof Clinic (automated runs)，我们使用 Implant Swiss 种植体，并根据患者的情况制定治疗方案。您是缺失了一颗牙，还是多颗牙呢？";
check("the plain detector judged it Latin (the false positive being fixed)", detectScript([chinese]) === "latin");
check("a Chinese reply naming the business and a brand is Chinese", replyScript(chinese, business) === "cjk");
check("an Arabic reply naming a brand is Arabic", replyScript("نستخدم تيجان Straumann مع ضمان لمدة 20 عاماً.", business) === "arabic");
check("a Russian reply naming two brands is Cyrillic", replyScript("Мы используем импланты Implant Swiss и коронки Straumann.", business) === "cyrillic");

// What must still fail.
check(
  "a full English reply to a Chinese visitor is still Latin",
  replyScript("Hello! At Prof Clinic we use Implant Swiss implants and Straumann crowns. How many teeth are you missing?", business) === "latin"
);
check(
  "a Chinese reply that switches to an English sentence is still Latin",
  replyScript("您好！We use premium dental implants and we provide warranty on the crowns for years. 您是缺失了一颗牙吗？", business) === "latin"
);
check(
  "Latin words NOT in the business's material are never set aside",
  replyScript("您好！Please send a photograph of your smile today 呢", business) === "latin"
);
check("without business details it behaves like detectScript", replyScript(chinese, {}) === detectScript([chinese]));

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exitCode = 1;
} else {
  console.log("\nthe business's names do not decide the script; a wrong-language reply still fails");
}
