// A reply to a price question always gives a concrete next step, in any industry.
//
//   npx tsx scripts/test-price-next-step.ts
//
// FREE: no model call, no database. The model's half (does it follow the
// state-block line?) is measured in scripts/measure-price-step.ts.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decidePriceStep,
  ensurePriceStep,
  priceStepLines,
  PRICE_STEP_SENTENCES,
  type PriceStep,
  type PriceStepInput,
} from "../lib/price-next-step";
import { FALLBACK_LANGUAGES } from "../lib/safe-fallback";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

// ── 1. The decision ──────────────────────────────────────────────────
console.log("--- what the reply must ask for ---");
const base: PriceStepInput = { asksAboutPrice: true, hesitating: false, contactKnown: false, caseSeen: false, seeingTheCaseApplies: true };
const kind = (over: Partial<PriceStepInput>) => decidePriceStep({ ...base, ...over }).kind;
check("not a price question: nothing", kind({ asksAboutPrice: false }) === "none");
check("hesitating: nothing (the hesitation branch makes its own one offer)", kind({ hesitating: true }) === "none");
check("a business that needs to see the case, no contact: case and contact", kind({}) === "case_and_contact");
check("a business that quotes without seeing it, no contact: details and contact", kind({ seeingTheCaseApplies: false }) === "details_and_contact");
check("case already attached, no contact: details and contact", kind({ caseSeen: true }) === "details_and_contact");
check("contact known, case not seen, business needs it: case only", kind({ contactKnown: true }) === "case_only");
check("contact known, nothing left to ask: quote follows", kind({ contactKnown: true, caseSeen: true }) === "quote_follows");
check("contact known, business never needs the case: quote follows", kind({ contactKnown: true, seeingTheCaseApplies: false }) === "quote_follows");

// ── 2. The fixed sentences ───────────────────────────────────────────
console.log("\n--- the fixed sentences ---");
check(
  "one pair of sentences for every language the apology exists in",
  JSON.stringify(Object.keys(PRICE_STEP_SENTENCES).sort()) === JSON.stringify([...FALLBACK_LANGUAGES].sort())
);
for (const lang of FALLBACK_LANGUAGES) {
  for (const variant of ["case", "details"] as const) {
    const sentence = PRICE_STEP_SENTENCES[lang][variant];
    check(`${lang} ${variant}: exactly one question, at the end`, (sentence.match(/[?؟？]/g) ?? []).length === 1 && /[?؟？]$/.test(sentence), sentence);
    check(`${lang} ${variant}: asks for the WhatsApp number`, /WhatsApp|واتساب/.test(sentence));
  }
  check(`${lang}: the two variants differ`, PRICE_STEP_SENTENCES[lang].case !== PRICE_STEP_SENTENCES[lang].details);
}
// Modern Standard Arabic: none of the colloquial forms the dialect judge
// flagged in the reply experiment, nor the common ones beside them.
const DIALECT = /(?:^|\s)(?:اللي|بدك|بدي|شو|هلق|مو|عشان|إيش|ليش|هيك|كتير|منيح|بتختلف|محتاجين|نقدر|يستاهل|تلاقي)(?:\s|$|[،.؟])/;
for (const variant of ["case", "details"] as const) {
  check(`ar ${variant}: Modern Standard, no colloquial forms`, !DIALECT.test(PRICE_STEP_SENTENCES.ar[variant]), PRICE_STEP_SENTENCES.ar[variant]);
}

// ── 3. No industry words, anywhere a visitor or the model reads ──────
console.log("\n--- no industry words ---");
// Trades this platform serves or could, in the seven languages. A word
// here in a sentence or a line means the step was written for one
// industry and would read wrongly for every other.
const INDUSTRY = [
  /\b(?:teeth|tooth|dental|dentist|implants?|crowns?|veneers?|clinic|patients?|treatments?|doctors?|surgery|surgeon|x-?rays?|hair|transplant|cosmetic|medical|lawyer|legal|car|garage|lesson|course)\b/i,
  /أسنان|سن\b|زراعة|عيادة|مريض|علاج|طبيب|جراحة|أشعة|شعر|تجميل/,
  /зуб|имплант|клиник|пациент|лечени|врач|хирург|рентген|волос/i,
  /\b(?:diş|implant|klinik|hasta|tedavi|doktor|ameliyat|röntgen|saç)/i,
  /\b(?:dientes?|dental|implantes?|clínica|pacientes?|tratamientos?|médico|cirugía|radiografía|pelo|cabello)\b/i,
  /牙|种植|诊所|患者|治疗|医生|手术|植发/,
  /歯|インプラント|クリニック|患者|治療|医師|手術/,
];
const industryWord = (text: string) => INDUSTRY.map((re) => text.match(re)?.[0]).find(Boolean);
for (const lang of FALLBACK_LANGUAGES) {
  for (const variant of ["case", "details"] as const) {
    const hit = industryWord(PRICE_STEP_SENTENCES[lang][variant]);
    check(`${lang} ${variant} sentence names no industry`, !hit, `found "${hit}"`);
  }
}
const kinds: PriceStep["kind"][] = ["none", "case_and_contact", "details_and_contact", "case_only", "quote_follows"];
for (const k of kinds) {
  for (const impatient of [false, true]) {
    const text = priceStepLines({ kind: k } as PriceStep, impatient).join(" ");
    const hit = industryWord(text);
    check(`state-block line for ${k}${impatient ? " (impatient)" : ""} names no industry`, !hit, `found "${hit}"`);
  }
}
// The check must be able to fail, or it proves nothing.
check("the industry check does catch an industry word", Boolean(industryWord("attach a photo of your teeth")) && Boolean(industryWord("صورة لأسنانك")));

// ── 4. The state-block lines ─────────────────────────────────────────
console.log("\n--- the state-block lines ---");
check("no line when there is no step", priceStepLines({ kind: "none" }, false).length === 0);
const caseLine = priceStepLines({ kind: "case_and_contact" }, false).join(" ");
check("case and contact: asks to attach a photo here, and for name and WhatsApp", /attach a photo/.test(caseLine) && /name and WhatsApp number/.test(caseLine));
const detailsLine = priceStepLines({ kind: "details_and_contact" }, false).join(" ");
check("details and contact: asks what they need, and for name and WhatsApp, and no photo", /what they need/.test(detailsLine) && /name and WhatsApp number/.test(detailsLine) && !/photo/.test(detailsLine));
check("every step forbids an invented price", kinds.filter((k) => k !== "none").every((k) => /never invent/.test(priceStepLines({ kind: k } as PriceStep, false).join(" "))));
check("impatient: the step is a statement, not a question", /not a question/.test(priceStepLines({ kind: "case_and_contact" }, true).join(" ")));
check("quote follows: asks for nothing", /Ask for nothing else/.test(priceStepLines({ kind: "quote_follows" }, false).join(" ")));

// ── 5. The check after the reply ─────────────────────────────────────
console.log("\n--- a dead-end reply gets the step, in the visitor's language ---");
// Real dead-end replies from docs/reply-provider-2026-11-08.md (gpt-6.1-terra).
const DEAD_ENDS: [string, string[], string | null, string][] = [
  ["en", ["how much does it cost?"], "en", "The cost depends on the treatment you need, and our team will need to assess your case before confirming a price."],
  ["ar", ["كم التكلفة؟"], null, "تعتمد تكلفة زراعة الأسنان على حالتك وخطة العلاج التي يوصي بها طبيب الأسنان. لا تتوفر لدينا الأسعار هنا، وسيؤكدها لك فريقنا بعد تقييم حالتك."],
  ["ru", ["Сколько это стоит?"], null, "Стоимость зависит от того, сколько имплантов и какие дополнительные процедуры понадобятся. Наша команда уточнит цену после оценки вашего случая."],
  ["zh", ["你好，我想了解一下你们的服务", "费用是多少？"], null, "费用需要根据您的口腔情况和所需治疗方案确定，我们的团队会为您确认具体报价。"],
  ["tr", ["Fiyat ne kadar?"], "tr", "İmplant tedavisinin fiyatını ekibimizin sizin için teyit etmesi gerekiyor. Üst çenenizde kaç implant gerekeceği ve kemik grefti ihtiyacı fiyatı etkileyebilir."],
  ["es", ["¿Cuánto cuesta?"], "es", "El precio dependerá de la valoración de tu caso y del tratamiento que necesites. Nuestro equipo tendrá que confirmarte el coste."],
];
for (const [lang, visitor, chatLanguage, reply] of DEAD_ENDS) {
  const out = ensurePriceStep(reply, { kind: "case_and_contact" }, { impatient: false, visitorMessages: visitor, chatLanguage });
  const expected = PRICE_STEP_SENTENCES[lang as keyof typeof PRICE_STEP_SENTENCES].case;
  check(`${lang}: appended in ${lang}`, out.outcome === "appended" && out.reply.endsWith(expected), out.reply.slice(-80));
  check(`${lang}: the model's own words are kept`, out.reply.startsWith(reply));
}
const ja = ensurePriceStep("費用は状況によります。", { kind: "details_and_contact" }, { impatient: false, visitorMessages: ["こんにちは、サービスについて知りたいです", "いくらですか"] });
// Known limit of detectScript (MIN_CHARS = 8, docs/HANDOFF.md open item):
// a visitor who has written ONLY a few CJK characters has no script yet.
// The safe direction: nothing appended, never a guess.
check(
  "a conversation of only very short CJK appends nothing rather than guessing",
  ensurePriceStep("费用视情况而定。", { kind: "case_and_contact" }, { impatient: false, visitorMessages: ["多少钱"] }).outcome === "skipped_no_language"
);
check("Japanese is told from Chinese by kana, and gets the details variant", ja.outcome === "appended" && ja.reply.endsWith(PRICE_STEP_SENTENCES.ja.details));

const withQuestion = ensurePriceStep("It depends on your case. What would you like to achieve?", { kind: "case_and_contact" }, { impatient: false, visitorMessages: ["price?"], chatLanguage: "en" });
check("a reply that already asks something is left alone", withQuestion.outcome === "model_gave_step" && !withQuestion.reply.includes("WhatsApp"));
check("Arabic question mark counts", ensurePriceStep("هل لديك صورة؟", { kind: "case_and_contact" }, { impatient: false, visitorMessages: ["السعر"] }).outcome === "model_gave_step");
check("full-width question mark counts", ensurePriceStep("您方便发照片吗？", { kind: "case_and_contact" }, { impatient: false, visitorMessages: ["多少钱"] }).outcome === "model_gave_step");

const latinUnknown = ensurePriceStep("It depends on your case.", { kind: "case_and_contact" }, { impatient: false, visitorMessages: ["precio?"], chatLanguage: null });
check("Latin script with no chat language: nothing appended rather than a guess", latinUnknown.outcome === "skipped_no_language" && latinUnknown.reply === "It depends on your case.");
const impatient = ensurePriceStep("It depends on your case.", { kind: "case_and_contact" }, { impatient: true, visitorMessages: ["price?"], chatLanguage: "en" });
check("impatient: no question is added", impatient.outcome === "skipped_impatient");
for (const k of ["none", "case_only", "quote_follows"] as const) {
  check(`${k}: never appended`, ensurePriceStep("It depends.", { kind: k }, { impatient: false, visitorMessages: ["price?"], chatLanguage: "en" }).outcome === "not_needed");
}

// ── 6. Wiring ────────────────────────────────────────────────────────
console.log("\n--- wiring ---");
const route = readFileSync(join(__dirname, "..", "app", "api", "chat", "route.ts"), "utf8").replace(/\r\n/g, "\n");
check("the route decides once and hands the same decision to the state block", /const priceStep = decidePriceStep\(/.test(route) && /answeredFor,\n\s+priceStep\n\s+\);/.test(route));
check("the photo variant comes from this business's own coverage, not an industry", /seeingTheCaseApplies: relevantFor\.has\("photos"\)/.test(route));
const ensureAt = route.indexOf("ensurePriceStep(shaped");
const leakAt = route.indexOf("const leaked = containsInternalState(candidate, injected);");
check("the step is added before the leak check, so it is checked too", ensureAt > 0 && leakAt > ensureAt);
// Read from source: importing capture-unanswered would load the OpenAI
// client, and test- scripts must not (scripts/test-live-gate.ts).
const capture = readFileSync(join(__dirname, "..", "lib", "capture-unanswered.ts"), "utf8");
check(
  "capture still sees a price question",
  /return signals.asking_for_information || signals.direct_request || signals.asks_about_price === true;/.test(capture)
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log("\nevery price question gets a next step, in every industry and language");
