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

const PROMPT = `You are reading what a VISITOR has said to a business's chat, to work out which practical details they have already given. Do not infer from what the business said — only from the visitor's own words.

Reply with ONLY this JSON object, no other text:
{"dates": bool, "duration": bool, "origin": bool, "health": bool}

dates — they have said WHEN they could come: a month, a season, a date, "next spring", "after Ramadan". Not just that they want to come soon.
duration — they have said HOW LONG they can stay: a number of days or weeks.
origin — they have said WHERE they are travelling from: a city or country.
health — they have said something about their medical situation: a condition, medication, or that they have none.

The messages may be in any language. Judge what they have told you, not which words they used.`;

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
  visitorMessages: string[]
): Promise<AnsweredDimensions | null> {
  const text = visitorMessages.filter((m) => m.trim()).join("\n");
  if (!text) return null;

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
