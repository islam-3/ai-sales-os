// Tests for the language a lead is written in, and what survives unchanged.
//
// Two things are stored about a visitor and they pull opposite ways. Their
// own words are evidence — tone, urgency, hesitation and exact medical
// wording all matter, and a mistranslated "I have diabetes" is a real
// risk — so the transcript is never translated. What the system writes
// ABOUT them has to be readable by whoever picks the lead up, so it is
// written in the team's language from the start.
//
//   npx tsx scripts/test-lead-language.ts

import { readFileSync } from "fs";
import { join } from "path";
import {
  DEFAULT_LEAD_LANGUAGE,
  buildLeadExtractionPrompt,
  dropUnsupportedNumbers,
  leadLanguage,
  numbersNeedingSupport,
  suggestedLeadLanguage,
} from "../lib/lead-language";
import { parseTenantSettings } from "../lib/tenant-settings";

let bad = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    bad++;
    console.log(`FAIL  ${name}`);
    if (detail) console.log(`        ${detail}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

console.log("--- which language the team reads ---");
check("defaults to English when unset", leadLanguage({}) === DEFAULT_LEAD_LANGUAGE);
check("uses the explicit setting", leadLanguage({ lead_language: "Türkçe" }) === "Türkçe");
check(
  "is NOT taken from the languages the assistant speaks",
  leadLanguage({ languages: ["Arabic", "English"] }) === DEFAULT_LEAD_LANGUAGE,
  "languages spoken describes who the chat can serve, not what the team reads"
);
check(
  "an explicit setting wins over spoken languages",
  leadLanguage({ languages: ["Arabic"], lead_language: "English" }) === "English"
);

console.log("\n--- the first-load suggestion ---");
check("suggests the first spoken language", suggestedLeadLanguage({ languages: ["Turkish", "English"] }) === "Turkish");
check("suggests English when none are set", suggestedLeadLanguage({}) === DEFAULT_LEAD_LANGUAGE);
check(
  "a suggestion only: it does not change what is actually used",
  leadLanguage({ languages: ["Turkish"] }) === DEFAULT_LEAD_LANGUAGE,
  "reordering spoken languages must never silently change stored leads"
);

console.log("\n--- settings round-trip ---");
check(
  "lead_language survives parsing",
  parseTenantSettings({ lead_language: "Deutsch" }).lead_language === "Deutsch"
);
check("blank is dropped rather than stored", parseTenantSettings({ lead_language: "   " }).lead_language === undefined);
check(
  "it is stored separately from languages spoken",
  JSON.stringify(parseTenantSettings({ languages: ["Arabic"], lead_language: "English" })) ===
    JSON.stringify({ languages: ["Arabic"], lead_language: "English" })
);

console.log("\n--- which numbers have to be traceable ---");
check("a price is", numbersNeedingSupport("around 5,000 EUR").includes("5,000"));
check("a year is", numbersNeedingSupport("coming in 2026").includes("2026"));
check("a date is", numbersNeedingSupport("on 12/03/2026").includes("12/03/2026"));
check("a decimal is", numbersNeedingSupport("2.5 hours").includes("2.5"));
check("a small count is not", numbersNeedingSupport("2 visits and 7 days").length === 0, "these are re-renderings of words, not figures");

console.log("\n--- a number that is not in the transcript drops its field ---");
const transcript = [
  "User: I've lost most of my upper teeth, I'm looking at full mouth implants",
  "Assistant: Our packages start at around 5,000 EUR and include a 5-star hotel.",
  "User: ok, I'd come over in March 2026",
].join("\n\n");

const good = dropUnsupportedNumbers(
  {
    ai_summary: "Wants full mouth implants, quoted around 5,000 EUR, travelling March 2026.",
    notes: "Asked about 2 visits.",
    timeline: "March 2026",
  },
  transcript
);
check("a summary quoting the real figures is kept", good.dropped.length === 0, JSON.stringify(good.dropped));
check("its fields are untouched", good.fields.ai_summary !== null && good.fields.timeline === "March 2026");

const localised = dropUnsupportedNumbers(
  { ai_summary: "Angebot rund 5.000 EUR, Anreise März 2026." },
  transcript
);
check(
  "a price localised from 5,000 to 5.000 is dropped, not stored",
  localised.fields.ai_summary === null && localised.dropped[0].numbers.includes("5.000"),
  JSON.stringify(localised.dropped)
);

const invented = dropUnsupportedNumbers({ ai_summary: "Quoted 7,500 EUR." }, transcript);
check("an invented figure is dropped", invented.fields.ai_summary === null);

const mixed = dropUnsupportedNumbers(
  { ai_summary: "Quoted 7,500 EUR.", main_concern: "Full mouth implants", timeline: "March 2026" },
  transcript
);
check("only the offending field is dropped", mixed.fields.main_concern === "Full mouth implants" && mixed.fields.timeline === "March 2026");
check("and it is reported, not silently swallowed", mixed.dropped.length === 1 && mixed.dropped[0].field === "ai_summary");

const nonString = dropUnsupportedNumbers({ age: 52, notes: null }, transcript);
check("numbers stored as numbers are left alone", nonString.fields.age === 52 && nonString.dropped.length === 0);

console.log("\n--- the prompt ---");
const prompt = buildLeadExtractionPrompt("Türkçe");
check("names the team's language", /THE TEAM READING THIS WORKS IN Türkçe/.test(prompt));
// Position matters: buried below the JSON schema this was followed on one
// sample and ignored on the next.
check("states it before the schema, not after", prompt.indexOf("Türkçe") < prompt.indexOf("qualification_score"));
check("repeats it in the closing line", /written in Türkçe except "name" and "contact_info"/.test(prompt));
check("asks for the generated fields in it", /Everything you write about the customer goes in Türkçe/.test(prompt));
check("says there is nothing to convert when it already matches", /already in Türkçe there is nothing to convert/.test(prompt));
check("keeps the visitor's own record verbatim", /are NOT translated, transliterated or reformatted/.test(prompt));
check("carries figures through unchanged", /do not convert 5,000 to 5\.000/.test(prompt));
check(
  "asks for service and brand names exactly as written",
  /names of services and brands: write them exactly as they appear, never translated/.test(prompt)
);
check("keeps the JSON shape it had", /"qualification_score": integer or null/.test(prompt));

// A list of the business's own entry titles used to be pasted in as
// names to preserve. Measurement killed it: without the list the real
// brands still came through untranslated, and WITH it the internal entry
// labels were used as product names ("Implants brand olarak Implant
// Swiss... The warranty hakkinda bilgilendirilmis").
const english = buildLeadExtractionPrompt("English");
check("no list of entry titles is pasted into the prompt", !/spelled exactly like this/.test(english));

console.log("\n--- structural: the transcript itself is never translated ---");
const routeSrc = readFileSync(join(process.cwd(), "app/api/chat/route.ts"), "utf8");
check(
  "the extractor is handed the transcript unchanged",
  /messages: \[\{ role: "user", content: transcript \}\]/.test(routeSrc)
);
check(
  "the prompt is built from the tenant's own setting",
  /buildLeadExtractionPrompt\(language\)/.test(routeSrc) &&
    /leadLanguage\(tenant\.settings\)/.test(routeSrc)
);
check("generated fields pass the number guard before being written", /dropUnsupportedNumbers\(/.test(routeSrc));
// Asserted on the code, not on the word: the file legitimately talks
// about translation in comments explaining why it does not do any.
check(
  "the visitor's message is stored exactly as they sent it",
  /role: "user", content: userContent/.test(routeSrc),
  "the transcript is evidence; translating it at write time would destroy the record"
);
check(
  "no translation call sits on the write path",
  !/translateMessage|translateText|\btranslate\(/.test(routeSrc)
);

console.log(bad ? `\n${bad} FAILING` : "\nall lead-language tests passed");
process.exit(bad ? 1 : 0);
