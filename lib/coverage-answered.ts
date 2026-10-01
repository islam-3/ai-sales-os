// Which pre-close questions has the visitor already answered?
//
// The other half of coverage. Relevance — does this business need travel
// dates at all — is a property of the tenant and is derived from its own
// knowledge base (lib/coverage-relevance.ts). This half is about what
// THIS person has said, and no property of the clinic can answer it.
//
// It was English regexes, and measured on the identical case in six
// languages with the visitor answering dates, duration and origin in
// each, only English noticed:
//
//     English   asked again: 0
//     Arabic    asked again: 2   [dates, duration]
//     Russian   asked again: 2   [dates, duration]
//     Chinese   asked again: 2   [dates, duration]
//     Turkish   asked again: 2   [dates, duration]
//     Spanish   asked again: 2   [dates, duration]
//
// Being asked for your travel dates immediately after giving them is the
// kind of thing that makes a visitor stop believing they are talking to
// anything that is listening.
//
// ── Why a model call here is affordable ──────────────────────────────
// Coverage is only assessed when a conversation is NEARING A CLOSE and
// the visitor is not hesitating, which is a small fraction of turns. It
// is not on the path of every reply, unlike lib/visitor-signals.ts.

import { anthropic } from "./anthropic";

export type AnsweredDimensions = Set<string>;

const MODEL = "claude-haiku-4-5-20251001";

/** Generous: this runs rarely, and a wrong answer repeats a question. */
export const ANSWERED_BUDGET_MS = Number(process.env.ANSWERED_BUDGET_MS ?? 2500);

const PROMPT = `You are reading a conversation between a VISITOR and a business's assistant, to work out which practical details have already been settled.

Reply with ONLY this JSON object, no other text:
{"dates": bool, "duration": bool, "origin": bool, "health": bool, "photos": bool, "photos_requested": bool}

Judge these FROM THE VISITOR'S OWN WORDS ONLY. Do not infer them from what the assistant said:
dates — they have said WHEN they could come: a month, a season, a date, "next spring", "after Ramadan". Not just that they want to come soon.
duration — they have said HOW LONG they can stay: a number of days or weeks.
origin — they have said WHERE they are travelling from: a city or country.
health — they have said something about their medical situation: a condition, medication, or that they have none.
photos — they have ANSWERED about sending pictures or scans of their own case, in any way: they have sent one, said they will send one, said they do not have one, or said no. A refusal counts. Only false if the subject has not been settled by them at all.

Judge this one FROM THE ASSISTANT'S words:
photos_requested — the assistant has already asked the visitor to send a picture, photo, X-ray or scan of their own case. True if it has been asked even once, however gently.

The conversation may be in any language. Judge what was said, not which words were used.`;

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

let warned = false;

/**
 * What the visitor has already told us, or null if we could not ask.
 *
 * NULL is deliberately distinct from an empty set. Null means "fall back
 * to the old word matching", which is what happens on any failure and
 * leaves behaviour exactly as it was. An empty set means "they have told
 * us nothing", which is an answer.
 */
export async function readAnsweredDimensions(
  visitorMessages: string[],
  assistantMessages: string[] = []
): Promise<AnsweredDimensions | null> {
  const visitor = visitorMessages.filter((m) => m.trim());
  if (visitor.length === 0) return null;

  // Labelled by speaker, because one key is judged from each side and a
  // flat join would make "I'll send a photo" indistinguishable from the
  // assistant asking for one.
  const text = [
    ...visitor.map((m) => `VISITOR: ${m}`),
    ...assistantMessages.filter((m) => m.trim()).map((m) => `ASSISTANT: ${m}`),
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANSWERED_BUDGET_MS);

  try {
    const res = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 150,
        system: PROMPT,
        messages: [{ role: "user", content: text }],
      },
      { signal: controller.signal }
    );
    const block = res.content.find((b) => b.type === "text");
    const parsed = JSON.parse(
      firstJsonObject(block?.type === "text" ? block.text : "")
    ) as Record<string, unknown>;

    const answered = new Set<string>();
    for (const id of ["dates", "duration", "origin", "health"]) {
      if (parsed[id] === true) answered.add(id);
    }

    // Photos is the one dimension that is satisfied by ASKING, not only
    // by answering. The others are facts the team needs and will keep
    // needing, so a visitor who dodges the question should be asked
    // again. A request to see someone's case is different: asked twice
    // it reads as pressure, and a visitor who does not want to send a
    // picture has given their answer by not sending one.
    //
    // So "already asked" and "already answered" collapse to the same
    // thing here - not a gap - and the close is never held up by it.
    if (parsed.photos === true || parsed.photos_requested === true) {
      answered.add("photos");
    }

    return answered;
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn(
        "[coverage] could not read what was answered, falling back:",
        String((error as Error)?.message).slice(0, 120)
      );
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
