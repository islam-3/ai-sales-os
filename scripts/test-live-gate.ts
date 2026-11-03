// No test- script may reach a model unless LIVE=1.
//
//   npx tsx scripts/test-live-gate.ts
//
// FREE: reads source files, makes no call of any kind.
//
// README promises test-* is "pure, fast, free". Running every test- script
// on 3 November nearly broke that promise: test-dialect-judge asks Sonnet
// sixteen questions, and only a missing API key in that shell stopped it
// spending. A script's name is a convention, and a convention is what
// failed. So this sweep makes it a check.
//
// ── The rule ──────────────────────────────────────────────────────────
// A model is reachable through MODEL_CLIENTS below: the Anthropic and
// OpenAI SDKs, the two lib files that construct them, and the chat
// client, whose say() makes production spend on every turn.
//
//   1. No test- script may reach one through STATIC imports, followed
//      transitively through lib/. A static import runs at load time, so
//      it cannot be gated.
//   2. A script that reaches one through a DYNAMIC import (`await
//      import(...)`) must contain the gate, `process.env.LIVE === "1"`,
//      and must say what it skipped when the gate is closed.
//
// ── What it cannot see ────────────────────────────────────────────────
// It proves the gate EXISTS in a script that loads a client lazily. It
// does not prove the dynamic import sits behind it; that is still a
// reading job, and the convention is test-no-images.ts: one live()
// function, called only from the gated branch. `import type` is ignored
// because it is erased at compile time and can call nothing.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = join(__dirname, "..");
const SELF = "scripts/test-live-gate.ts";

const MODEL_CLIENTS = new Set([
  "lib/anthropic.ts",
  "lib/openai.ts",
  "scripts/_chat-client.ts",
  "pkg:@anthropic-ai/sdk",
  "pkg:openai",
]);

/** `=== "1"` to run the live leg, or `!== "1"` to skip out early. */
const GATE = /process\.env\.LIVE\s*[!=]==\s*["']1["']/;

/**
 * Scripts that load a model client but provably never call it.
 *
 * Each entry carries the reason and a check of that reason against the
 * source. If the check stops holding, the exception stops applying and
 * the script fails like any other. An exception that is only a comment
 * is a convention, and conventions are what this file replaces.
 */
const EXCEPTIONS: Record<string, { reason: string; holds: () => string | null }> = {
  "scripts/test-capture-cap.ts": {
    reason:
      "reaches lib/openai through capture-unanswered -> embeddings, but injects a fake Anthropic " +
      "client that always answers 'answered', so capture returns at the judge before the " +
      "shortening call or any embedding. The fake throws if the shortening call runs.",
    holds: () => {
      const test = readFileSync(join(ROOT, "scripts/test-capture-cap.ts"), "utf8");
      const capture = readFileSync(join(ROOT, "lib/capture-unanswered.ts"), "utf8");
      if (!/anthropic:\s*anthropic as never/.test(test)) return "no longer injects the fake Anthropic client";
      if (!/the rewrite should not run on an answered verdict/.test(test)) return "the fake no longer throws on the rewrite";
      const judge = capture.indexOf("judgeAnswerGap(");
      const early = capture.indexOf('if (verdict.answered) return "answered";');
      const firstEmbed = capture.indexOf("generateEmbedding(");
      const firstShorten = capture.indexOf("shortenAndMatch(anthropic");
      if (judge < 0 || early < 0) return "capture no longer returns early on an answered verdict";
      if (!(judge < early && early < firstEmbed && early < firstShorten)) {
        return "capture now embeds or shortens before it can return on an answered verdict";
      }
      return null;
    },
  },
};
const SKIP_MESSAGE = /set LIVE=1/;

type Edge = { to: string; dynamic: boolean };

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec === "@anthropic-ai/sdk" || spec === "openai") return `pkg:${spec}`;
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(join(ROOT, fromFile)), spec);
  else return null; // another package: not a model client
  for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(ROOT, candidate).split("\\").join("/");
    }
  }
  return null;
}

const edgeCache = new Map<string, Edge[]>();
function edges(file: string): Edge[] {
  const cached = edgeCache.get(file);
  if (cached) return cached;
  const src = readFileSync(join(ROOT, file), "utf8");
  const found: Edge[] = [];
  // Static: import/export ... from "x", skipping `import type` / `export type`.
  const staticRe = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']/g;
  // Side-effect: import "x";
  const bareRe = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  const dynamicRe = /import\(\s*["']([^"']+)["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(src))) {
    if (m[1]) continue;
    const to = resolveImport(file, m[2]);
    if (to) found.push({ to, dynamic: false });
  }
  while ((m = bareRe.exec(src))) {
    const to = resolveImport(file, m[1]);
    if (to) found.push({ to, dynamic: false });
  }
  while ((m = dynamicRe.exec(src))) {
    const to = resolveImport(file, m[1]);
    if (to) found.push({ to, dynamic: true });
  }
  edgeCache.set(file, found);
  return found;
}

/**
 * The first route from `start` to a model client, or null.
 *
 * `staticOnly` follows only static imports from the start file; a
 * dynamic import anywhere downstream of a lazily loaded module is still
 * lazy from the script's point of view, so after the first hop every
 * edge counts.
 */
function pathToClient(start: string, staticOnly: boolean): string[] | null {
  const parent = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const file = queue.shift()!;
    if (file.startsWith("pkg:")) continue;
    for (const e of edges(file)) {
      if (staticOnly && e.dynamic) continue;
      if (parent.has(e.to)) continue;
      parent.set(e.to, file);
      if (MODEL_CLIENTS.has(e.to)) {
        const chain = [e.to];
        let n = parent.get(e.to) ?? null;
        while (n) {
          chain.unshift(n);
          n = parent.get(n) ?? null;
        }
        return chain;
      }
      queue.push(e.to);
    }
  }
  return null;
}

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const scripts = readdirSync(join(ROOT, "scripts"))
  .filter((f) => /^test-.*\.ts$/.test(f))
  .map((f) => `scripts/${f}`)
  .filter((f) => f !== SELF);

let lazy = 0;
for (const file of scripts) {
  const src = readFileSync(join(ROOT, file), "utf8");
  const atLoad = pathToClient(file, true);
  const exception = EXCEPTIONS[file];
  if (atLoad && exception) {
    const broken = exception.holds();
    check(
      `${file}: loads a model client but cannot call it (checked exception)`,
      broken === null,
      broken ? `exception no longer holds: ${broken}. Gate it behind LIVE=1.` : undefined
    );
    continue;
  }
  if (atLoad) {
    check(`${file}: no model client at load time`, false, `static import chain: ${atLoad.join(" -> ")}`);
    continue;
  }
  const anyRoute = pathToClient(file, false);
  if (!anyRoute) {
    check(`${file}: cannot reach a model`, true);
    continue;
  }
  lazy++;
  check(
    `${file}: reaches a model lazily, behind LIVE=1`,
    GATE.test(src) && SKIP_MESSAGE.test(src),
    GATE.test(src)
      ? `no "set LIVE=1" message: a closed gate must say what it skipped`
      : `no process.env.LIVE === "1" gate; route: ${anyRoute.join(" -> ")}`
  );
}

// The sweep must be able to see what it is looking for. If the import
// parsing broke, every script would read "cannot reach a model" and this
// file would pass while checking nothing.
check(
  `the sweep finds at least one gated script (found ${lazy})`,
  lazy > 0,
  "test-no-images.ts loads lib/anthropic lazily; if that is not found, the parser is broken"
);

if (bad > 0) {
  console.log(`\n${bad} failed`);
  process.exit(1);
}
console.log(`\nall ${scripts.length} test- scripts are free unless LIVE=1`);
