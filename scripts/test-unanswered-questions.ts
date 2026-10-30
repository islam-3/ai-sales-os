// Grouping and dismissal for captured customer questions.
//
//   npx tsx scripts/test-unanswered-questions.ts
//
// These rules are in a pure function and tested here because both of
// them fail SILENTLY in production. A dismissal that comes back one ask
// early, or a group that absorbs a question it should not, produces a
// dashboard that looks plausible and is wrong — there is nothing to
// notice. The come-back rule in particular has an off-by-one at exactly
// the boundary an owner would see.
//
// The similarity THRESHOLD is not tested here. A threshold is a
// measurement, not an assertion: scripts/measure-question-grouping.ts
// embeds real pairs and prints both distributions.

import {
  ASKS_TO_UNDISMISS,
  SAME_QUESTION_SIMILARITY,
  activeGroups,
  groupAsks,
  groupForAsk,
  type UnansweredAsk,
} from "../lib/unanswered-questions";
import { checkShortQuestion, SHORT_MAX_LENGTH } from "../lib/question-short";
import {
  remainingStarters,
  isStarterKey,
  STARTER_QUESTIONS,
  MAX_STARTERS,
} from "../lib/starter-questions";
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

/** An ask, with only the fields a rule reads. */
let seq = 0;
function ask(over: Partial<UnansweredAsk> & { groupId: string }): UnansweredAsk {
  seq++;
  const { id: _ignored, ...rest } = over;
  const id = over.id ?? `ask-${seq}`;
  return {
    sessionId: `session-${seq}`,
    // Ordered by construction unless overridden, so "latest" is
    // meaningful without every test spelling out a timestamp.
    askedAt: `2026-10-${String(seq).padStart(2, "0")}T00:00:00.000Z`,
    questionRaw: "raw",
    questionShort: "short",
    script: null,
    embedding: null,
    dismissedAt: null,
    ...rest,
    id,
  };
}

// ── 1. Rolling asks up ───────────────────────────────────────────────
console.log("--- grouping ---");
{
  const asks = [
    ask({ id: "a", groupId: "a", questionShort: "how much do implants cost?", script: "latin" }),
    ask({ groupId: "a", script: "arabic" }),
    ask({ groupId: "a", script: "arabic" }),
    ask({ id: "b", groupId: "b", questionShort: "is there parking?" }),
  ];
  const groups = activeGroups(asks);

  check("two groups from four asks", groups.length === 2, `got ${groups.length}`);
  check("most asked comes first", groups[0].groupId === "a", groups[0].groupId);
  check("count is the number of asks", groups[0].count === 3, String(groups[0].count));
  check(
    "the canonical wording is shown, not the newest",
    groups[0].question === "how much do implants cost?",
    groups[0].question
  );
  check(
    "distinct scripts, deduplicated",
    groups[0].scripts.join(",") === "arabic,latin",
    groups[0].scripts.join(",")
  );
  check("latest is the most recent ask", groups[0].latest.askedAt > asks[0].askedAt);
}

// A group whose canonical row is missing — the row was deleted, or the
// page is showing a partial fetch. It must still render something rather
// than crash on an undefined.
{
  const groups = groupAsks([ask({ groupId: "gone", questionShort: "orphaned" })]);
  check("an orphaned group still renders", groups.length === 1 && groups[0].question === "orphaned");
  check("an orphaned group is not dismissed", groups[0].dismissedAt === null);
}

// ── 2. Dismissal, and the boundary ───────────────────────────────────
console.log("\n--- dismissal ---");
{
  const dismissedAt = "2026-10-10T00:00:00.000Z";
  const base = () => [
    ask({ id: "d", groupId: "d", questionShort: "do you take insurance?", dismissedAt }),
  ];

  check("a dismissed group is hidden", activeGroups(base()).length === 0);

  // The off-by-one. One under the bar stays hidden; exactly the bar
  // brings it back. Both directions, because a rule that is only tested
  // on the passing side is a rule that fires one ask early forever.
  const after = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      ask({ groupId: "d", askedAt: `2026-10-${11 + i}T00:00:00.000Z` })
    );

  for (let n = 0; n < ASKS_TO_UNDISMISS; n++) {
    check(
      `${n} ask(s) after dismissal: still hidden`,
      activeGroups([...base(), ...after(n)]).length === 0
    );
  }
  const atBar = activeGroups([...base(), ...after(ASKS_TO_UNDISMISS)]);
  check(`${ASKS_TO_UNDISMISS} asks after dismissal: back`, atBar.length === 1);
  check("and flagged as returned", atBar[0]?.returned === true);
  check(
    "the count includes the asks from before it was dismissed",
    atBar[0]?.count === 1 + ASKS_TO_UNDISMISS,
    String(atBar[0]?.count)
  );

  // Asks that arrived BEFORE the dismissal must not count. Otherwise a
  // long-standing question comes straight back the moment it is hidden,
  // which makes Dismiss look broken.
  const before = [
    ask({ groupId: "d", askedAt: "2026-10-01T00:00:00.000Z" }),
    ask({ groupId: "d", askedAt: "2026-10-02T00:00:00.000Z" }),
    ask({ groupId: "d", askedAt: "2026-10-03T00:00:00.000Z" }),
    ask({ groupId: "d", askedAt: "2026-10-04T00:00:00.000Z" }),
  ];
  check(
    "asks from before the dismissal do not bring it back",
    activeGroups([...base(), ...before]).length === 0
  );

  // The dismissal timestamp equals an ask's timestamp. A non-strict
  // comparison would count the dismissal moment itself as a new ask.
  check(
    "an ask at exactly the dismissal instant does not count",
    activeGroups([
      ...base(),
      ask({ groupId: "d", askedAt: dismissedAt }),
      ask({ groupId: "d", askedAt: dismissedAt }),
      ask({ groupId: "d", askedAt: dismissedAt }),
    ]).length === 0
  );
}

// ── 3. Which group an ask joins ──────────────────────────────────────
console.log("\n--- group assignment ---");
{
  // Constructed vectors rather than real embeddings: this tests the
  // SELECTION rule, not the threshold. Two dimensions are enough, and
  // the cosine of each pair is arithmetic anyone can check.
  const identical = [1, 0];
  const close = [0.95, 0.312]; // cosine ~0.95 with [1,0]
  const far = [0, 1]; // cosine 0

  check(
    "an ask with no embedding starts its own group",
    groupForAsk(null, [{ groupId: "x", embedding: identical }]) === null
  );
  check(
    "no existing groups means a new group",
    groupForAsk(identical, []) === null
  );
  check(
    "a close ask joins",
    groupForAsk(close, [{ groupId: "x", embedding: identical }]) === "x"
  );
  check(
    "an unrelated ask does not join",
    groupForAsk(far, [{ groupId: "x", embedding: identical }]) === null
  );
  check(
    "a group with no canonical embedding is skipped, not matched",
    groupForAsk(identical, [{ groupId: "x", embedding: null }]) === null
  );

  // The best match wins, not the first one scanned. Otherwise the
  // group an ask lands in depends on row order.
  const best = groupForAsk(identical, [
    { groupId: "nearly", embedding: close },
    { groupId: "exactly", embedding: identical },
  ]);
  check("the closest group wins, whatever the order", best === "exactly", String(best));

  check(
    `the threshold is a measurement, documented (${SAME_QUESTION_SIMILARITY})`,
    SAME_QUESTION_SIMILARITY > 0.5 && SAME_QUESTION_SIMILARITY < 1
  );
}

// ── 4. The short version's checks ────────────────────────────────────
console.log("\n--- the short version is checked, not trusted ---");
{
  const rejects = (text: string) => checkShortQuestion(text).ok === false;

  check("a plain question passes", checkShortQuestion("is the hotel included?").ok === true);
  check("an Arabic question passes", checkShortQuestion("هل الفندق مشمول؟").ok === true);
  check("empty is rejected", rejects(""));
  check("whitespace only is rejected", rejects("   \n  "));
  check("two lines is rejected", rejects("is the hotel included?\nand the flight?"));
  check("over the length cap is rejected", rejects("a".repeat(SHORT_MAX_LENGTH + 1)));
  check("exactly at the cap passes", checkShortQuestion("a".repeat(SHORT_MAX_LENGTH)).ok === true);

  // The PII checks. These are the ones that matter: this text is
  // stored, embedded, grouped, counted and rendered.
  check("a phone number is rejected", rejects("call me on +90 532 111 2233?"));
  check("an email is rejected", rejects("email me at someone@example.com?"));
  check("a long digit run is rejected", rejects("is my booking 884213 confirmed?"));

  // A short number is fine — "is 2 visits enough?" is a question, not a
  // detail about the person asking.
  check("a small number is kept", checkShortQuestion("is 2 visits enough?").ok === true);
  check("a price in the question is kept", checkShortQuestion("do you do it for 500?").ok === true);
}

// ── 5. Starters ──────────────────────────────────────────────────────
console.log("\n--- starter suggestions ---");
{
  check(
    `there are at most ${MAX_STARTERS}`,
    remainingStarters([], 0).length <= MAX_STARTERS,
    String(remainingStarters([], 0).length)
  );
  check("all four show on a brand-new tenant", remainingStarters([], 0).length === 4);
  check(
    "an answered starter disappears",
    remainingStarters(["starter_price"], 0).length === 3
  );
  check(
    "one real captured question removes all of them",
    remainingStarters([], 1).length === 0
  );
  check(
    "an unrelated question_key does not count as answering one",
    remainingStarters(["some_other_key"], 0).length === 4
  );
  check(
    "a dismissed starter disappears",
    remainingStarters([], 0, ["starter_guarantee"]).every((s) => s.key !== "starter_guarantee") &&
      remainingStarters([], 0, ["starter_guarantee"]).length === 3
  );
  check(
    "an unknown dismissed key hides nothing",
    remainingStarters([], 0, ["anything", ""]).length === 4
  );
  check(
    "answered and dismissed together can empty the list",
    remainingStarters(["starter_price", "starter_included"], 0, [
      "starter_duration",
      "starter_guarantee",
    ]).length === 0
  );
  check(
    "only real starter keys pass the dismiss guard",
    isStarterKey("starter_price") && !isStarterKey("is_test") && !isStarterKey(1)
  );
  // The business form writes the whole parsed object back. A parser that
  // dropped this key would undo every dismissal on the next brand save.
  check(
    "dismissed starters survive a settings round-trip",
    JSON.stringify(
      parseTenantSettings(parseTenantSettings({ dismissed_starters: ["starter_price"] }))
        .dismissed_starters
    ) === JSON.stringify(["starter_price"])
  );
  check(
    "every starter has a distinct key",
    new Set(STARTER_QUESTIONS.map((s) => s.key)).size === STARTER_QUESTIONS.length
  );
  check(
    "every starter has a title to prefill",
    STARTER_QUESTIONS.every((s) => s.title.trim().length > 0)
  );
}

console.log(bad === 0 ? "\nAll checks passed." : `\n${bad} FAILED`);
process.exit(bad === 0 ? 0 : 1);
