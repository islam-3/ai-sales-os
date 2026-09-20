// Tests for the language a lead gets routed in.
//
// These clinics staff a sales rep per language, so this field decides who
// picks a lead up. Getting it wrong is worse than leaving it empty: a
// lead labelled German that is really Arabic goes to the wrong rep and
// sits there, while an empty field just sends the owner to the
// conversation, which is where they were before.
//
//   npx tsx scripts/test-visitor-language.ts

import { readFileSync } from "fs";
import { join } from "path";
import { detectScript, qualifyingMessages, resolveVisitorLanguage } from "../lib/visitor-language";

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

const ARABIC = "مرحبا، أفكر في زراعة الأسنان وأريد معرفة التفاصيل";
const ENGLISH = "hi, I'm looking into full mouth dental implants";
const RUSSIAN = "Здравствуйте, меня интересует имплантация зубов";
const TURKISH = "Merhaba, implant tedavisi hakkında bilgi almak istiyorum";

console.log("--- which messages count as evidence ---");
check("a short reply is ignored", qualifyingMessages(["ok"]).length === 0);
check("so is a bare yes", qualifyingMessages(["yes"]).length === 0);
check(
  "so is a phone number, which has no letters at all",
  qualifyingMessages(["+90 532 111 2233"]).length === 0,
  "letting it count would make the field depend on how a conversation ended"
);
check("a real sentence counts", qualifyingMessages([ENGLISH]).length === 1);
check(
  "only the last three count",
  qualifyingMessages([ENGLISH, ENGLISH, ENGLISH, ARABIC]).length === 3
);

console.log("\n--- the script the visitor is writing in ---");
check("Arabic", detectScript([ARABIC]) === "arabic");
check("Russian is Cyrillic", detectScript([RUSSIAN]) === "cyrillic");
check("English is Latin", detectScript([ENGLISH]) === "latin");
check("Turkish is Latin", detectScript([TURKISH]) === "latin");
check("nothing to go on", detectScript(["ok", "yes"]) === null);

console.log("\n--- the mixed cases ---");
// Brand names are deliberately never translated, so they turn up inside
// Arabic messages constantly.
check(
  "Latin brand names inside Arabic stay Arabic",
  detectScript(["نستخدم غرسات Implant Swiss السويسرية وتيجان Straumann"]) === "arabic",
  "counted by letter, not by presence"
);
check(
  "a visitor who opens in English and switches to Arabic routes as Arabic",
  detectScript([ENGLISH, "ok that sounds good to me", ARABIC, ARABIC]) === "arabic",
  "routing should follow where the conversation ended up, not where it opened"
);
check(
  "and the reverse switch routes as English",
  detectScript([ARABIC, ARABIC, ENGLISH, "could you tell me about the cost please"]) === "latin"
);
check(
  "one stray message does not flip a conversation",
  detectScript([ARABIC, "thanks very much indeed", ARABIC]) === "arabic"
);

console.log("\n--- the model proposes, the script vetoes ---");
check(
  "an answer the script agrees with is kept",
  resolveVisitorLanguage("Arabic", [ARABIC]).language === "Arabic"
);
const vetoed = resolveVisitorLanguage("German", [ARABIC]);
check("an answer the script contradicts is dropped", vetoed.language === null);
check("and the contradiction is reported", vetoed.vetoed === true);
check(
  "Persian is accepted on Arabic script, because script cannot tell them apart",
  resolveVisitorLanguage("Persian", [ARABIC]).language === "Persian"
);
check(
  "Ukrainian is accepted on Cyrillic, for the same reason",
  resolveVisitorLanguage("Ukrainian", [RUSSIAN]).language === "Ukrainian"
);
check(
  "a language we have no script rule for is accepted as given",
  resolveVisitorLanguage("Swahili", [ENGLISH]).language === "Swahili",
  "an incomplete list must never reject a correct answer"
);
check(
  "Turkish on Latin script is kept",
  resolveVisitorLanguage("Turkish", [TURKISH]).language === "Turkish"
);
check(
  "Russian claimed over Latin text is dropped",
  resolveVisitorLanguage("Russian", [ENGLISH]).language === null
);
check("no answer means no value", resolveVisitorLanguage(null, [ARABIC]).language === null);
check("an empty answer means no value", resolveVisitorLanguage("   ", [ARABIC]).language === null);
check(
  "with nothing written yet, the answer stands unchecked",
  resolveVisitorLanguage("Arabic", ["ok"]).language === "Arabic"
);

console.log("\n--- structural: judged on the visitor's own words ---");
const routeSrc = readFileSync(join(process.cwd(), "app/api/chat/route.ts"), "utf8");
check(
  "only the visitor's messages are passed in",
  /filter\(\(row\) => row\.role === "user"\)\.map\(\(row\) => row\.content\)/.test(routeSrc),
  "never the assistant's replies, never the tenant's settings"
);
check("the veto runs before anything is stored", /resolveVisitorLanguage\(extracted\.visitor_language, visitorMessages\)/.test(routeSrc));
check("a contradiction is logged, not swallowed", /visitor language contradicted by script/.test(routeSrc));

const promptSrc = readFileSync(join(process.cwd(), "lib/lead-language.ts"), "utf8");
check("the model is asked to judge only their messages", /never from the assistant's replies/.test(promptSrc));
check(
  "and to answer in English whatever the team reads",
  /Give it in ENGLISH/.test(promptSrc),
  "it is a routing key: one lead saying Arapca and another Arabic would break filtering"
);

console.log(bad ? `\n${bad} FAILING` : "\nall visitor-language tests passed");
process.exit(bad ? 1 : 0);
