// The owner's own number must never reach a visitor.
//
//   npx tsx scripts/test-contact-privacy.ts
//
// There used to be one "phone" field, and it went straight into the
// system prompt, so the assistant volunteered it without the business
// ever having agreed that it could be shared. It is now two fields: the
// owner's private number, and the customer-facing WhatsApp number that
// is the only one the assistant may give out.
//
// This checks the property directly - a distinctive number goes in, and
// must not appear in anything the model is handed - rather than checking
// that one particular line of code was written a particular way.

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { BEHAVIOUR_PROMPT, buildSystemPrompt } from "../lib/business-prompt";
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

const OWNER = "+90 555 OWNER 111";
const PUBLIC = "+90 532 PUBLIC 222";

const build = (contact: Record<string, string>) =>
  buildSystemPrompt({
    businessName: "Prof Clinic",
    industry: "Dental clinic",
    description: "We treat international patients.",
    settings: parseTenantSettings({ contact }),
  });

console.log("--- the owner's number never reaches the model ---");
const both = build({ owner_phone: OWNER, whatsapp: PUBLIC });
check("the owner's number is absent", !both.includes("OWNER"), both.slice(0, 200));
check("the customer-facing number is present", both.includes("PUBLIC"));

// The migration case: a tenant who only ever filled in "phone".
const legacy = build({ phone: OWNER });
check(
  "a legacy phone field is treated as PRIVATE",
  !legacy.includes("OWNER"),
  "nobody agreed that number could be given out, so it is not"
);
check(
  "and with nothing shareable, the model is told so",
  /NO contact number to give/i.test(legacy),
  "silence has to be instructed, or the model fills the gap itself"
);
check(
  "with a number, it is told that one is the only one",
  /ONLY contact number you may ever give/i.test(both)
);

console.log("\n--- and it cannot arrive by another field ---");
check(
  "not through email",
  !build({ owner_phone: OWNER, email: "info@clinic.com" }).includes("OWNER")
);
check(
  "not through the website",
  !build({ owner_phone: OWNER, website: "https://clinic.com" }).includes("OWNER")
);
check(
  "not when it is the only contact detail at all",
  !build({ owner_phone: OWNER }).includes("OWNER")
);
check(
  "and not when both numbers are the same value",
  build({ owner_phone: PUBLIC, whatsapp: PUBLIC }).split("PUBLIC").length - 1 === 1,
  "the same digits in both fields must still be published once, as the public one"
);

console.log("\n--- the settings parser keeps them apart ---");
const parsed = parseTenantSettings({ contact: { phone: OWNER, whatsapp: PUBLIC } });
check("legacy phone lands on owner_phone", parsed.contact?.owner_phone === OWNER);
check("whatsapp is untouched", parsed.contact?.whatsapp === PUBLIC);
check(
  "and there is no 'phone' key left to leak through",
  !("phone" in (parsed.contact ?? {})),
  "a stray key is what the next reader would wire up by accident"
);

console.log("\n--- nothing else reads the owner's number ---");
// A source sweep, because the property test above can only see the
// prompt. Anything that builds visitor-facing text is fair game.
const VISITOR_FACING = ["lib", "app/api/chat", "components/chat"];
const offenders: string[] = [];
function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry)) {
      // Comments stripped first: a file explaining WHY it must not read
      // the field would otherwise be reported for mentioning it, which
      // is how this check first failed.
      const src = readFileSync(full, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ 	]*\/\/.*$/gm, "");
      // Reading the field is fine in tenant-settings, which defines it.
      if (full.includes("tenant-settings")) continue;
      if (/contact[?.]*\.owner_phone/.test(src)) offenders.push(full);
    }
  }
}
VISITOR_FACING.forEach((d) => walk(join(process.cwd(), d)));
check(
  "no visitor-facing code reads contact.owner_phone",
  offenders.length === 0,
  offenders.join(", ")
);
check(
  "and the behaviour prompt names no number of its own",
  !/\+\d[\d\s().-]{7,}/.test(BEHAVIOUR_PROMPT),
  "a number hard-coded in the prompt would apply to every tenant"
);

console.log(bad ? `\n${bad} FAILING` : "\nall contact-privacy tests passed");
process.exit(bad ? 1 : 0);
