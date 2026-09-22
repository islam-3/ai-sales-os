// Background work that must outlive the response.
//
//   npx tsx scripts/test-keep-alive.ts

import { readFileSync } from "fs";
import { join } from "path";
import { keepAlive } from "../lib/keep-alive";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const REQUEST_CONTEXT = Symbol.for("@vercel/request-context");
type Global = Record<symbol, unknown>;

/** Stands in for the platform's per-request context. */
function withHost<T>(run: (held: Promise<unknown>[]) => T): T {
  const held: Promise<unknown>[] = [];
  const g = globalThis as unknown as Global;
  const previous = g[REQUEST_CONTEXT];
  g[REQUEST_CONTEXT] = { get: () => ({ waitUntil: (p: Promise<unknown>) => held.push(p) }) };
  try {
    return run(held);
  } finally {
    if (previous === undefined) delete g[REQUEST_CONTEXT];
    else g[REQUEST_CONTEXT] = previous;
  }
}

function withoutHost<T>(run: () => T): T {
  const g = globalThis as unknown as Global;
  const previous = g[REQUEST_CONTEXT];
  delete g[REQUEST_CONTEXT];
  try {
    return run();
  } finally {
    if (previous !== undefined) g[REQUEST_CONTEXT] = previous;
  }
}

async function main() {
  console.log("--- the promise is handed to the host ---");
  withHost((held) => {
    keepAlive(Promise.resolve("done"), "work");
    check("the host is given something to hold", held.length === 1);
  });

  withHost((held) => {
    keepAlive(Promise.resolve(1), "a");
    keepAlive(Promise.resolve(2), "b");
    check("each piece of work is held separately", held.length === 2);
  });

  console.log("\n--- without a host it still runs, and does not throw ---");
  let ran = false;
  withoutHost(() => {
    keepAlive(
      (async () => {
        ran = true;
      })(),
      "work"
    );
    check("calling it off-platform does not throw", true);
  });
  await new Promise((r) => setTimeout(r, 10));
  check("and the work is still started", ran);

  console.log("\n--- a rejection cannot take the instance down ---");
  // extractAndSaveLead swallows its own errors today, but keepAlive is
  // general and the next caller may not. An unhandled rejection inside
  // held work kills the whole instance on some runtimes, which would turn
  // a missing lead into a failed conversation.
  let unhandled: unknown = null;
  const onUnhandled = (reason: unknown) => {
    unhandled = reason;
  };
  process.on("unhandledRejection", onUnhandled);

  withHost((held) => {
    keepAlive(Promise.reject(new Error("boom")), "failing work");
    check("a rejecting promise is still handed over", held.length === 1);
  });
  withoutHost(() => {
    keepAlive(Promise.reject(new Error("boom")), "failing work");
  });

  await new Promise((r) => setTimeout(r, 50));
  process.off("unhandledRejection", onUnhandled);
  check("nothing escapes as an unhandled rejection", unhandled === null, String(unhandled));

  console.log("\n--- the chat route does not drop its background work ---");
  // This is the assertion that actually protects the lead. The bug was a
  // bare `void` before a `return`, which reads as deliberate and is
  // exactly what someone would write again.
  const route = readFileSync(join(process.cwd(), "app/api/chat/route.ts"), "utf8");
  check(
    "extraction is held open",
    /keepAlive\(\s*\n?\s*extractAndSaveLead\(/.test(route),
    "the last turn of a conversation is the one that carries the phone number"
  );
  check("metering is held open", /keepAlive\(recordConversationStart\(/.test(route));
  check(
    "no background call is left dangling on a bare void",
    !/void\s+(extractAndSaveLead|recordConversationStart)\(/.test(route),
    "a dropped promise is killed when the response returns"
  );

  console.log(bad ? `\n${bad} FAILING` : "\nall keep-alive tests passed");
  process.exit(bad ? 1 : 0);
}

main();
