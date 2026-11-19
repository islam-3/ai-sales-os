// The greeting suggestion and translation on OpenAI, written out to be READ.
//
//   LIVE=1 [MEASURE_ONE=1] DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-greeting-provider.ts
//
// PAID: 8 suggestions (2 businesses x 4 languages) + 8 translations,
// on GREETING_MODEL (default gpt-6.1-terra). Writes
// docs/greeting-openai-<date>.md for a person to judge by eye; the only
// Sonnet reference is prof-clinic's stored English suggestion.
//
// Code checks each one first, and lists what failed rather than hiding it:
//   - under GREETING_MAX_CHARS;
//   - no figure that is not in the business's own details (the prompt
//     forbids inventing a number, a year or a guarantee);
//   - the business name as written (translations);
//   - the same number of chips (translations).
// They are not the verdict. Reading is.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { GREETING_MAX_CHARS, type GreetingDraftInput } from "../lib/greeting-prompts";
import { calculateCostUsd } from "../lib/ai-pricing";

const MODEL = process.env.GREETING_MODEL ?? "gpt-6.1-terra";

/** A constructed business, not dental, and the one step 8 proposes as the second test tenant. */
const REAL_ESTATE: Omit<GreetingDraftInput, "language"> = {
  businessName: "Bosphorus Key Realty",
  industry: "Real estate agency",
  description:
    "We help international buyers and renters find apartments and villas in Istanbul, from Beşiktaş and Sarıyer on the European side to Kadıköy on the Asian side. Our team speaks English, Arabic, Russian and Turkish, arranges viewings in person or by video, and handles the title deed (tapu) process and residence permit paperwork for buyers.",
  city: "Istanbul",
  country: "Turkey",
  categories: ["Apartments for sale", "Villas", "Rentals", "Citizenship by investment", "Title deed and paperwork"],
};

const SUGGEST_LANGS = ["English", "Arabic", "Turkish", "Russian"];
const TRANSLATE_CLINIC = ["Arabic", "Russian", "Turkish", "Spanish", "Chinese", "Japanese"];
const TRANSLATE_REALTY = ["Arabic", "Russian"];
const CLINIC_CHIPS = ["Dental treatment", "Hair transplant", "About the business", "Ask about prices"];
const REALTY_CHIPS = ["Buy an apartment", "Rent", "Citizenship by investment", "Arrange a viewing"];

const figures = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map((d) => d.replace(/[.,]$/, ""));

function checks(text: string, source: string, extra: string[] = []): string[] {
  const bad = [...extra];
  if (text.length > GREETING_MAX_CHARS) bad.push(`${text.length} characters, over ${GREETING_MAX_CHARS}`);
  const invented = figures(text).filter((f) => !source.includes(f));
  if (invented.length) bad.push(`figures not in the business's details: ${invented.join(", ")}`);
  return bad;
}

async function main() {
  if (process.env.LIVE !== "1") {
    console.log("(skipped: paid, 16 OpenAI calls — set LIVE=1 after stating the cost)");
    return;
  }
  const { openai } = await import("../lib/openai");
  const { supabaseServer: s } = await import("../lib/supabase-server");
  const { suggestGreetingOpenAI, translateGreetingOpenAI } = await import("../lib/greeting-openai");
  const { data: t } = await s.from("tenants").select("id, business_name, industry, description, settings").eq("slug", "test-clinic").single();
  const { data: cats } = await s.from("knowledge_base").select("category").eq("tenant_id", t!.id).not("category", "is", null);
  const settings = t!.settings as { location?: { city?: string; country?: string } };
  const CLINIC: Omit<GreetingDraftInput, "language"> = {
    // The test tenant's name says "automated runs"; the real one is what a visitor would read.
    businessName: "Prof Clinic",
    industry: t!.industry,
    description: t!.description,
    city: settings.location?.city ?? null,
    country: settings.location?.country ?? null,
    categories: Array.from(new Set((cats ?? []).map((c: { category: string | null }) => c.category ?? "").filter(Boolean))),
  };
  const { data: prof } = await s.from("tenants").select("settings").eq("slug", "prof-clinic").single();
  const sonnetEnglish = (prof!.settings as any)?.chat_intro?.greetings?.en?.text ?? "(none stored)";

  let cost = 0;
  const add = (tokens: any) => { if (tokens) cost += calculateCostUsd(MODEL, tokens); };

  if (process.env.MEASURE_ONE === "1") {
    const r = await suggestGreetingOpenAI(openai, MODEL, { ...CLINIC, language: "English" });
    add(r.tokens);
    console.log(`one suggestion on ${MODEL}: $${cost.toFixed(5)}  ${JSON.stringify(r.tokens)}\n${r.text}`);
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  const out: string[] = [`# Greetings on ${MODEL}, ${date}`, "", "For reading by eye. Code checks are listed under each; they are not the verdict.", ""];
  const flagged: string[] = [];
  const source = (b: Omit<GreetingDraftInput, "language">) => [b.businessName, b.description ?? "", b.city ?? "", b.country ?? ""].join(" ");

  out.push("## Reference: Sonnet's stored English suggestion (prof-clinic)", "", `> ${sonnetEnglish}`, "");
  const englishOf: Record<string, string> = {};
  for (const [label, biz] of [["Prof Clinic (test-clinic's details)", CLINIC], ["Bosphorus Key Realty (constructed)", REAL_ESTATE]] as const) {
    out.push(`## Suggestions: ${label}`, "");
    for (const lang of SUGGEST_LANGS) {
      const r = await suggestGreetingOpenAI(openai, MODEL, { ...biz, language: lang });
      add(r.tokens);
      if (lang === "English") englishOf[biz.businessName] = r.text;
      const bad = checks(r.text, source(biz), r.text ? [] : ["EMPTY"]);
      if (bad.length) flagged.push(`suggestion ${biz.businessName} ${lang}: ${bad.join("; ")}`);
      out.push(`**${lang}** (${r.text.length} chars)${bad.length ? ` — CHECK: ${bad.join("; ")}` : ""}`, "", `> ${r.text}`, "");
    }
  }
  for (const [biz, langs, chips] of [["Prof Clinic", TRANSLATE_CLINIC, CLINIC_CHIPS], ["Bosphorus Key Realty", TRANSLATE_REALTY, REALTY_CHIPS]] as const) {
    const text = englishOf[biz];
    out.push(`## Translations of the ${biz} English suggestion`, "", `Source: ${text}`, "", `Chips: ${chips.join(" · ")}`, "");
    for (const lang of langs) {
      const r = await translateGreetingOpenAI(openai, MODEL, { text, chips: [...chips], language: lang });
      add(r.tokens);
      const extra: string[] = [];
      if (!r.translated) extra.push(`UNUSABLE JSON: ${r.raw.slice(0, 120)}`);
      else {
        if (!r.translated.text.includes(biz)) extra.push("business name not kept as written");
        if (r.translated.chips.length !== chips.length) extra.push(`${r.translated.chips.length} chips, not ${chips.length}`);
      }
      const bad = checks(r.translated?.text ?? "", text, extra);
      if (bad.length) flagged.push(`translation ${biz} ${lang}: ${bad.join("; ")}`);
      out.push(`**${lang}**${bad.length ? ` — CHECK: ${bad.join("; ")}` : ""}`, "", `> ${r.translated?.text ?? "(none)"}`, "", `Chips: ${r.translated?.chips.join(" · ") ?? "(none)"}`, "");
    }
  }
  out.push("## Code checks", "", flagged.length ? flagged.map((f) => `- ${f}`).join("\n") : "Every greeting passed: length, no invented figures, name kept, chip count.", "", `Cost: $${cost.toFixed(4)}`, "");
  const path = join(__dirname, "..", "docs", `greeting-openai-${date}.md`);
  writeFileSync(path, out.join("\n"));
  console.log(`${flagged.length} flagged; cost $${cost.toFixed(4)}; wrote ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
