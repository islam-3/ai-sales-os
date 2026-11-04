// Phone fields are saved with ASCII digits, whatever script the visitor used.
//
//   npx tsx scripts/test-contact-digits.ts
//
// FREE: no model call, no database.
//
// The extraction model copies contact details exactly as given, as the
// prompt asks: "٠٥٤٤٩٨٧٦٥٤٣" came back as "٠٥٤٤٩٨٧٦٥٤٣" on 2026-11-04.
// Right for the transcript, wrong for the field. wa.me links and many
// dialers take only ASCII digits, and anything written with \d sees no
// number there at all.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { normaliseContactDigits, transcriptBlocks, extractionTurns } from "../lib/lead-extraction";
import { needsCountryCode } from "../lib/phone-number";
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
const root = join(__dirname, "..");

// ── 1. The lead's contact_info, as extraction returns it to be saved ──
console.log("--- contact_info is saved with ASCII digits ---");
const norm = (contact_info: string | null) => normaliseContactDigits({ contact_info }).contact_info;
check("Arabic-Indic", norm("٠٥٤٤٩٨٧٦٥٤٣") === "05449876543", String(norm("٠٥٤٤٩٨٧٦٥٤٣")));
check("Persian (Extended Arabic-Indic)", norm("۰۵۴۴۹۸۷۶۵۴۳") === "05449876543", String(norm("۰۵۴۴۹۸۷۶۵۴۳")));
check("a plus and the grouping survive", norm("+٩٠ ٥٤٤ ٩٨٧ ٦٥٤٣") === "+90 544 987 6543", String(norm("+٩٠ ٥٤٤ ٩٨٧ ٦٥٤٣")));
check("ASCII is untouched", norm("+90 532 111 2233") === "+90 532 111 2233");
check("an email is untouched", norm("ahmed@example.com") === "ahmed@example.com");
check("null stays null", norm(null) === null);
const whole = normaliseContactDigits({ name: "أحمد", contact_info: "٠٥٤٤٩٨٧٦٥٤٣", notes: "رقم ٠٥٤٤٩٨٧٦٥٤٣" });
check("only contact_info changes: the name is untouched", whole.name === "أحمد");
check("only contact_info changes: generated fields keep what the model wrote", whole.notes === "رقم ٠٥٤٤٩٨٧٦٥٤٣");

// The route must save what callLeadExtraction returns, not parse the
// model's text a second time and skip the normalisation.
const extractionSrc = readFileSync(join(root, "lib/lead-extraction.ts"), "utf8");
const routeSrc = readFileSync(join(root, "app/api/chat/route.ts"), "utf8");
check(
  "callLeadExtraction normalises before returning",
  /extracted: normaliseContactDigits\(JSON\.parse\(jsonText\)\)/.test(extractionSrc)
);
check(
  "the route saves callLeadExtraction's value, with no second parse",
  /const extracted: Partial<ExtractedLead> = result\.extracted;/.test(routeSrc) && !/JSON\.parse\(/.test(routeSrc),
  "a JSON.parse in the route would be a second, unnormalised reading"
);

// ── 2. The transcript is never normalised ────────────────────────────
console.log("\n--- the transcript stays the visitor's own words ---");
const blocks = transcriptBlocks(extractionTurns([], null, "رقمي ٠٥٤٤٩٨٧٦٥٤٣", "شكراً"));
check("Arabic-Indic digits reach the model as typed", blocks[0].text === "User: رقمي ٠٥٤٤٩٨٧٦٥٤٣", blocks[0].text);

// ── 3. The country-code flag ─────────────────────────────────────────
console.log("\n--- the country-code flag reads Arabic-Indic numbers ---");
check("٠٥٤٤٩٨٧٦٥٤٣ is flagged (no country code)", needsCountryCode("٠٥٤٤٩٨٧٦٥٤٣") === true);
check("and still flagged once normalised", needsCountryCode(norm("٠٥٤٤٩٨٧٦٥٤٣")) === true);
check("+٩٠ ٥٤٤ ٩٨٧ ٦٥٤٣ is not flagged", needsCountryCode("+٩٠ ٥٤٤ ٩٨٧ ٦٥٤٣") === false);
check("Persian ۰۵۴۴۹۸۷۶۵۴۳ is flagged", needsCountryCode("۰۵۴۴۹۸۷۶۵۴۳") === true);

// ── 4. The business's own phone fields ───────────────────────────────
console.log("\n--- the business's WhatsApp and owner phone ---");
const settings = parseTenantSettings({
  contact: { whatsapp: "+٩٠ ٥٣٢ ١١١ ٢٢٣٣", owner_phone: "۰۵۳۲ ۱۱۱ ۲۲۳۳", email: "a@b.co" },
});
check("whatsapp is ASCII", settings.contact?.whatsapp === "+90 532 111 2233", settings.contact?.whatsapp);
check("owner_phone is ASCII", settings.contact?.owner_phone === "0532 111 2233", settings.contact?.owner_phone);
check("a save round trip keeps them ASCII", parseTenantSettings(settings).contact?.whatsapp === "+90 532 111 2233");
check(
  "the legacy 'phone' key is normalised too",
  parseTenantSettings({ contact: { phone: "٠٥٣٢١١١٢٢٣٣" } }).contact?.owner_phone === "05321112233"
);

// ── 5. Links ─────────────────────────────────────────────────────────
// None exist today: the lead card shows the number as text. This makes
// sure the first one built does not put raw Arabic-Indic digits in a
// href. Any file that builds a wa.me or tel: link must normalise.
console.log("\n--- dial links ---");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(p);
  }
  return out;
}
const linkFiles = [...walk(join(root, "app")), ...walk(join(root, "components")), ...walk(join(root, "lib"))].filter((f) =>
  /wa\.me\/|["'`]tel:/.test(readFileSync(f, "utf8"))
);
const unnormalised = linkFiles.filter((f) => !/normaliseDigits/.test(readFileSync(f, "utf8")));
check(
  `every file building a wa.me or tel: link normalises its digits (${linkFiles.length} such files today)`,
  unnormalised.length === 0,
  unnormalised.join(", ")
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log("\nphone fields are saved and flagged on ASCII digits");
