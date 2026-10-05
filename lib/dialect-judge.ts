// Did a reply use a regional variety the visitor had not?
//
// A measurement, not a runtime control — nothing on the reply path calls
// this. It lives in lib/ rather than scripts/ so the harness that reports
// a rate and the test that validates the judge share one prompt, and a
// change to the prompt cannot pass the test while the harness keeps using
// an older copy.
//
// ── Why this needed a second attempt ─────────────────────────────────
// The first version asked, in effect, "does this contain a regional
// marker?" and listed some examples. It passed five blatant samples and
// was then turned loose on real Arabic replies, where it flagged "سنة"
// (the ordinary word for "year") and "بإمكانك" ("you can", plain Modern
// Standard Arabic). It reported dialect drift RISING from 3/20 to 5/20
// after a change that could not have caused that.
//
// The fix is to make the judge name the variety it thinks it has found,
// and to require that the marker be unusable in the stated variety —
// which is the actual claim — rather than merely informal or
// conversational. A judge asked a vague question gives a vague answer and
// the vagueness arrives as a number.

import type Anthropic from "@anthropic-ai/sdk";

export const DIALECT_JUDGE_PROMPT = `You are checking whether a business's chat assistant wrote in the same regional variety of a language as its visitor.

You are given the VARIETY the visitor wrote in, and one REPLY the assistant sent.

Your job is to list EVIDENCE, not to reach a verdict. Reply with ONLY this JSON object, no other text:
{"markers": ["..."], "other_variety": "...", "note": "..."}

markers — every word or phrase in the reply that belongs to a DIFFERENT REGIONAL VARIETY and would NOT be used by a careful writer of the stated one. Leave it EMPTY if there are none.

The test for a marker is strict, and it is this: could a careful writer of the stated variety have written this exact wording? If yes, it is not a marker — however warm, informal or conversational it is.

other_variety — the variety the markers belong to, named ("Levantine Arabic", "Egyptian Arabic", "Latin American Spanish", "American English"). Empty string only when markers is empty. If you list markers you MUST name the variety; if you cannot name one, the markers were not markers, so leave both empty.
note — one short sentence. Say "matches" when markers is empty.

These are NOT markers, and listing them is the main mistake to avoid:
  • informality, warmth, contractions, or a conversational tone
  • ordinary vocabulary that exists in every variety of the language
  • brand names, place names, medical or technical terms
  • politeness formulas and greetings
  • a question phrased casually

For Arabic specifically: Modern Standard Arabic covers a very wide register, from formal writing to plain conversational prose. Words like بإمكانك، يمكنك، سنة، لما، تأخذ، هل، الآن، نحن are ordinary Modern Standard Arabic and are NEVER markers. Genuine markers are forms that do not exist in Modern Standard Arabic at all: هلق، شو، بدي، منعمل، بنتصل، ما بتوصل، رح، وش، أبشر، نسوي، ايوه، عايز، كده، امتى، دلوقتي، هنحجز.

If you are unsure about a word, leave it out. An empty markers list is the right answer for most replies.`;

export type DialectVerdict = {
  introduced: boolean;
  otherVariety: string;
  markers: string[];
  note: string;
  /** True when the judge could not be reached. Never counted either way. */
  failed?: true;
};

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
 * Judges one reply.
 *
 * A judge that cannot be reached returns failed, never a pass. A silent
 * judge turning every run green is the worst thing a measurement can do,
 * and this project has already shipped one check that did exactly that.
 */
export async function judgeDialect(
  client: Anthropic,
  variety: string,
  reply: string,
  model = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6"
): Promise<DialectVerdict> {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 500,
      system: DIALECT_JUDGE_PROMPT,
      messages: [{ role: "user", content: `VISITOR'S VARIETY: ${variety}\n\nREPLY:\n${reply}` }],
    });
    const block = res.content.find((b) => b.type === "text");
    const parsed = JSON.parse(firstJsonObject(block?.type === "text" ? block.text : "")) as {
      other_variety?: string;
      markers?: string[];
      note?: string;
    };

    // The VERDICT is derived here, not asked for.
    //
    // Asking for a boolean as well as the evidence produced answers where
    // the two disagreed: on a Latin American Spanish reply the judge
    // listed "agendar" and "acá", explained in its note that both are
    // Latin American and that peninsular Spanish would use "concertar"
    // and "aquí" — and still set its own boolean to false. Evidence plus
    // a named variety IS the finding, so the boolean is computed from
    // them and cannot contradict them.
    const named = (parsed.other_variety ?? "").trim();
    const markers = (parsed.markers ?? []).filter((m) => typeof m === "string" && m.trim());
    const introduced = markers.length > 0 && named.length > 0;

    return {
      introduced,
      otherVariety: named,
      markers,
      note: parsed.note ?? "",
    };
  } catch (error) {
    return {
      introduced: false,
      otherVariety: "",
      markers: [],
      note: String((error as Error).message).slice(0, 120),
      failed: true,
    };
  }
}
