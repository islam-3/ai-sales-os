// What a visitor sees when the model is unavailable.
//
// Point this at a server started with a deliberately broken key:
//
//   ANTHROPIC_API_KEY=sk-ant-invalid npx next dev --port 3100
//   BASE_URL=http://localhost:3100 DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/live-degraded-check.ts
//
// The failure this proves is fixed: the Anthropic account ran out of
// credit, the chat route had no try/catch anywhere in it, and every
// visitor to every tenant got a bare HTTP 500 with an empty body. The
// widget showed "Sorry, something went wrong." A clinic's patient hit a
// hard error because a billing date passed.
//
// It will happen again — billing lapses, keys rotate, providers have
// incidents — so what matters is what the visitor gets instead:
//
//   * HTTP 200, so the widget renders a message rather than an error
//   * the safe fallback, IN THEIR OWN LANGUAGE
//   * a conversation they can carry on with, since the next turn may work
//
// Run it with a WORKING key too. It should report that nothing degraded,
// which is the control: a check that passes against a healthy server is
// not testing anything.

import { say } from "./_chat-client";
import { allSafeFallbacks } from "../lib/safe-fallback";
import { detectScript, type VisitorScript } from "../lib/visitor-language";

const FALLBACKS = allSafeFallbacks();

type Case = { klass: string; script: VisitorScript; message: string };

/**
 * One per failure class that a SCRIPT can name.
 *
 * Latin is deliberately absent as its own expectation: no script can
 * tell English from Turkish from Spanish, so a Latin-writing visitor
 * gets the tenant's configured language. That is a real design decision
 * rather than an oversight, and it is asserted as such below.
 */
const CASES: Case[] = [
  { klass: "Arabic", script: "arabic", message: "مرحبا، أفكر في زراعة الأسنان" },
  { klass: "Russian", script: "cyrillic", message: "Здравствуйте, меня интересует имплантация" },
  { klass: "Chinese", script: "cjk", message: "你好，我想了解种植牙" },
  { klass: "English", script: "latin", message: "hello, I am looking into dental implants" },
];

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

async function main() {
  console.log(`against ${process.env.BASE_URL ?? "http://localhost:3000"}\n`);

  let degradedCount = 0;

  for (const c of CASES) {
    let reply: string;
    try {
      ({ reply } = await say(crypto.randomUUID(), c.message));
    } catch (error) {
      // A THROW is the failure this exists to catch: it means the route
      // returned a non-200 rather than degrading.
      bad++;
      console.log(`FAIL  ${c.klass.padEnd(8)} the request failed outright`);
      console.log(`      ${String((error as Error).message).slice(0, 140)}`);
      console.log("      a visitor would see an error, not a reply");
      continue;
    }

    const flat = reply.replace(/\s+/g, " ").trim();
    const isFallback = FALLBACKS.some((f) => flat.startsWith(f.slice(0, 20)));
    if (isFallback) degradedCount++;

    const replyScript = detectScript([flat]);
    console.log(
      `  ${c.klass.padEnd(8)} ${isFallback ? "degraded" : "answered"} in ${replyScript ?? "?"}: ${flat.slice(0, 54)}`
    );

    if (isFallback) {
      // Latin cannot name a language, so a Latin visitor correctly gets
      // the tenant's configured language — which may be any script. The
      // assertion for Latin is therefore only that SOMETHING coherent
      // came back, not that it is English.
      if (c.script === "latin") {
        check(`${c.klass.padEnd(8)} got a real fallback`, flat.length > 0);
      } else {
        check(
          `${c.klass.padEnd(8)} the fallback is in their script`,
          replyScript === c.script,
          `got ${replyScript}; an apology in the wrong language is the failure twice over`
        );
      }
    }
  }

  console.log(
    degradedCount === 0
      ? "\nNothing degraded — the model is reachable. Run this against a broken key to test the path."
      : `\n${degradedCount}/${CASES.length} degraded, and every one returned a usable reply.`
  );
  console.log(bad ? `\n${bad} FAILING` : "\nno visitor would have seen an error");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
