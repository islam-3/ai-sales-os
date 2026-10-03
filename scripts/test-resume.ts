// Resuming a conversation: the parts that are pure functions.
//
//   npx tsx scripts/test-resume.ts
//
// The live behaviour — transcript comes back, counter does not move, no
// second lead — is verified against the real deployment by
// scripts/live-resume-check.ts. This covers the two seams underneath it
// that a unit test can actually hold still:
//
//   1. the greeting a returning visitor sees is the one they saw before,
//      split back into the same headline and body;
//   2. a stored session expires, is scoped to one tenant, and never
//      throws however broken the stored value is.

import { buildChatIntro } from "../lib/chat-intro";
import { splitStoredGreeting } from "../lib/chat-intro";
import { parseTenantSettings } from "../lib/tenant-settings";
import {
  RESUME_WINDOW_MS,
  readStoredSession,
  sessionStorageKey,
  writeStoredSession,
  clearStoredSession,
} from "../lib/resume";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

// ── 1. The greeting survives the round trip ──────────────────────────
//
// buildChatIntro splits a greeting into title + sub for display and
// stores the CONCATENATION. Resume has to undo that split from the
// stored string alone. If the two ever disagree, a returning visitor
// sees a different-looking clinic — which is the one outcome this
// feature must never produce.

console.log("--- a built greeting splits back into what was built ---");

const CASES: { label: string; settings: Record<string, unknown>; name: string }[] = [
  { label: "English", settings: {}, name: "Prof Clinic" },
  { label: "Arabic", settings: { chat_language: "ar" }, name: "عيادة بروف" },
  { label: "Turkish", settings: { chat_language: "tr" }, name: "Prof Klinik" },
  { label: "Chinese", settings: { chat_language: "zh" }, name: "Prof 诊所" },
  { label: "Russian", settings: { chat_language: "ru" }, name: "Клиника Проф" },
  { label: "Spanish", settings: { chat_language: "es" }, name: "Clínica Prof" },
];

for (const c of CASES) {
  const intro = buildChatIntro({
    businessName: c.name,
    industry: "Dental clinic",
    description: "We treat international patients.",
    categories: ["Implants", "Whitening"],
    settings: parseTenantSettings(c.settings),
  });

  const back = splitStoredGreeting(intro.greeting, intro.title);
  check(
    `${c.label.padEnd(8)} title survives`,
    back.title === intro.title,
    `stored "${intro.greeting}"\n      got title "${back.title}"\n      want      "${intro.title}"`
  );
  check(
    `${c.label.padEnd(8)} sub survives`,
    back.sub === intro.sub,
    `got sub "${back.sub}"\n      want    "${intro.sub}"`
  );
  check(
    `${c.label.padEnd(8)} and nothing is lost`,
    (back.sub ? `${back.title} ${back.sub}` : back.title) === intro.greeting
  );
}

console.log("\n--- and a greeting that no longer matches ---");
check(
  "an intro changed since keeps the visitor's own words",
  splitStoredGreeting("An older welcome line. How can we help?", "Hi! We're Prof Clinic.").sub ===
    "An older welcome line. How can we help?",
  "show what they saw, not what we would say now"
);
check(
  "and shows no headline rather than an invented one",
  splitStoredGreeting("An older welcome line.", "Hi! We're Prof Clinic.").title === "",
  "there is no way to recover where the cut was, so it is not guessed"
);
check(
  "empty is empty",
  splitStoredGreeting("", "Hi!").title === "" && splitStoredGreeting("", "Hi!").sub === ""
);
check(
  "a title with nothing after it leaves an empty sub",
  splitStoredGreeting("Hi! We're Prof Clinic.", "Hi! We're Prof Clinic.").sub === ""
);
check(
  "no current title at all falls back to the whole line",
  splitStoredGreeting("Welcome to the clinic.", "").sub === "Welcome to the clinic."
);

// ── 2. The stored session ────────────────────────────────────────────

console.log("\n--- the stored session ---");

// A minimal localStorage, because this module is written for a browser
// and the rules it enforces are worth testing without one.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

const ID = "11111111-2222-4333-8444-555555555555";

check("keys are scoped to the tenant", sessionStorageKey("a") !== sessionStorageKey("b"));
check("and name the tenant", sessionStorageKey("prof-clinic").includes("prof-clinic"));

writeStoredSession("prof-clinic", { id: ID, startedAt: Date.now() });
check("a fresh session comes back", readStoredSession("prof-clinic")?.id === ID);
check(
  "and not to a different tenant",
  readStoredSession("other-clinic") === null,
  "one browser, two businesses — a shared key would cross the transcripts"
);

writeStoredSession("prof-clinic", { id: ID, startedAt: Date.now() - RESUME_WINDOW_MS - 1000 });
check(
  "a session past the window does not",
  readStoredSession("prof-clinic") === null,
  "measured from the FIRST message, so a conversation cannot extend its own window"
);

store.set(sessionStorageKey("prof-clinic"), "{not json");
check("corrupt storage returns null rather than throwing", readStoredSession("prof-clinic") === null);

store.set(sessionStorageKey("prof-clinic"), JSON.stringify({ id: ID }));
check("a value missing startedAt is rejected", readStoredSession("prof-clinic") === null);

store.set(sessionStorageKey("prof-clinic"), JSON.stringify({ startedAt: Date.now() }));
check("a value missing the id is rejected", readStoredSession("prof-clinic") === null);

// Private windows and embedded frames with third-party storage blocked
// throw on access rather than returning null. The chat page has to open
// in both; losing resume is a degraded visit, a page that will not load
// is a lost lead.
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: () => {
      throw new Error("SecurityError: storage is blocked");
    },
    setItem: () => {
      throw new Error("SecurityError: storage is blocked");
    },
    removeItem: () => {
      throw new Error("SecurityError: storage is blocked");
    },
  },
};
check("a browser that blocks storage reads null", readStoredSession("prof-clinic") === null);
let threw = false;
try {
  writeStoredSession("prof-clinic", { id: ID, startedAt: Date.now() });
  clearStoredSession("prof-clinic");
} catch {
  threw = true;
}
check("and writing to it never throws", !threw);

console.log(bad ? `\n${bad} FAILING` : "\nall resume tests passed");
process.exit(bad ? 1 : 0);
