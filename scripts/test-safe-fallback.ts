// The apology a visitor sees when a generation is discarded.
//
//   npx tsx scripts/test-safe-fallback.ts

import { readFileSync } from "fs";
import { join } from "path";
import { allSafeFallbacks, SAFE_FALLBACK, safeFallbackFor } from "../lib/safe-fallback";
import { containsInternalState } from "../lib/reply-guard";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

// One per failure class, not one per language.
const SAMPLES: [string, string[], string | null, string][] = [
  ["English (Latin baseline)", ["I'm looking into dental implants for my upper jaw"], "English", "en"],
  ["Arabic (right-to-left)", ["مرحبا، أفكر في زراعة الأسنان وأريد أن أعرف التكلفة"], "English", "ar"],
  ["Russian (Cyrillic)", ["Здравствуйте, меня интересует имплантация зубов"], "English", "ru"],
  ["Chinese (no spaces between words)", ["您好，我想了解一下种植牙的价格和流程"], "English", "zh"],
  ["Japanese (kana, no spaces)", ["こんにちは、インプラントについて知りたいのですが"], "English", "ja"],
  ["Turkish (dotted/dotless i)", ["Merhaba, implant tedavisi hakkında bilgi almak istiyorum"], "Turkish", "tr"],
  ["Spanish (inverted punctuation)", ["Hola, ¿cuánto cuesta un implante dental completo?"], "Spanish", "es"],
];

const EXPECTED: Record<string, RegExp> = {
  en: /could you say that once more/i,
  ar: /[؀-ۿ]/,
  ru: /[Ѐ-ӿ]/,
  zh: /[一-鿿]/,
  ja: /[぀-ヿ]/,
  tr: /söyleyebilir misiniz/i,
  es: /podrías repetirlo/i,
};

console.log("--- the visitor is answered in their own language ---");
SAMPLES.forEach(([label, messages, chatLanguage, code]) => {
  const got = safeFallbackFor(messages, chatLanguage);
  check(`${label} → ${code}`, EXPECTED[code].test(got), got);
});

console.log("\n--- the visitor's own writing outranks the tenant's setting ---");
// The whole point: a clinic configured for Arabic still answers an
// English visitor in English, and vice versa.
check(
  "an Arabic visitor at an English-configured clinic gets Arabic",
  /[؀-ۿ]/.test(safeFallbackFor(["مرحبا، أفكر في زراعة الأسنان وأريد أن أعرف التكلفة"], "English"))
);
check(
  "a Russian visitor at an Arabic-configured clinic gets Russian",
  /[Ѐ-ӿ]/.test(safeFallbackFor(["Здравствуйте, меня интересует имплантация"], "Arabic"))
);

console.log("\n--- it never guesses when it cannot tell ---");
check("no messages at all falls back to English", safeFallbackFor([], null) === SAFE_FALLBACK);
check(
  "a bare phone number decides nothing",
  safeFallbackFor(["+90 532 111 2233"], null) === SAFE_FALLBACK,
  "digits are not evidence of a language"
);
check(
  "too short to judge decides nothing",
  safeFallbackFor(["ok"], null) === SAFE_FALLBACK
);
check(
  "an unrecognised setting falls back rather than throwing",
  safeFallbackFor(["hello there, I want implants"], "Klingon") === SAFE_FALLBACK
);
check(
  "a Latin-script visitor at a Turkish clinic gets Turkish",
  /söyleyebilir/i.test(safeFallbackFor(["merhaba nasilsiniz implant istiyorum"], "Türkçe")),
  "the native spelling of the setting must work too"
);

console.log("\n--- every fallback is safe to send at any moment ---");
allSafeFallbacks().forEach((text) => {
  check(`clean: ${text.slice(0, 28)}…`, !containsInternalState(text) && text.length > 15);
});

console.log("\n--- no English-only fallback is left wired into the route ---");
const routeSrc = readFileSync(join(process.cwd(), "app/api/chat/route.ts"), "utf8");
check(
  "the route chooses per visitor",
  /safeFallbackFor\(/.test(routeSrc) && !/SAFE_FALLBACK/.test(routeSrc),
  "a single English constant is what an Arabic visitor received twice in a row"
);

console.log(bad ? `\n${bad} FAILING` : "\nall safe-fallback tests passed");
process.exit(bad ? 1 : 0);
