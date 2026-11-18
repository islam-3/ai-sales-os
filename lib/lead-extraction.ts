// Reading a lead out of a conversation: what the model is sent, and how.
//
// ── Every turn, cached ──────────────────────────────────────────────
// Extraction used to run on turns 1, 2, every third turn, and any turn
// that looked like contact details. A conversation that ended on a
// skipped turn lost whatever that turn said, and "looked like contact
// details" was a regex that missed a name on its own, a local number in
// groups ("0532 111 22 33") and any number in Arabic-Indic digits. 4 of
// the last 10 real conversations ended on a skipped turn.
//
// Now it runs on every visitor turn, and prompt caching pays for it. The
// transcript goes as ONE CONTENT BLOCK PER TURN with a cache breakpoint on
// the last block, so each call reads the previous call's prefix (system
// prompt + every earlier turn) at 0.1x and pays full price only for the
// newest exchange. That only works if the prefix is byte-identical from
// one call to the next, which is what the rules below protect:
//
//   - a block's text depends only on its own turn, never on its position
//     (no separator that the last block lacks and an earlier one has);
//   - the greeting is in the transcript from turn 1, as it is in the
//     stored history from turn 2 on. It used to be missing on turn 1, which
//     changed the first block between turns 1 and 2 and would have made
//     every turn-2 call a cache miss;
//   - stored rows are written with distinct timestamps (see the insert in
//     app/api/chat/route.ts), so history comes back in the same order on
//     every read.

import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type { TokenCounts } from "./ai-pricing";
import { buildLeadExtractionPrompt } from "./lead-language";
import { normaliseDigits } from "./phone-number";
import { openAIUsageToTokens } from "./reply-openai";

/**
 * Sonnet, not Haiku: writing the lead in the TEAM's language is what
 * moved it back. Haiku followed the language instruction on 2 of 4 runs
 * one way and 3 of 4 the other; Sonnet was 4 of 4 on the harder
 * direction, and no prompt wording fixed Haiku.
 */
export const LEAD_EXTRACTION_MODEL = "claude-sonnet-4-6";

/**
 * The output limit for one extraction, on every provider.
 *
 * Was 512, and a lead for a Turkish-reading team was cut off at exactly
 * 512 tokens, mid-key, so the JSON did not parse and the route saved
 * nothing (docs/extraction-truncation-2026-11-17.md). An English team
 * took 288-321 tokens; a Turkish one 399 and 512+. 1024 is about twice
 * the largest seen. Billed per token generated, so the room costs nothing
 * unless it is used. A response that still reaches it is logged as a
 * cut-off in the route, not as an ordinary parse failure.
 */
export const LEAD_EXTRACTION_MAX_TOKENS = 1024;

export type ExtractedLead = {
  name: string | null;
  contact_info: string | null;
  age: number | null;
  main_concern: string | null;
  priority: string | null;
  duration_of_issue: string | null;
  timeline: string | null;
  travel_country: string | null;
  notes: string | null;
  visitor_language: string | null;
  ai_summary: string | null;
  qualification_score: number | null;
};

export type TranscriptTurn = { role: string; content: string };

/**
 * The conversation as extraction sees it after this turn.
 *
 * `history` is what was stored before this turn. On the first turn it is
 * empty and the greeting the visitor was shown has not been stored yet,
 * so it is put in front here, exactly as the insert will store it. That
 * keeps the turn-1 transcript a prefix of the turn-2 one.
 */
export function extractionTurns(
  history: TranscriptTurn[],
  greeting: string | null,
  userContent: string,
  reply: string
): TranscriptTurn[] {
  const opening = history.length === 0 && greeting ? [{ role: "assistant", content: greeting }] : [];
  return [
    ...opening,
    ...history.map((row) => ({ role: row.role, content: row.content })),
    { role: "user", content: userContent },
    { role: "assistant", content: reply },
  ];
}

function turnText(turn: TranscriptTurn): string {
  return `${turn.role === "assistant" ? "Assistant" : "User"}: ${turn.content}`;
}

/**
 * One text block per turn, breakpoint on the last.
 *
 * The block text is the same line the single-string transcript used, so
 * the model reads the same words; only where the cache can cut changes.
 */
export function transcriptBlocks(turns: TranscriptTurn[]): Anthropic.TextBlockParam[] {
  return turns.map((turn, i) =>
    i === turns.length - 1
      ? { type: "text", text: turnText(turn), cache_control: { type: "ephemeral" } }
      : { type: "text", text: turnText(turn) }
  );
}

/** The same transcript as one string, for the checks that read it as text. */
export function transcriptText(turns: TranscriptTurn[]): string {
  return turns.map(turnText).join("\n\n");
}

/**
 * contact_info with its digits as ASCII, and nothing else changed.
 *
 * The prompt tells the model to copy contact details exactly as given,
 * and it does: "٠٥٤٤٩٨٧٦٥٤٣" came back as "٠٥٤٤٩٨٧٦٥٤٣". That is right for
 * the transcript and wrong for the field. wa.me links and many dialers
 * take only ASCII digits, and any check written with \d sees no number
 * at all. So the FIELD is normalised here, before anything saves it. The
 * transcript is never touched: it stays the visitor's own words.
 */
export function normaliseContactDigits(extracted: Partial<ExtractedLead>): Partial<ExtractedLead> {
  if (typeof extracted?.contact_info !== "string") return extracted;
  return { ...extracted, contact_info: normaliseDigits(extracted.contact_info) };
}

/**
 * One extraction call. Never throws: a failure comes back as `error`.
 *
 * Kept apart from saving the result so the format can be measured on
 * stored transcripts (scripts/measure-lead-extraction-format.ts) through
 * exactly the request production sends.
 */
export async function callLeadExtraction(
  client: Anthropic,
  language: string,
  turns: TranscriptTurn[]
): Promise<{
  extracted: Partial<ExtractedLead> | null;
  rawText: string;
  usage: Anthropic.Usage | null;
  /** Why the model stopped: "max_tokens" means the JSON was cut off. */
  stopReason?: string | null;
  error?: string;
}> {
  try {
    // No output_config: a short, schema-constrained task with nothing to
    // tune down.
    const response = await client.messages.create({
      model: LEAD_EXTRACTION_MODEL,
      max_tokens: LEAD_EXTRACTION_MAX_TOKENS,
      system: buildLeadExtractionPrompt(language),
      messages: [{ role: "user", content: transcriptBlocks(turns) }],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock?.type === "text" ? textBlock.text : "";
    const jsonText = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    try {
      return { extracted: normaliseContactDigits(JSON.parse(jsonText)), rawText, usage: response.usage, stopReason: response.stop_reason };
    } catch {
      return { extracted: null, rawText, usage: response.usage, stopReason: response.stop_reason, error: "unparseable JSON" };
    }
  } catch (error) {
    return { extracted: null, rawText: "", usage: null, error: String((error as Error).message).slice(0, 200) };
  }
}

// ── The same extraction on OpenAI ────────────────────────────────────
// EXPERIMENT ONLY. Reached through testExtractionModel (lib/test-tenant.ts),
// which returns null on every tenant that is not a test tenant.
//
// What maps to what, so the two providers read the same thing:
//   system prompt          -> instructions, the same buildLeadExtractionPrompt
//   one block per turn     -> one input_text part per turn, the same text
//   cache_control on last  -> nothing: OpenAI's automatic prefix caching.
//                             An explicit prompt_cache_breakpoint on the last
//                             part read the cache 0% of the time in the
//                             2026-11-17 replay (the marker moves every
//                             turn), where the reply, with no marker, read it
//                             on 70/84 calls.
//   "respond ONLY JSON"    -> the same instruction and nothing more, like
//                             Sonnet. NOT json_object: OpenAI rejects it
//                             unless the word "json" is in the INPUT, and
//                             adding it there would change what this model
//                             reads compared with Sonnet. The parser below
//                             handles both the same way.
//   max_tokens             -> max_output_tokens, the same LEAD_EXTRACTION_MAX_TOKENS
//   no thinking            -> reasoning effort "none"
//   contact digits         -> normaliseContactDigits, exactly as above

export type OpenAIExtractionRequest = {
  instructions: string;
  parts: { type: "input_text"; text: string }[];
};

/** The extraction request, as the Responses API takes it. Pure. */
export function toOpenAIExtractionRequest(language: string, turns: TranscriptTurn[]): OpenAIExtractionRequest {
  return {
    instructions: buildLeadExtractionPrompt(language),
    parts: transcriptBlocks(turns).map((b) => ({ type: "input_text" as const, text: b.text })),
  };
}

/**
 * One extraction call on OpenAI. Never throws.
 *
 * Returns our own token columns rather than OpenAI's usage object, so the
 * caller records it exactly like the Anthropic call.
 */
export async function callLeadExtractionOpenAI(
  client: OpenAI,
  model: string,
  language: string,
  turns: TranscriptTurn[],
  cacheKey: string
): Promise<{
  extracted: Partial<ExtractedLead> | null;
  rawText: string;
  tokens: TokenCounts | null;
  /** "max_output_tokens" means the JSON was cut off; otherwise the response status. */
  stopReason?: string | null;
  error?: string;
}> {
  try {
    const request = toOpenAIExtractionRequest(language, turns);
    const response = await client.responses.create({
      model,
      instructions: request.instructions,
      input: [{ role: "user", content: request.parts }],
      max_output_tokens: LEAD_EXTRACTION_MAX_TOKENS,
      reasoning: { effort: "none" },
      prompt_cache_key: cacheKey,
      store: false,
    });
    const rawText = response.output_text ?? "";
    const tokens = response.usage ? openAIUsageToTokens(response.usage) : null;
    const stopReason = response.incomplete_details?.reason ?? response.status ?? null;
    const jsonText = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      return { extracted: normaliseContactDigits(JSON.parse(jsonText)), rawText, tokens, stopReason };
    } catch {
      return { extracted: null, rawText, tokens, stopReason, error: "unparseable JSON" };
    }
  } catch (error) {
    return { extracted: null, rawText: "", tokens: null, error: String((error as Error).message).slice(0, 200) };
  }
}
