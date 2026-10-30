// Turning a customer's question into one line the team can read.
//
// Two jobs, and the second is the one that matters:
//
//   1. the team's language, so a dashboard list is readable at a glance
//      rather than a mix of four scripts;
//   2. no personal detail, because this line is what gets stored,
//      embedded, grouped, counted and shown. A name or a diagnosis that
//      reaches it reaches all of those.
//
// The customer's own words are kept, untranslated, in question_raw, and
// the dashboard links to the conversation. Nothing is lost by stripping
// this copy — the owner is one click from the original.
//
// ── Why a model, and what guards it ─────────────────────────────────
// Stripping personal detail by pattern would need a pattern per kind of
// detail per language, and the interesting cases are not patterns: "my
// husband had the same operation in Beirut last year" has no digits, no
// capitalised name in Arabic, and no email. A model reads the meaning.
//
// But a model asked to remove things sometimes removes the question
// instead, so the output is checked in code rather than trusted:
// anything that comes back empty, over-long, or still carrying a digit
// run or an address marker is rejected and the ask is stored with a
// flagged fallback. See shortenAndMatch below.

import type Anthropic from "@anthropic-ai/sdk";

/** Same model as the judge, for the same reason: this text is shown to owners. */
export const SHORTEN_MODEL = process.env.SHORTEN_MODEL ?? "claude-sonnet-4-6";

/**
 * A question is a question. Anything much longer than this came back as
 * a paraphrase of the whole conversation, which is not what was asked
 * for and would be the part most likely to carry detail.
 */
export const SHORT_MAX_LENGTH = 120;

export const SHORTEN_PROMPT = `You rewrite a customer's question as one short line for a business's internal dashboard.

Write ONLY the rewritten question. No quotes, no preamble, no explanation.

Rules:

1. Write it in the language you are told to write it in, whatever language the customer used.

2. Keep ONLY the question. Everything the customer said about themselves goes: their name, anyone else's name, their age, their job, their city or country, their medical history, their family, their travel dates, their budget, how they found the business. If removing a detail changes what is being asked, keep what is being asked and drop the detail — "my husband and I fly in on the 3rd, is the hotel included?" becomes "is the hotel included in the price?".

3. Keep what the question is ABOUT. A question about implants stays about implants. Do not generalise it into "a question about pricing".

4. One line, as short as it can be while still being a complete question. Under 100 characters.

5. If the customer asked more than one thing, take the first.

6. Write it the way a customer would ask it, not the way a business would file it. "how much do implants cost?" not "pricing enquiry — dental implants".`;

/** A digit run long enough to be a phone number, an age plus a year, or a date. */
const DIGIT_RUN = /\d{4,}/;

/** Markers of a contact detail or an address surviving into the short line. */
const CONTACT_MARKER = /@[\w.-]+\.\w{2,}|\+\d[\d\s().-]{5,}/;

export type ShortQuestion = {
  /** The line to store, show, embed and group on. */
  text: string;
  /**
   * True when the model's output failed a check and `text` is a
   * fallback. Worth logging: a run of these means the prompt or the
   * model changed under us.
   */
  rejected?: true;
  /** Why it was rejected, for the log. */
  reason?: string;
  usage?: { input: number; output: number };
};

/**
 * Checks the model's line before anything stores it.
 *
 * Every rule here is about what the line must NOT contain, and each one
 * is checkable in code. "Did it strip the name" is not — that is why
 * the raw version stays and the dashboard links to the transcript.
 */
export function checkShortQuestion(text: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > SHORT_MAX_LENGTH) {
    return { ok: false, reason: `${trimmed.length} characters, over ${SHORT_MAX_LENGTH}` };
  }
  // A newline means more than one line came back, which means it is not
  // the one question that was asked for.
  if (/\r?\n/.test(trimmed)) return { ok: false, reason: "more than one line" };
  if (DIGIT_RUN.test(trimmed)) return { ok: false, reason: "contains a long digit run" };
  if (CONTACT_MARKER.test(trimmed)) return { ok: false, reason: "contains a contact detail" };
  return { ok: true };
}

// ── Shortening and grouping in one call ─────────────────────────────
// Validated by scripts/measure-question-match.ts before it was wired:
// 41 cases x 3 runs against ten groups, zero wrong merges
// (docs/question-match-2026-10-30.txt). It replaced a shortening-only
// call; the capture path shows it at most MATCH_CANDIDATES groups.
//
// Embedding similarity under-merged by design (0.75, see
// unanswered-questions.ts): "what are the steps of the entire process?"
// and "what are the detailed steps of the treatment?" are two lines on
// test-clinic. This hands the shortening call the tenant's existing
// group titles and asks it to name the one this question belongs to, or
// none — no extra call, a few hundred more input tokens.
//
// A wrong merge hides a question for good; a wrong split shows it twice.
// So the prompt asks for a match only when one answer would fully serve
// both, and the code treats anything it cannot read as "new".

export const MATCH_PROMPT = `${SHORTEN_PROMPT}

You are also given the questions already on the dashboard, each with an id. Decide whether the customer's question is the SAME question as one of them.

It is the same only if one written answer would fully answer both, with nothing left over. Same topic is not enough:
- "how much is a root canal?" is not "do you do root canals?"
- "is breakfast included at the hotel?" is not "is the hotel included in the price?"
- "how many visits will I need?" is not "how long does the treatment take?"
If you are unsure, it is new. Showing a question twice is a small cost; hiding a question inside another one is a large one.

Reply with exactly two lines and nothing else:
QUESTION: <the rewritten question>
MATCH: <an id from the list, or new>`;

export type MatchedQuestion = ShortQuestion & {
  /** The existing group this belongs to, or null for a new group. */
  groupId: string | null;
  /** The model's raw MATCH value, for measurement logs. */
  matchRaw?: string;
};

/**
 * Shortens a question and picks its group in the same call.
 *
 * Never throws. The group ids shown to the model are positional (g1,
 * g2, …) and mapped back here, so a model that garbles a uuid cannot
 * land a question in a group nobody chose. An id not in the list, or a
 * reply that cannot be read, is "new": the failure direction is a
 * duplicate line, never a hidden one.
 */
export async function shortenAndMatch(
  client: Anthropic,
  question: string,
  teamLanguage: string,
  groups: { id: string; title: string }[],
  model = SHORTEN_MODEL
): Promise<MatchedQuestion> {
  const list =
    groups.length === 0
      ? "(none yet)"
      : groups.map((g, i) => `g${i + 1}: ${g.title}`).join("\n");

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 200,
      system: `${MATCH_PROMPT}\n\nWrite it in: ${teamLanguage}`,
      messages: [
        {
          role: "user",
          content: `Questions already on the dashboard:\n${list}\n\nCustomer's question:\n${question}`,
        },
      ],
    });

    const block = res.content.find((b) => b.type === "text");
    const raw = block?.type === "text" ? block.text.trim() : "";
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };

    const questionLine = raw.match(/^QUESTION:\s*(.+)$/m)?.[1] ?? "";
    const matchRaw = raw.match(/^MATCH:\s*(\S+)/m)?.[1]?.toLowerCase() ?? "";
    const index = /^g(\d+)$/.exec(matchRaw)?.[1];
    const group = index ? groups[Number(index) - 1] : undefined;

    const text = questionLine.replace(/^["'«“]|["'»”]$/g, "").trim();
    const check = checkShortQuestion(text);
    if (!check.ok) {
      return {
        text: "A question we could not summarise — open the conversation",
        rejected: true,
        reason: check.reason,
        usage,
        groupId: null,
        matchRaw,
      };
    }
    return { text, usage, groupId: group?.id ?? null, matchRaw };
  } catch (error) {
    return {
      text: "A question we could not summarise — open the conversation",
      rejected: true,
      reason: String((error as Error).message).slice(0, 120),
      groupId: null,
    };
  }
}
