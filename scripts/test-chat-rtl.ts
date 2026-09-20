// Tests for right-to-left rendering in the visitor chat.
//
// The case these exist for is not an Arabic clinic — it is an ENGLISH
// clinic with Arabic-speaking patients, which is the common one and the
// one most likely to look wrong. Layout direction and text direction are
// different things there, and conflating them produces bubbles whose
// tails point away from the speaker.
//
// So: layout direction comes from the tenant's own language and stays put
// for the whole conversation, while each message resolves its own text
// direction. Rendering cannot be asserted here, but the structure that
// decides it can.
//
//   npx tsx scripts/test-chat-rtl.ts

import { readFileSync } from "fs";
import { join } from "path";
import { isRtlText } from "../lib/chat-intro-i18n";

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

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const css = read("app/chat/[slug]/chat.css");
const client = read("components/chat/ChatClient.tsx");
const page = read("app/chat/[slug]/page.tsx");

console.log("--- nothing in the stylesheet is pinned to a physical side ---");
const physical = css.match(/(?:margin|padding|border)-(?:left|right)[^:]*:|^\s*(?:left|right):/gm) ?? [];
check(
  "no physical left/right properties remain",
  physical.length === 0,
  physical.join(", ")
);
check(
  "the bubble tails are logical, so they follow the speaker's side",
  /border-end-start-radius/.test(css) && /border-end-end-radius/.test(css)
);
check("the timestamp indents are logical", /padding-inline-start/.test(css) && /padding-inline-end/.test(css));
check("the lightbox close button is logical", /inset-inline-end/.test(css));

console.log("\n--- layout direction is the tenant's, and stays put ---");
check("the chat root takes a direction", /dir=\{direction\}/.test(client));
check(
  "it sits on the same element as the theme and the brand palette",
  /data-theme=\{theme\}[\s\S]{0,400}dir=\{direction\}/.test(client),
  "so neither can be affected by the other"
);
check(
  "direction is derived from the greeting that will actually render",
  /direction=\{isRtlText\(intro\.greeting\) \? "rtl" : "ltr"\}/.test(page)
);

console.log("\n--- each message resolves its own text direction ---");
check("bubble text is marked dir=auto", /className="nx-bubble__text" dir="auto"/.test(client));
// The bug this prevents: dir on the bubble itself would make its logical
// radii resolve per message, so an Arabic reply in an English layout
// would flip its own tail while staying on the same side.
check(
  "the bubble itself is NOT given a direction",
  !/className="nx-bubble"\s+dir=/.test(client),
  "a per-message direction there would flip the tail away from the speaker"
);
check("the composer input auto-detects", /className="nx-input"\s*\n\s*dir="auto"/.test(client));
check("the greeting hero auto-detects", /className="nx-greeting__title" dir="auto"/.test(client));
check("the greeting sub-line auto-detects", /className="nx-greeting__sub" dir="auto"/.test(client));

console.log("\n--- which text counts as right-to-left ---");
check("Arabic does", isRtlText("مرحبا، أفكر في زراعة الأسنان"));
check("Hebrew does", isRtlText("שלום"));
check("English does not", !isRtlText("Hi! We're Prof Clinic."));
check("Turkish does not", !isRtlText("Size nasıl yardımcı olabiliriz?"));
check("Russian does not", !isRtlText("Здравствуйте!"));
check(
  "an Arabic message mentioning a Latin-script brand still counts",
  isRtlText("نستخدم غرسات Implant Swiss السويسرية"),
  "brand names stay untranslated inside Arabic replies, and must not flip the reading"
);
check(
  "an English greeting is unaffected by an Arabic conversation later",
  !isRtlText("Hi! We're Prof Clinic in Istanbul."),
  "layout stays left-to-right for an English clinic, whatever visitors write"
);

console.log(bad ? `\n${bad} FAILING` : "\nall chat RTL tests passed");
process.exit(bad ? 1 : 0);
