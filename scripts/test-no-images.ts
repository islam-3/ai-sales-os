// Two things the assistant must never say about images.
//
//   npx tsx scripts/test-no-images.ts                  (structure only)
//   LIVE=1 DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/test-no-images.ts   (and the model)
//
// Image sending is gone from the product. That removes the code, not the
// subject: a visitor can still ask, and the two ways of answering badly
// are both things this project has already done in front of real people.
//
//   LIMITATION   "unfortunately I can't send pictures here" - said in
//                Arabic, untrue of the business, and put in its mouth by
//                a line we wrote ourselves. It advertises incapability
//                for a clinic that has the photos and will happily send
//                them from WhatsApp.
//
//   PROMISE      four consecutive turns saying a photo was on its way,
//                with nothing ever arriving. Worse than a refusal,
//                because the visitor waits.
//
// The honest answer is neither. Say what the business has, and let the
// team share it. Not sending is simply not a topic.
//
// ── Why two legs ─────────────────────────────────────────────────────
// The STRUCTURE leg is cheap, deterministic, and catches the failure
// that actually happened: a sentence of ours, in the prompt, that the
// model then dutifully repeated. It also sweeps the source, because the
// note "(a photo of this is available to show)" was appended to every
// knowledge entry and survived three rounds of deleting the feature.
//
// The LIVE leg is the only one that can see phrasing we did not think
// of. It asks for photos in four failure classes - Latin, RTL, Cyrillic
// and no-spaces CJK - because the limitation line appeared in Arabic
// first, and an English-only check would have called it clean.

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { BEHAVIOUR_PROMPT, buildSystemPrompt } from "../lib/business-prompt";
import { NO_IMAGES_INSTRUCTION } from "../lib/no-images";
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
 * Phrasings that describe not sending as a limitation of the business.
 *
 * Matched against MODEL OUTPUT, so they are written as the model writes:
 * contractions, first person, and the apology that usually precedes it.
 */
const LIMITATION = [
  /\b(can'?t|cannot|can not|unable to|not able to)\s+(send|share|show|display|attach|upload|provide)\b/i,
  /\bI\s+(don'?t|do not)\s+have\s+(the\s+)?(ability|option|capability)\b/i,
  /\b(no|not)\s+(able|possible)\s+to\s+(send|show|share)\s+(you\s+)?(any\s+)?(image|photo|picture)/i,
  /\b(image|photo|picture)s?\s+(can'?t|cannot)\s+be\s+(sent|shared|shown|displayed)\b/i,
  /\b(this|the)\s+chat\s+(doesn'?t|does not|can'?t|cannot)\s+(support|allow|send)\b/i,
];

/**
 * Phrasings that imply one is arriving.
 *
 * "I'll send" and "here you go" are the two that actually happened. The
 * rest are the near neighbours a model reaches for when it has been told
 * not to use the first two.
 */
const PROMISE = [
  /\bhere (you go|it is|they are|are some|'?s a)\b/i,
  /\bas you can see\b/i,
  /\b(take|have) a look at (this|these|the (photo|image|picture))/i,
  /\bI'?(ll| will|'?m going to| am going to)\s+(send|share|show|attach|upload)\b/i,
  /\b(let me|I can)\s+(send|share|show|attach)\s+(you\s+)?(a|an|some|the)?\s*(photo|image|picture)/i,
  /\b(photo|image|picture)s?\s+(will|are|is)\s+(follow|coming|attached|below|on (the|its) way)/i,
  /\b(sending|attaching|uploading)\s+(you\s+)?(a|an|some|the)?\s*(photo|image|picture)/i,
  /\bbelow you'?ll (see|find)\b/i,
];

const firstMatch = (text: string, patterns: RegExp[]) =>
  patterns.find((p) => p.test(text))?.source;

// ── STRUCTURE ────────────────────────────────────────────────────────

console.log("--- the instruction itself ---");
const prompt = buildSystemPrompt({
  businessName: "Prof Clinic",
  industry: "Dental clinic",
  description: "We treat international patients and keep a record of past cases.",
  settings: parseTenantSettings({ contact: { whatsapp: "+90 532 000 0000" } }),
});

check("it reaches the assembled prompt", prompt.includes(NO_IMAGES_INSTRUCTION));
check(
  "it forbids the limitation line explicitly",
  /never say that images cannot be sent/i.test(NO_IMAGES_INSTRUCTION),
  "the failure was our own sentence, so the ban has to be our own sentence too"
);
check(
  "it forbids implying one is coming",
  /never imply a picture is coming/i.test(NO_IMAGES_INSTRUCTION)
);
check(
  "it still allows saying such cases exist",
  /before-and-after|past results/i.test(NO_IMAGES_INSTRUCTION),
  "the business has them; denying it would be a different lie"
);
check(
  "and it has no branches",
  !/\bif (an? )?(image|photo|picture)\b/i.test(NO_IMAGES_INSTRUCTION),
  "the branching version let one branch go quiet, and four turns promised a photo"
);

console.log("\n--- nothing in the prompt says either thing ---");
check(
  "the behaviour prompt states no limitation",
  !LIMITATION.some((p) => p.test(BEHAVIOUR_PROMPT.replace(NO_IMAGES_INSTRUCTION, ""))),
  firstMatch(BEHAVIOUR_PROMPT.replace(NO_IMAGES_INSTRUCTION, ""), LIMITATION)
);
check(
  "the behaviour prompt promises nothing",
  !PROMISE.some((p) => p.test(BEHAVIOUR_PROMPT.replace(NO_IMAGES_INSTRUCTION, ""))),
  firstMatch(BEHAVIOUR_PROMPT.replace(NO_IMAGES_INSTRUCTION, ""), PROMISE)
);

console.log("\n--- and no knowledge entry is annotated as showable ---");
// The exact string is gone, but so should be anything that tells the
// model a photo is available for a fact it is about to state - that note
// is what an offer was built on, and it outlived three deletions.
const offenders: string[] = [];
function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(entry)) {
      const src = readFileSync(full, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      // archive-knowledge-media.ts is the script that RETIRED those rows.
      // It has to name the table to delete from it, and it is kept rather
      // than deleted because it records where the exported files went.
      if (
        full.includes("no-images") ||
        full.includes("test-no-images") ||
        full.includes("archive-knowledge-media")
      ) {
        continue;
      }
      if (/available to show|photo of this is|media available/i.test(src)) offenders.push(full);
      if (/knowledge_base_media/.test(src)) offenders.push(`${full} (reads media rows)`);
    }
  }
}
["lib", "app", "components", "scripts"].forEach((d) => walk(join(process.cwd(), d)));
check("no code annotates an entry with an available photo", offenders.length === 0, offenders.join("\n      "));

// Upload surfaces, by exhaustive list rather than by absence. Removing
// the upload UI, I missed the one in AddEntryForm.tsx and only found it
// by grepping afterwards — so the two that legitimately remain are named
// here, and a third has to be argued for rather than merely appear.
const ALLOWED_UPLOADS = new Set([
  join("components", "chat", "ChatClient.tsx"), // the visitor's own photo, for the lead
  join("components", "dashboard", "business", "BrandingForm.tsx"), // the business logo
]);
const uploads: string[] = [];
function walkUploads(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkUploads(full);
    else if (/\.tsx?$/.test(entry) && /type="file"/.test(readFileSync(full, "utf8"))) {
      const rel = full.slice(process.cwd().length + 1);
      if (!ALLOWED_UPLOADS.has(rel)) uploads.push(rel);
    }
  }
}
["app", "components"].forEach((d) => walkUploads(join(process.cwd(), d)));
check(
  "the only file uploads are the visitor's photo and the business logo",
  uploads.length === 0,
  uploads.join("\n      ")
);

// ── LIVE ─────────────────────────────────────────────────────────────

const ASKS: { klass: string; text: string }[] = [
  { klass: "Latin", text: "Can you send me some before and after photos of your implant work?" },
  { klass: "RTL", text: "هل يمكنك أن ترسل لي صور قبل وبعد لعمليات الزراعة؟" },
  { klass: "Cyrillic", text: "Вы можете прислать мне фото до и после?" },
  { klass: "CJK", text: "可以发给我一些种植牙前后的照片吗？" },
];

async function live() {
  const { anthropic } = await import("../lib/anthropic");
  const MODEL = process.env.CHAT_MODEL ?? "claude-sonnet-4-6";
  console.log(`\n--- what the model actually says (${MODEL}) ---`);

  for (const ask of ASKS) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: prompt,
      messages: [{ role: "user", content: ask.text }],
    });
    const reply = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    // Only the Latin reply can be pattern-matched directly; the others
    // are translated back first, because a limitation stated in Arabic
    // is exactly the one that shipped.
    const english =
      ask.klass === "Latin"
        ? reply
        : await translate(anthropic, MODEL, reply);

    const lim = firstMatch(english, LIMITATION);
    const pro = firstMatch(english, PROMISE);
    check(`${ask.klass.padEnd(8)} claims no limitation`, !lim, lim && `${lim}\n      ${english}`);
    check(`${ask.klass.padEnd(8)} promises no image`, !pro, pro && `${pro}\n      ${english}`);
    console.log(`         ${reply.replace(/\s+/g, " ").slice(0, 110)}`);
  }
}

/** Literal, so a hedge survives the round trip instead of being tidied away. */
async function translate(
  anthropic: typeof import("../lib/anthropic").anthropic,
  model: string,
  text: string
): Promise<string> {
  const res = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system:
      "Translate the user's message into English as literally as you can. Keep every hedge, apology and promise exactly as strong as it is in the original. Output the translation and nothing else.",
    messages: [{ role: "user", content: text }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

async function main() {
  if (process.env.LIVE === "1") await live();
  else console.log("\n(live leg skipped — set LIVE=1 to ask the model itself)");

  console.log(bad ? `\n${bad} FAILING` : "\nall no-images tests passed");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
