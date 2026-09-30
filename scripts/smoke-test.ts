// Live smoke test. Runs against the REAL deployment, after every push.
//
//   BASE_URL=https://<prod> DOTENV_CONFIG_PATH=.env.local \
//     npx tsx -r dotenv/config scripts/smoke-test.ts
//
// Every failure we have shipped lately was in a non-English conversation,
// on production, or both — exactly where branch tests were not looking. A
// pure function cannot tell you that the deployed route drops a promise,
// that a guard discards every reply a real model writes, or that an
// English apology is going out to an Arabic visitor. Only a real
// conversation against the real URL can.
//
// One conversation per FAILURE CLASS, not per language: script,
// direction, punctuation, and whether words are separated by spaces.
// Adding a seventh language proves much less than covering a seventh
// property would.
//
// Four assertions per conversation, all of them things that have
// actually gone wrong in production:
//   1. no reply is the safe fallback  (the guard discarding real replies)
//   2. every reply is in the visitor's script  (English at an Arabic visitor)
//   3. a step-back is not answered with a re-pitch  (the signal going
//      silent outside English, which is what the classifier replaced)
//   4. the lead is saved with name AND number  (background work killed)
//
// The media assertions are gone with the feature: image sending was
// removed from the chat, so there is no photo to wait for.
//
// Every conversation asks for the process STEP BY STEP on purpose. The
// guard bug only fired on replies the model formatted as a list, and a
// first draft of this file passed against the broken build precisely
// because no turn ever provoked one. A smoke test that cannot fail on a
// known-bad deployment is decoration.

import { say } from "./_chat-client";
import { allSafeFallbacks } from "../lib/safe-fallback";
import { countWords } from "../lib/punctuation";
import { detectScript, type VisitorScript } from "../lib/visitor-language";
import { runDashboardChecks } from "./smoke-dashboard";

type Case = {
  label: string;
  script: VisitorScript;
  turns: string[];
  name: string;
  digits: string;
};

/**
 * The turn where the visitor steps back, zero-indexed.
 *
 * This slot used to hold a bare "yes please", left over from accepting a
 * photo offer. With image sending gone it accepted nothing, landed on no
 * behaviour at all, and still reported ok every run - a turn that tests
 * nothing while appearing to pass is precisely how the empty test tenant
 * went unnoticed for days.
 *
 * Hesitation replaces it because it is the ONLY thing the classifier
 * still decides. The keyword lists it replaced scored zero recall on
 * every non-English class, so "someone said they need to think about it,
 * in Chinese" is exactly the case that used to be invisible, and nothing
 * checks it against the real deployment.
 */
const HESITATION_TURN = 4;

const CASES: Case[] = [
  {
    label: "English (Latin baseline)",
    script: "latin",
    turns: [
      "hi, I'm looking into full dental implants",
      "I lost most of my upper teeth about five years ago",
      "how much does it cost?",
      "can you walk me through the steps of the whole process?",
      "honestly I need to think about it and talk to my wife first",
      "David",
      "+44 7700 900123",
    ],
    name: "David",
    digits: "447700900123",
  },
  {
    label: "Arabic (right-to-left, ؟)",
    script: "arabic",
    turns: [
      "مرحبا، أفكر في زراعة الأسنان",
      "فقدت معظم أسناني العلوية منذ خمس سنوات",
      "كم التكلفة؟",
      "ممكن تشرح لي خطوات العلاج بالتفصيل؟",
      "بصراحة أحتاج أفكر في الموضوع وأتكلم مع زوجتي أولاً",
      "خالد",
      "+90 532 111 2233",
    ],
    name: "خالد",
    digits: "905321112233",
  },
  {
    label: "Russian (Cyrillic)",
    script: "cyrillic",
    turns: [
      "Здравствуйте, меня интересует имплантация зубов",
      "Я потерял большинство верхних зубов около пяти лет назад",
      "Сколько это стоит?",
      "Расскажите, пожалуйста, по шагам, как проходит весь процесс?",
      "честно говоря, мне нужно подумать и обсудить с женой",
      "Иван",
      "+7 900 123 4567",
    ],
    name: "Иван",
    digits: "79001234567",
  },
  {
    label: "Chinese (no spaces between words)",
    script: "cjk",
    turns: [
      "你好，我想了解种植牙",
      "我大约五年前失去了大部分上排牙齿",
      "费用是多少？",
      "能详细说明一下整个治疗的步骤吗？",
      "说实话我需要考虑一下，还要和我太太商量",
      "王伟",
      "+86 138 0013 8000",
    ],
    name: "王伟",
    digits: "8613800138000",
  },
  {
    label: "Turkish (dotted/dotless i)",
    script: "latin",
    turns: [
      "Merhaba, implant tedavisi düşünüyorum",
      "Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim",
      "Fiyat ne kadar?",
      "Tüm sürecin adımlarını tek tek anlatır mısınız?",
      "dürüst olmak gerekirse düşünmem ve eşimle konuşmam lazım",
      "Mehmet",
      "+90 532 444 5566",
    ],
    name: "Mehmet",
    digits: "905324445566",
  },
  {
    label: "Spanish (¿ inverted punctuation)",
    script: "latin",
    turns: [
      "Hola, estoy considerando implantes dentales",
      "Perdí la mayoría de mis dientes superiores hace cinco años",
      "¿Cuánto cuesta?",
      "¿Me explicas paso a paso todo el proceso?",
      "sinceramente necesito pensarlo y hablarlo con mi mujer",
      "Carlos",
      "+34 612 345 678",
    ],
    name: "Carlos",
    digits: "34612345678",
  },
];

const FALLBACKS = allSafeFallbacks();
const WAIT_SECONDS = 40;

/**
 * How long a reply to hesitation may be, as a fraction of the longest
 * reply already given in the SAME conversation.
 *
 * Relative rather than absolute, because the classes are not equally
 * verbose and an absolute bar cannot serve them all. Measured over all
 * six on the real route (docs/smoke-hesitation-calibration.txt):
 *
 *   class      hesitation   longest earlier   ratio
 *   English        68            190           0.36
 *   Arabic         39            116           0.34
 *   Russian        45            156           0.29
 *   Chinese        60            193           0.31
 *   Turkish        37             80           0.46
 *   Spanish        57            158           0.36
 *
 * An earlier run of the same six put the worst at 0.50 (Arabic, 38/76),
 * so that is the widest gap actually seen, not 0.46.
 *
 * Why a ratio and not a number: in that earlier run the English reply to
 * hesitation ran 83 words, LONGER than the longest Arabic reply of the
 * whole conversation. A single bar would either pass an Arabic re-pitch
 * or fail an English acknowledgement. A re-pitch restates the material
 * that produced the longest reply, so as a ratio it lands near 1.0
 * whatever language it is in.
 *
 * 0.6 leaves headroom above the worst observed without reaching the
 * failure it exists to catch. This codebase has already shipped one
 * threshold set by eye that rejected a correct answer, so the number and
 * the run behind it are recorded together.
 */
const HESITATION_MAX_RATIO = Number(process.env.SMOKE_HESITATION_MAX_RATIO ?? 0.6);

// Paced deliberately. Six conversations back to back is a burst no real
// visitor produces, and running flat out drew 500s from upstream that
// had nothing to do with the code under test. A smoke test that fails
// for its own reasons teaches nobody anything.
const PAUSE_BETWEEN_TURNS_MS = Number(process.env.SMOKE_TURN_PAUSE_MS ?? 1500);
const PAUSE_BETWEEN_CASES_MS = Number(process.env.SMOKE_CASE_PAUSE_MS ?? 5000);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Failure = { case: string; what: string; detail: string };

async function runCase(c: Case): Promise<Failure[]> {
  const failures: Failure[] = [];
  const sessionId = crypto.randomUUID();
  // Word counts of the assistant's replies before the hesitation turn,
  // which is what that turn's length is judged against.
  const replyWords: number[] = [];
  console.log(`\n── ${c.label}`);

  for (let i = 0; i < c.turns.length; i++) {
    // A failing request is a smoke-test failure, not a reason to abandon
    // the run: the remaining classes still need checking, and "it threw"
    // is exactly the kind of result worth reporting rather than hiding.
    let reply: string;
    try {
      ({ reply } = await say(sessionId, c.turns[i]));
    } catch (error) {
      failures.push({
        case: c.label,
        what: `turn ${i + 1}: request failed`,
        detail: String((error as Error).message).slice(0, 140),
      });
      console.log(`   turn ${i + 1}: ✗ REQUEST FAILED`);
      continue;
    }
    await pause(PAUSE_BETWEEN_TURNS_MS);
    const flat = reply.replace(/\s+/g, " ").trim();

    // 1. The guard must not be eating real replies.
    if (FALLBACKS.some((f) => flat.startsWith(f.slice(0, 25)))) {
      failures.push({
        case: c.label,
        what: `turn ${i + 1}: safe fallback returned`,
        detail: flat.slice(0, 90),
      });
      console.log(`   turn ${i + 1}: ✗ SAFE FALLBACK`);
      continue;
    }

    // 2. And the reply must be in the visitor's script. Latin cannot
    //    separate English from Turkish from Spanish, so for those this
    //    asserts only that it did not switch script entirely — which is
    //    the failure that actually happened.
    const replyScript = detectScript([flat]);
    if (replyScript && replyScript !== c.script) {
      failures.push({
        case: c.label,
        what: `turn ${i + 1}: replied in ${replyScript}, visitor wrote ${c.script}`,
        detail: flat.slice(0, 90),
      });
      console.log(`   turn ${i + 1}: ✗ wrong script (${replyScript})`);
      continue;
    }

    // 3. And when they stepped back, the assistant must have noticed.
    //
    //    Measured by LENGTH, which is a proxy and is described as one.
    //    The state block's hesitation branch says to keep it short and
    //    free of obligation, and forbids restating credentials or
    //    listing benefits again. When the signal does NOT arrive the
    //    model gets no instruction at all and answers a step-back with a
    //    re-pitch of the material it has already given — which is long,
    //    in any language.
    //
    //    What this can and cannot see, stated plainly: a re-pitch is
    //    caught, a short reply that presses them to decide is not. It
    //    exists for the regression that actually happened — the signal
    //    going silent outside English — not as a proof of good manners.
    //
    //    Counted in words, not characters: Chinese says in 30 characters
    //    what English needs 55 for, and a character bar would pass CJK
    //    unconditionally. See lib/punctuation.ts.
    const words = countWords(flat);
    if (i === HESITATION_TURN) {
      const longest = Math.max(...replyWords, 1);
      const ratio = words / longest;
      if (ratio > HESITATION_MAX_RATIO) {
        failures.push({
          case: c.label,
          what:
            `turn ${i + 1}: answered hesitation with ${words} words, ` +
            `${(ratio * 100).toFixed(0)}% of its longest earlier reply (${longest}) — ` +
            `max ${(HESITATION_MAX_RATIO * 100).toFixed(0)}%`,
          detail: flat.slice(0, 140),
        });
        console.log(`   turn ${i + 1}: ✗ RE-PITCHED AT HESITATION (${words}w, ${(ratio * 100).toFixed(0)}%)`);
        continue;
      }
    }
    replyWords.push(words);

    const marker = i === HESITATION_TURN ? " hesitation" : "          ";
    console.log(`   turn ${i + 1}:${marker} ${String(words).padStart(3)}w  ${flat.slice(0, 52)}`);
  }

  // 3. The lead must carry what the visitor gave, including the last turn.
  const { supabaseServer } = await import("../lib/supabase-server");
  let lead: { name: string | null; contact_info: string | null } | null = null;
  for (let waited = 0; waited < WAIT_SECONDS; waited += 5) {
    await new Promise((r) => setTimeout(r, 5000));
    const { data } = await supabaseServer
      .from("lead_profile")
      .select("name, contact_info")
      .eq("session_id", sessionId)
      .maybeSingle();
    lead = data ?? null;
    if ((lead?.name ?? "").trim() && (lead?.contact_info ?? "").trim()) break;
  }

  const nameOk = (lead?.name ?? "").includes(c.name);
  const digitsOk = (lead?.contact_info ?? "").replace(/\D/g, "").includes(c.digits);
  if (!nameOk) {
    failures.push({ case: c.label, what: "lead name missing", detail: `expected ${c.name}, got ${lead?.name ?? "—"}` });
  }
  if (!digitsOk) {
    failures.push({
      case: c.label,
      what: "lead number missing",
      detail: `expected ${c.digits}, got ${lead?.contact_info ?? "—"}`,
    });
  }
  console.log(`   lead: name=${nameOk ? "ok" : "MISSING"} number=${digitsOk ? "ok" : "MISSING"}`);

  return failures;
}

/**
 * Refuses to start unless it can actually do its job.
 *
 * Without this, a missing environment variable looks like a product
 * failure: every turn reports REQUEST FAILED and the run dies on an
 * opaque "supabaseUrl is required" forty lines later. The first CI run
 * failed exactly that way and the logs could not be read, so the cause
 * had to be reproduced locally to be guessed at. A smoke test must say
 * what is wrong with ITSELF before it accuses the deployment.
 *
 * Names only, never values: these are secrets.
 */
function preflight(): void {
  const required = [
    ["BASE_URL", "the deployment to test (secrets.PRODUCTION_URL)"],
    ["NEXT_PUBLIC_SUPABASE_URL", "to read back the lead (secrets.SUPABASE_URL)"],
    ["SUPABASE_SERVICE_ROLE_KEY", "lead_profile is not readable anonymously"],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "to sign in as the test owner (secrets.SUPABASE_ANON_KEY)"],
    ["TEST_OWNER_EMAIL", "the dedicated test-tenant owner (secrets.TEST_OWNER_EMAIL)"],
    ["TEST_OWNER_PASSWORD", "its password (secrets.TEST_OWNER_PASSWORD)"],
  ];

  const present = required.filter(([name]) => (process.env[name] ?? "").trim());
  const missing = required.filter(([name]) => !(process.env[name] ?? "").trim());

  if (missing.length > 0) {
    console.error("\nSMOKE TEST CANNOT START — missing configuration, not a product failure:\n");
    missing.forEach(([name, why]) => console.error(`    ${name}  — ${why}`));
    console.error("\n  In CI these come from repository secrets. Check the names match exactly.\n");

    // As a GitHub annotation too, not only on stdout. Workflow LOGS need
    // admin rights on the repo to download; annotations do not. Without
    // this the run says only "exit code 2" to anyone who cannot read the
    // log, which is how the first two runs failed uninformatively.
    //
    // Names and presence only. Never a value, and never a length: both
    // leak more about a secret than a failure message should.
    if (process.env.CI) {
      // stdout, not stderr: GitHub parses workflow commands from stdout
      // only, and the first attempt at this annotation went to stderr and
      // silently never appeared.
      console.log(
        `::error title=Smoke test not configured::Missing: ${missing
          .map(([n]) => n)
          .join(", ")} | Present: ${present.map(([n]) => n).join(", ") || "none"} | ` +
          `If these are set as ENVIRONMENT secrets rather than repository secrets, ` +
          `the job must declare a matching environment: to see them.`
      );
    }
    process.exit(2);
  }

  const base = process.env.BASE_URL!.trim();
  if (process.env.CI && /localhost|127\.0\.0\.1/.test(base)) {
    console.error(`\nSMOKE TEST CANNOT START — BASE_URL is ${base} in CI.`);
    console.error("  There is no server there. Set secrets.PRODUCTION_URL.\n");
    process.exit(2);
  }
}

async function main() {
  preflight();
  console.log(`smoke test against ${process.env.BASE_URL}`);
  // ONLY lets a single class be re-run while chasing one problem.
  const only = (process.env.ONLY ?? "").trim().toLowerCase();
  const cases = only ? CASES.filter((c) => c.label.toLowerCase().includes(only)) : CASES;
  if (cases.length === 0) throw new Error(`no case matches ONLY="${only}"`);

  const failures: Failure[] = [];
  for (const c of cases) {
    failures.push(...(await runCase(c)));
    await pause(PAUSE_BETWEEN_CASES_MS);
  }

  // The dashboard, signed in. The chat half of this suite could not see
  // the lockout that told an owner their account had no business: nothing
  // automated had ever signed in. Skipped when a single class is being
  // re-run, since ONLY means "just chase this one conversation".
  if (!only) {
    const dashboard = await runDashboardChecks(process.env.BASE_URL!);
    failures.push(...dashboard.map((d) => ({ case: "Dashboard", what: d.what, detail: d.detail })));
  }

  console.log(`\n${"═".repeat(70)}`);
  if (failures.length === 0) {
    console.log(`  SMOKE TEST PASSED — ${cases.length} conversation(s)`);
    console.log("═".repeat(70));
    return;
  }
  console.log(`  SMOKE TEST FAILED — ${failures.length} problem(s)`);
  console.log("═".repeat(70));
  failures.forEach((f) => {
    console.log(`\n  ${f.case}`);
    console.log(`    ${f.what}`);
    console.log(`    ${f.detail}`);
  });

  // Each failure as an annotation too. Without this the run reports only
  // "exit code 1" to anyone who cannot download the log, which is the
  // whole point of running this automatically — the person who needs to
  // act on it is not always the person with admin on the repository.
  //
  // GitHub shows at most 10 annotations per level, so the rest are
  // summarised rather than silently dropped.
  if (process.env.CI) {
    const shown = failures.slice(0, 9);
    shown.forEach((f) => {
      const line = `${f.case} — ${f.what}: ${f.detail}`.replace(/\s+/g, " ").slice(0, 400);
      console.log(`::error title=Smoke test failure::${line}`);
    });
    if (failures.length > shown.length) {
      console.log(
        `::error title=Smoke test failures continued::` +
          `${failures.length - shown.length} further problem(s) not listed here; see the log.`
      );
    }
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  // The stack goes to the log, which needs repository admin to read. The
  // message goes to an annotation, which does not — otherwise a crash
  // here is indistinguishable from any other "exit code 2" to whoever is
  // actually looking at the run.
  if (process.env.CI) {
    const message = String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 400);
    console.log(`::error title=Smoke test crashed::${message}`);
  }
  process.exit(2);
});
