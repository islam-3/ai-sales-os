// Does the answer-gap judge see the same business facts the reply sees?
//
//   npx tsx scripts/test-business-facts.ts
//
// ── The bug this exists to prevent ──────────────────────────────────
// The judge was handed knowledge_base rows and nothing else, while the
// reply's system prompt also carried the business's location, opening
// hours, languages, service area, currency and contact details from
// settings.
//
// So a business that filled in "Opening hours: 24/7" — which test-clinic
// has — would see "customers asked about opening hours, no answer yet"
// on its own dashboard, for a question the assistant had just answered
// correctly from that very field. Being told to write down something you
// already wrote down is precisely what made the previous design
// unusable, and this was the same failure arriving through a door nobody
// had looked at.
//
// The fix is structural: both call sites read businessFactLines(). What
// follows checks that the structure actually holds, because "they share
// a function" is only true until someone adds a line to the identity
// block instead.
//
// No network, no model, no database.

import {
  BUSINESS_FACTS_TITLE,
  businessFactLines,
  businessFactsForJudge,
  buildSystemPrompt,
  type BusinessIdentity,
} from "../lib/business-prompt";
import { parseTenantSettings } from "../lib/tenant-settings";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

/**
 * Every settings field the prompt can mention, with a sentinel value.
 *
 * Sentinels rather than realistic values so a match cannot be a
 * coincidence of ordinary English, and so a missing one is obvious in
 * the failure output.
 *
 * ── Add a field here when you add one to the prompt ─────────────────
 * This fixture is the only part of the check that a new settings field
 * can slip past. If you add `settings.parking` to businessFactLines,
 * add it here too, or the sentinel sweep below has nothing to sweep.
 */
const SENTINELS = {
  businessName: "ZQBUSINESSNAME",
  industry: "ZQINDUSTRY",
  description: "ZQDESCRIPTION",
  address: "ZQADDRESS",
  city: "ZQCITY",
  country: "ZQCOUNTRY",
  opening_hours: "ZQHOURS",
  service_area: "ZQSERVICEAREA",
  currency: "ZQCURRENCY",
  whatsapp: "ZQWHATSAPP",
  email: "ZQEMAIL",
  website: "ZQWEBSITE",
};

/** The private one. Must appear in NEITHER output. */
const OWNER_PHONE = "ZQOWNERPHONE";

const full: BusinessIdentity = {
  businessName: SENTINELS.businessName,
  industry: SENTINELS.industry,
  description: SENTINELS.description,
  settings: parseTenantSettings({
    location: {
      address: SENTINELS.address,
      city: SENTINELS.city,
      country: SENTINELS.country,
    },
    opening_hours: SENTINELS.opening_hours,
    service_area: SENTINELS.service_area,
    currency: SENTINELS.currency,
    languages: ["en", "ar"],
    contact: {
      whatsapp: SENTINELS.whatsapp,
      email: SENTINELS.email,
      website: SENTINELS.website,
      owner_phone: OWNER_PHONE,
    },
  }),
};

const prompt = buildSystemPrompt(full);
const judge = businessFactsForJudge(full);

// ── 1. Every sentinel the reply gets, the judge gets ─────────────────
//
// This is the whole point. Not "the judge gets something" — the judge
// gets the SAME things, field by field.
console.log("--- every fact the reply sees, the judge sees ---");
for (const [field, sentinel] of Object.entries(SENTINELS)) {
  const inPrompt = prompt.includes(sentinel);
  const inJudge = judge.content.includes(sentinel);
  check(
    `${field}: reply=${inPrompt ? "yes" : "no"} judge=${inJudge ? "yes" : "no"}`,
    inPrompt === inJudge,
    inPrompt && !inJudge
      ? `the reply can answer questions about ${field} and the judge would call it a GAP`
      : `the judge has ${field} and the reply does not — the judge is judging against material the assistant never had`
  );
}

// ── 2. Language names, which are rendered not echoed ─────────────────
//
// `languages` is stored as codes and printed as names, so there is no
// sentinel for it. Checked by its rendered form instead.
check(
  "languages reach both, as names",
  prompt.includes("Languages spoken: English, Arabic") &&
    judge.content.includes("Languages spoken: English, Arabic"),
  judge.content
);

// ── 3. The owner's private number reaches neither ────────────────────
check("owner_phone is in neither the prompt nor the judge's material", !prompt.includes(OWNER_PHONE) && !judge.content.includes(OWNER_PHONE));

// ── 4. The structural guarantee ──────────────────────────────────────
//
// Every fact line appears verbatim in both. If someone adds a settings
// line directly to buildIdentityBlock instead of to businessFactLines,
// the sentinel sweep above catches it; this catches the reverse, a fact
// line that stops reaching the prompt.
console.log("\n--- the shared list is actually shared ---");
const lines = businessFactLines(full);
check(`${lines.length} fact lines produced`, lines.length > 0);
check(
  "every fact line is in the system prompt",
  lines.every((l) => prompt.includes(l)),
  lines.filter((l) => !prompt.includes(l)).join(" | ")
);
check(
  "every fact line is in the judge's material",
  lines.every((l) => judge.content.includes(l)),
  lines.filter((l) => !judge.content.includes(l)).join(" | ")
);
check("the judge's entry has a title", judge.title === BUSINESS_FACTS_TITLE);

// ── 5. A business that has filled in nothing ─────────────────────────
//
// The judge's entry must not become a list of blanks a model could read
// as real values, and it must not be empty in a way that breaks the
// numbered listing.
console.log("\n--- a business with only a name ---");
const bare: BusinessIdentity = {
  businessName: "ZQBARE",
  industry: null,
  description: null,
  settings: parseTenantSettings({}),
};
const bareJudge = businessFactsForJudge(bare);
check("content is non-empty, so the entry is usable", bareJudge.content.trim().length > 0);
check("it carries the name", bareJudge.content.includes("ZQBARE"));
check(
  "and nothing else",
  bareJudge.content.split(/\r?\n/).length === 1,
  JSON.stringify(bareJudge.content)
);
check(
  "no empty labels that could read as real values",
  !/:\s*$/m.test(bareJudge.content) && !bareJudge.content.includes("undefined"),
  bareJudge.content
);

// ── 6. The questions this actually fixes ─────────────────────────────
//
// Named, so the next person can see what was broken rather than
// inferring it from a diff.
console.log("\n--- the questions that would have been false gaps ---");
const fixed: [string, string][] = [
  ["what are your opening hours?", SENTINELS.opening_hours],
  ["where are you based?", SENTINELS.city],
  ["do you serve my area?", SENTINELS.service_area],
  ["what currency are prices in?", SENTINELS.currency],
  ["how can I reach you on WhatsApp?", SENTINELS.whatsapp],
  ["what languages do you speak?", "Arabic"],
];
for (const [question, needed] of fixed) {
  check(`"${question}" is answerable from the judge's material`, judge.content.includes(needed));
}

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
