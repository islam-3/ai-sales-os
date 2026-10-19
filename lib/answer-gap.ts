// Did the knowledge base actually answer what the visitor asked?
//
// Runs AFTER the reply has been sent, so a visitor never waits on it.
// It never sees the reply — only the question and the material the
// business wrote. "The assistant sounded unsure" is not evidence; "no
// entry contains this" is.
//
// ── Why not similarity ──────────────────────────────────────────────
// That was measured first and rejected: docs/answerability-detection.txt.
// Cosine similarity against the stored entries overlapped in all four
// languages, with no usable bar globally or per language, because
// similarity measures TOPIC and not whether the answer is present.
// "How much do dental implants cost?" scores 0.520 against a knowledge
// base full of implant entries, none of which carries a price.
//
// ── Evidence, not a verdict ─────────────────────────────────────────
// The judge is asked to NAME the entry that answers the question, and
// the boolean is computed here from whether the name it gave is real.
// Asking a model for a boolean alongside its reasoning produced answers
// where the two disagreed — the dialect judge listed the markers,
// explained them, and then set its own flag to false. A claim that has
// to point at a titled entry cannot be vague.
//
// ── Which way it fails ──────────────────────────────────────────────
// Toward "answered", always. A missed gap costs a dashboard row nobody
// sees. A false gap tells an owner to re-add their own warranty, which
// is exactly what made the previous design unusable, so anything
// uncertain is treated as answered.

import type Anthropic from "@anthropic-ai/sdk";

// Sonnet, chosen by measurement rather than by cost.
//
// On the tune split Haiku reached 100% recall and caught every partially
// answered question — but produced three FALSE gaps, each one telling an
// owner to rewrite something already written. It would not accept that a
// customer's everyday word for a part is the business's technical name
// for it, even while saying in its own note that it could see the brand.
//
// Sonnet produced zero false gaps in all four languages, on both splits.
// Same trade this codebase already made for lead extraction, for the
// same reason: the cheaper model followed the harder instruction some of
// the time, and some of the time is not a feature.
export const ANSWER_GAP_MODEL = process.env.ANSWER_GAP_MODEL ?? "claude-sonnet-4-6";

/**
 * The most rows one conversation may put on an owner's dashboard.
 *
 * Set from measurement, not from a guess: the six smoke-test
 * conversations average 2.0 question-bearing turns each, so 4 is double
 * what real traffic does, and every conversation of ordinary length runs
 * under it without noticing. See scripts/measure-answer-gap-cost.ts.
 *
 * Dropping the fifth gap costs a dashboard row nobody is waiting for.
 */
export const MAX_CAPTURED_ROWS_PER_CONVERSATION = 4;

/**
 * The most judge calls one conversation may ever make.
 *
 * ── Why this is separate from the row cap, and why it exists ────────
 * It used to BE the row cap: one constant, named for judge calls,
 * enforced by counting captured rows. So a question the business can
 * answer cost a judge call and counted toward nothing, and a
 * conversation of twenty answered questions made twenty judge calls
 * under a "cap" of four. Measured on 2026-10-17 against production: one
 * nine-turn session made EIGHT judge calls, and a perfectly held row cap
 * would still have made seven.
 *
 * Each call is a whole knowledge base of input, so that was not a
 * ceiling, it was a floor with a ceiling's name.
 *
 * Capping rows alone cannot fix it without costing recall: that same
 * session asked three answerable questions BEFORE its four real gaps, so
 * a four-judge-call limit would have captured one of them instead of
 * four. Hence two bounds. Four rows keeps recall where it was; eight
 * judge calls puts a ceiling on the bill — $0.0368 added in the worst
 * case against a 7.59c conversation, which is the figure in README.md.
 *
 * Both are enforced in Postgres, by reserve_capture_slot, because a cap
 * read in the application is a cap that two in-flight captures can both
 * pass.
 */
export const MAX_JUDGE_CALLS_PER_CONVERSATION = 8;

export type KnowledgeForJudge = { title: string; content: string };

export type AnswerGapVerdict = {
  /** False means the business has no answer for this and should add one. */
  answered: boolean;
  /** The entry the judge pointed at, when it named a real one. */
  entryTitle: string | null;
  /** For the log. */
  note: string;
  /** True when the judge could not be reached. Never counted either way. */
  failed?: true;
  /** Token usage, so cost is measured rather than estimated. */
  usage?: { input: number; output: number; cacheWrite: number; cacheRead: number };
};

export const ANSWER_GAP_PROMPT = `You are checking whether a business's own written material contains the answer to something a customer asked.

You are given the CUSTOMER'S QUESTION and a numbered list of everything the business has written.

Reply with ONLY this JSON object, no other text:
{"entry": <number or null>, "note": "..."}

entry — the number of the ONE item that answers the question. null if nothing does.
note — one short sentence saying why.

How to decide:

An item answers the question when a person reading that item would come away knowing the answer. Being about the same SUBJECT is not enough. Material about a treatment does not answer what it costs; material about what a guarantee covers does not answer what happens when something fails; material naming a hotel does not answer how many nights. If the customer would still have to ask, the answer is not there — use null.

An item answers the question even when it is worded completely differently, uses other terms for the same thing, or is written in a different language from the question. Judge the meaning, never the wording, and never the language. Material in English answers a question asked in Arabic if the facts are in it.

Customers describe things in everyday words that a business names technically, and the other way round. A question about a part, a device, a material, a symptom or a procedure in plain language is answered by material that names the same thing in professional terms — and the reverse. Before you answer null, go back through the list once and ask of each item: is this the same thing under another name? The customer does not know the business's vocabulary and should not have to.

A question asking WHETHER the business does, treats, offers, performs or can handle something is answered by any item showing that it does — including an item that merely describes that work, in any language.

If an item answers it only in part, use null. Partly answered is not answered — the customer did not get what they asked for.

Three shapes of question that material often looks like it answers and does not. Establishing that a thing EXISTS is not answering a question about it:
  • asked what HAPPENS in a situation, or what is DONE about it, or who bears the cost — material stating what is covered, guaranteed or included does not answer that;
  • asked HOW MUCH, HOW MANY, HOW LONG or WHEN — material saying the thing is provided does not answer that;
  • asked whether something is INSIDE the price — material mentioning the thing as part of the work does not answer that.
In each case the customer would still have to ask. Use null.

When you genuinely cannot tell, name the closest item that does answer it rather than null. A wrong null tells this business to write something it has already written.`;

function firstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("no JSON object in response");
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("unbalanced JSON object in response");
}

/**
 * Judges one question against everything the business has written.
 *
 * The whole knowledge base, deliberately, rather than whatever the reply
 * happened to be given. Retrieval is off today, so those are the same
 * thing — but when it returns, a question answered by an entry that
 * retrieval MISSED is our problem and not the owner's, and it must never
 * reach their dashboard as a gap. Judging against everything is what
 * keeps that distinction available.
 */
export async function judgeAnswerGap(
  client: Anthropic,
  question: string,
  knowledge: KnowledgeForJudge[],
  model = ANSWER_GAP_MODEL
): Promise<AnswerGapVerdict> {
  // Nothing written at all: every question is a gap, and no model call
  // is needed to know it.
  const usable = knowledge.filter((k) => k.content.trim());
  if (usable.length === 0) {
    return { answered: false, entryTitle: null, note: "the business has written nothing yet" };
  }

  const listing = usable
    .map((k, i) => `${i + 1}. ${k.title.trim() || "(untitled)"}\n${k.content.trim()}`)
    .join("\n\n");

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 300,
      // ── The knowledge base is the cached prefix ──────────────────
      // It is byte-identical on every judge call for a tenant and it is
      // almost all of the input — the question is one sentence. So the
      // instructions and the listing sit in the system block behind a
      // cache breakpoint, and only the question varies.
      //
      // Order is the whole trick: anything that changes has to come
      // AFTER everything cached, or the prefix differs and nothing is
      // reused. The question used to be appended to the listing in the
      // same message, which would have made every call a cache miss.
      system: [
        { type: "text" as const, text: ANSWER_GAP_PROMPT },
        {
          type: "text" as const,
          text: `WHAT THE BUSINESS HAS WRITTEN:\n${listing}`,
          cache_control: { type: "ephemeral" as const },
        },
      ],
      messages: [{ role: "user", content: `CUSTOMER'S QUESTION:\n${question}` }],
    });
    const block = res.content.find((b) => b.type === "text");
    const parsed = JSON.parse(firstJsonObject(block?.type === "text" ? block.text : "")) as {
      entry?: unknown;
      note?: unknown;
    };

    // The verdict is DERIVED: a claim counts only when it points at an
    // item that exists. A number outside the list is treated as no
    // answer named rather than as a pass, because a judge inventing an
    // index is a judge that was guessing.
    const index = typeof parsed.entry === "number" ? Math.trunc(parsed.entry) : null;
    const valid = index !== null && index >= 1 && index <= usable.length;

    return {
      answered: valid,
      entryTitle: valid ? usable[index - 1].title : null,
      note: typeof parsed.note === "string" ? parsed.note : "",
      usage: {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
      },
    };
  } catch (error) {
    // Unreachable is not a gap. Reporting one here would put a row in an
    // owner's dashboard because our own call failed.
    return {
      answered: true,
      entryTitle: null,
      note: String((error as Error).message).slice(0, 120),
      failed: true,
    };
  }
}
