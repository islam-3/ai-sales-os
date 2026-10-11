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

export const ANSWER_GAP_MODEL = process.env.ANSWER_GAP_MODEL ?? "claude-haiku-4-5-20251001";

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

A question asking WHETHER the business does something at all is answered by any item showing that it does.

If an item answers it only in part, use null. Partly answered is not answered — the customer did not get what they asked for.

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
      system: ANSWER_GAP_PROMPT,
      messages: [
        { role: "user", content: `CUSTOMER'S QUESTION:\n${question}\n\nWHAT THE BUSINESS HAS WRITTEN:\n${listing}` },
      ],
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
