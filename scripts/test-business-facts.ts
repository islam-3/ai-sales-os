// The business's own facts for a turn, and hesitation on a first message.
//
//   npx tsx scripts/test-business-facts.ts
//
// FREE. Fake vectors stand in for embeddings; no model, no database.
// The knowledge entries are written in Turkish and Arabic on purpose:
// the selector must work on material in any language, and must never
// depend on letter case (Arabic has none; Turkish casing is a trap).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { asciiDigits, MIN_SIMILARITY, selectBusinessFacts, snippetOf, splitSentences, type FactEntry } from "../lib/business-facts";
import { buildConversationStateBlock, hesitationApplies } from "../lib/conversation-state";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

// ── Turkish material ─────────────────────────────────────────────────
const TR: FactEntry[] = [
  { content: "Kronlarda 20 yıl garanti, implantlarda ömür boyu garanti veriyoruz.", embedding: [1, 0, 0] },
  { content: "İsviçre yapımı Implant Swiss implantlar ve Straumann zirkonyum kronlar kullanıyoruz.", embedding: [0.95, 0.3, 0] },
  { content: "Paketlerimiz VIP havalimanı transferi ve 5 yıldızlı otel konaklaması içerir.", embedding: [0, 1, 0] },
  {
    content:
      "Kliniğimiz şehrin merkezindedir ve modern bir binada hizmet verir. Ekibimiz hastalarla birebir ilgilenir ve her aşamada yanlarında olur. " +
      "Tedavi iki ziyarette tamamlanır: ilk ziyaret 5 gün, ikinci ziyaret 7 gün sürer. Ziyaretler arasında yaklaşık 4 aylık bir iyileşme dönemi vardır. " +
      "Danışmanlarımız Türkçe, İngilizce ve Arapça konuşur ve sorularınızı yanıtlamaktan mutluluk duyar. Randevularınızı size en uygun zamana göre planlıyoruz.",
    embedding: [0, 0, 1],
  },
];

{
  const facts = selectBusinessFacts([1, 0.1, 0], TR, "");
  check("Turkish: picks the two entries closest in meaning, most relevant first", facts.length === 2 && facts[0].includes("20 yıl") && facts[1].includes("Straumann"), JSON.stringify(facts));
  check("Turkish: leaves out an entry that is about something else", !facts.some((f) => f.includes("otel")));
}
{
  const facts = selectBusinessFacts([0, 0, 1], TR, "");
  check(
    "Turkish: a long entry is handed over as its sentences with figures, not whole",
    facts.length === 1 && facts[0].includes("5 gün") && facts[0].includes("4 aylık") && !facts[0].includes("modern bir binada"),
    JSON.stringify(facts)
  );
}
{
  const facts = selectBusinessFacts([1, 0.1, 0], TR, "Size Straumann kronlar öneriyoruz.");
  check("Turkish: an entry whose rare word was already said is skipped", facts.length === 1 && facts[0].includes("20 yıl"), JSON.stringify(facts));
}
{
  // Turkish casing: the reply writes "implant swiss" and "STRAUMANN", the material "Implant Swiss" and "Straumann".
  const facts = selectBusinessFacts([1, 0.1, 0], TR, "STRAUMANN kronlar");
  check("Turkish: 'already said' does not depend on case", facts.length === 1 && !facts[0].includes("Straumann"), JSON.stringify(facts));
}

// ── Arabic material, with Arabic-Indic digits ────────────────────────
const AR: FactEntry[] = [
  { content: "نقدم ضماناً لمدة ٢٠ عاماً على التيجان وضماناً مدى الحياة على الزرعات.", embedding: [1, 0, 0] },
  {
    content:
      "عيادتنا في قلب المدينة وتستقبل المرضى من مختلف البلدان طوال العام. نحرص على راحة كل مريض منذ وصوله وحتى مغادرته. " +
      "يتم العلاج على زيارتين: الزيارة الأولى ٥ أيام والثانية ٧ أيام بعد فترة شفاء. فريقنا يتحدث العربية والإنجليزية والتركية ويجيب عن كل أسئلتك. " +
      "نرتب لك المواعيد بحسب ما يناسبك ونتابع حالتك بعد عودتك إلى بلدك.",
    embedding: [0.2, 0.98, 0],
  },
  { content: "يشمل البرنامج نقلاً من المطار وإقامة في فندق.", embedding: [0, 0, 1] },
];

{
  const facts = selectBusinessFacts([1, 0, 0], AR, "");
  check("Arabic: picks the entry closest in meaning", facts.length === 1 && facts[0].includes("٢٠"), JSON.stringify(facts));
}
{
  const facts = selectBusinessFacts([0.2, 0.98, 0], AR, "");
  check(
    "Arabic: a long entry is handed over as its sentence with figures (Arabic-Indic digits count as figures)",
    facts.length === 1 && facts[0].includes("٥ أيام") && !facts[0].includes("قلب المدينة"),
    JSON.stringify(facts)
  );
}
{
  const facts = selectBusinessFacts([1, 0, 0], AR, "We give a 20-year warranty on crowns.");
  check("Arabic: a figure already said in ASCII digits counts as said (٢٠ = 20)", facts.length === 0, JSON.stringify(facts));
}
check("Arabic sentences split on ؟ and the full stop", splitSentences("هل تريد؟ نعم. شكراً").length === 3);
check("every digit system becomes ASCII", asciiDigits("٢٠ ۵ ７") === "20 5 7");

// ── Nothing, when nothing fits ───────────────────────────────────────
check("nothing when the best match is below the floor", selectBusinessFacts([0, 0, 0.1].map((x, i) => (i === 0 ? MIN_SIMILARITY / 10 : x)), [{ content: "x 12", embedding: [1, 0, 0] }], "").length === 0);
check("nothing without a query vector", selectBusinessFacts(null, TR, "").length === 0);
check("an entry without an embedding is never chosen", selectBusinessFacts([1, 0, 0], [{ content: "20 yıl garanti", embedding: null }], "").length === 0);
check("a short entry is handed over whole", snippetOf(TR[1].content) === TR[1].content);

// ── No letter case anywhere in the decision ─────────────────────────
{
  const flip = (entries: FactEntry[], f: (s: string) => string) => entries.map((e) => ({ ...e, content: f(e.content) }));
  const a = selectBusinessFacts([1, 0.1, 0], TR, "").length;
  const b = selectBusinessFacts([1, 0.1, 0], flip(TR, (s) => s.toLocaleUpperCase("tr")), "").length;
  const c = selectBusinessFacts([1, 0.1, 0], flip(TR, (s) => s.toLocaleLowerCase("tr")), "").length;
  check("the same entries are chosen whether the material is upper case, lower case or as written", a === b && b === c && a === 2, `${a} ${b} ${c}`);
}
const src = readFileSync(join(__dirname, "..", "lib", "business-facts.ts"), "utf8");
check("the selector has no case-based pattern (no A-Z class, no upper-case test)", !/A-Z|toUpperCase|\\p\{Lu\}/.test(src.replace(/^\s*\/\/.*$/gm, "")));
check("the selector names no industry", !/dental|tooth|teeth|implant|clinic|patient|treatment|hair|surgery/i.test(src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));

// ── Hesitation needs something to step back from ─────────────────────
const first = [{ role: "user", content: "Hola, estoy considerando implantes dentales" }];
const later = [
  { role: "user", content: "Hola, estoy considerando implantes dentales" },
  { role: "assistant", content: "Encantados. ¿Qué te gustaría saber?" },
  { role: "user", content: "sinceramente necesito pensarlo" },
];
check("hesitation does not apply on the visitor's first message", hesitationApplies(true, first) === false);
check("it does from the second message on", hesitationApplies(true, later) === true);
check("and never when the classifier did not read it", hesitationApplies(false, later) === false);
const sig = { hesitation: true, impatience: false, direct_request: false };
const blockFirst = buildConversationStateBlock(first, [], sig) ?? "";
const blockLater = buildConversationStateBlock(later, [], sig) ?? "";
check("the state block's hesitation branch does not fire on a first message", !/hesitating/i.test(blockFirst), blockFirst.slice(0, 200));
check("it still fires on a later one", /hesitating/i.test(blockLater));

// ── The facts line in the state block ───────────────────────────────
{
  const ask = { hesitation: false, impatience: false, direct_request: false };
  const withFacts = buildConversationStateBlock(later.slice(0, 2).concat([{ role: "user", content: "¿cuánto cuesta?" }]), [], ask, undefined, undefined, undefined, ["Kronlarda 20 yıl garanti."]) ?? "";
  check("the facts are stated verbatim when given", withFacts.includes("- Kronlarda 20 yıl garanti."));
  const hesitatingWithFacts = buildConversationStateBlock(later, [], sig, undefined, undefined, undefined, ["Kronlarda 20 yıl garanti."]) ?? "";
  check("and never alongside hesitation", !hesitatingWithFacts.includes("Kronlarda 20 yıl garanti."));
}

// ── Wiring, read from the route ─────────────────────────────────────
const route = readFileSync(join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf8").replace(/\r\n/g, "\n");
check("the route corrects hesitation with hesitationApplies", /const hesitating = hesitationApplies\(signals\.hesitation, turnsWithLatest\);/.test(route));
check("coverage and the price step read the corrected value", /isNearingClose\(turnsWithLatest\) && !hesitating;/.test(route) && /\n\s+hesitating,\n\s+contactKnown:/.test(route));
check(
  "facts are offered only when the visitor asked, is not stepping back, and has not given contact",
  /shouldJudge\(signals\) && !hesitating && !hasContactDetails\(turnsWithLatest\)\s*\?\s*selectBusinessFacts\(/.test(route)
);
check(
  "the facts embedding starts before the classifier is awaited",
  route.indexOf("const factsQuery =") > 0 && route.indexOf("const factsQuery =") < route.indexOf("const signals = await signalsPromise;")
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exitCode = 1;
} else {
  console.log("\nthe business's own facts, chosen by meaning and figures, in any language");
}
