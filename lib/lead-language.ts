// What language a lead is written in, and what must survive unchanged.
//
// Two different things are stored about a visitor, and they have opposite
// requirements.
//
// The visitor's own words are EVIDENCE. Tone, urgency, hesitation and
// exact medical wording all carry meaning, and a mistranslated "I have
// diabetes" is a real risk, so the transcript is never translated and
// never rewritten. It stays exactly as they typed it.
//
// Everything the system writes ABOUT them — the summary, the
// qualification details, the notes — exists to be acted on by whoever
// picks the lead up. That has to be in the language the team reads,
// without them translating anything first.
//
// There is deliberately no translation step anywhere. The extraction
// model already writes those fields from the transcript, so it writes
// them in the team's language directly. That makes "same language means
// no translation at all" true by construction rather than by a
// conditional: there is no pass to skip. It is also one model call rather
// than two, and one fewer place for a number to be mangled.

import { languageName } from "./languages";

import type { TenantSettings } from "./tenant-settings";

/**
 * The language leads are written in when the owner has not chosen one.
 *
 * English rather than the business's own language: it is the safest
 * default for a team that has not said otherwise, and it is one setting
 * away from being right.
 */
export const DEFAULT_LEAD_LANGUAGE = "English";

/** The language the team reads leads in. */
export function leadLanguage(settings: TenantSettings): string {
  // A NAME, not a code. This goes into "write the summary in X", and
  // "write it in ar" is not an instruction a model follows reliably.
  return languageName(settings.lead_language) || DEFAULT_LEAD_LANGUAGE;
}

/**
 * What to pre-fill the setting with the first time an owner sees it.
 *
 * A suggestion, not a binding. "Languages spoken" describes who the
 * ASSISTANT can serve; this describes what the TEAM reads, and they are
 * often different — a clinic may answer visitors in three languages while
 * its reps work in one. Reading the first spoken language once saves
 * typing; deriving it on every load would mean reordering that list
 * silently changed the language of every future lead.
 */
export function suggestedLeadLanguage(settings: TenantSettings): string {
  return languageName(settings.languages?.[0]) || DEFAULT_LEAD_LANGUAGE;
}

/**
 * Numbers in generated text that must be traceable to the transcript.
 *
 * Not every number: "two visits" rendered as "2 visits" is a fair
 * rewording, and flagging it would drop good fields for nothing. What
 * matters is the kind of number that causes damage when it shifts — a
 * price, a year, a date, a count of thousands. Those are long or carry a
 * separator, and they are never a re-rendering of an English word.
 */
export function numbersNeedingSupport(text: string): string[] {
  const tokens = text.match(/\d+(?:[.,:/\-]\d+)*/g) ?? [];
  return tokens.filter((token) => {
    const digits = token.replace(/\D/g, "");
    const hasSeparator = /[.,:/\-]/.test(token);
    return digits.length >= 3 || hasSeparator;
  });
}

/**
 * Generated fields with any unsupported number removed.
 *
 * A number in the summary that is nowhere in the transcript is either
 * invented or mangled — "5,000" localised into "5.000" reads as five in
 * the team's language, and a wrong price is worse than a missing one.
 * Comparison is exact on purpose: the prompt says to carry these through
 * unchanged, so anything reformatted is a failure to do that.
 *
 * The field is dropped rather than repaired. Guessing which number was
 * meant is how a wrong one gets stored with confidence, and the
 * transcript remains the record either way.
 */
export function dropUnsupportedNumbers<T extends Record<string, unknown>>(
  fields: T,
  transcript: string
): { fields: T; dropped: { field: string; numbers: string[] }[] } {
  const flatTranscript = transcript.replace(/\s+/g, " ");
  const kept = { ...fields };
  const dropped: { field: string; numbers: string[] }[] = [];

  for (const [field, value] of Object.entries(fields)) {
    if (typeof value !== "string") continue;
    const unsupported = numbersNeedingSupport(value).filter(
      (number) => !flatTranscript.includes(number)
    );
    if (unsupported.length > 0) {
      (kept as Record<string, unknown>)[field] = null;
      dropped.push({ field, numbers: unsupported });
    }
  }

  return { fields: kept, dropped };
}

/** Fields the model writes about the visitor, rather than records from them. */
export const GENERATED_LEAD_FIELDS = [
  "main_concern",
  "priority",
  "duration_of_issue",
  "timeline",
  "travel_country",
  "notes",
  "ai_summary",
] as const;

// visitor_language is deliberately absent above. It is a routing key in
// canonical English rather than prose for the team to read, and it is
// checked against the script the visitor actually wrote in rather than
// against the figures in the transcript.

/**
 * The lead extraction prompt, in the language the team reads.
 *
 * Brand and service names are covered by the instruction below and
 * nothing more. A list of the business's own entry titles was passed in
 * as names to preserve, and measurement killed it: the real brands
 * survived untranslated without it ("Implant Swiss", "Straumann" both
 * came through in a Turkish summary), while the list itself got internal
 * entry labels used AS product names - a summary reading "Implants brand
 * olarak Implant Swiss ve Crowns brand olarak Straumann... The warranty
 * hakkinda bilgilendirilmis". It protected nothing and added noise.
 */
export function buildLeadExtractionPrompt(language: string): string {
  // The language rule leads, and is repeated at the end. Buried below the
  // schema it was followed inconsistently: an English conversation for a
  // Turkish-reading team came back in English on one sample and Turkish
  // on another. Position is free; a second model call to check is not.
  return `You extract structured lead information from a conversation between a business's chat assistant and a prospective customer.

THE TEAM READING THIS WORKS IN ${language}. Everything you write about the customer goes in ${language} — "main_concern", "priority", "duration_of_issue", "timeline", "travel_country", "notes" and "ai_summary" — whatever language the conversation itself is in. They are read by someone who has to act on them without translating anything first. If the conversation is already in ${language} there is nothing to convert; just write them.

Read the full conversation transcript and respond with ONLY a JSON object, no other text and no markdown code fences, in exactly this shape:

{"name": string or null, "contact_info": string or null, "age": number or null, "main_concern": string or null, "priority": string or null, "duration_of_issue": string or null, "timeline": string or null, "travel_country": string or null, "notes": string or null, "visitor_language": string or null, "ai_summary": string or null, "qualification_score": integer or null}

Only give a field a real value if it was actually mentioned somewhere in the transcript — use null for anything not yet known. Do not guess or infer beyond what was actually said.

"name" and "contact_info" are the visitor's own record and are NOT translated, transliterated or reformatted: copy them exactly as given, in their original script.

CARRY THESE THROUGH UNCHANGED, inside otherwise-${language} text: every number, price, amount, measurement, date and duration exactly as written in the transcript, with the same digits and the same separators — do not convert 5,000 to 5.000, do not convert currencies, do not reformat dates. The same goes for the names of services and brands: write them exactly as they appear, never translated.

- "contact_info" is whatever they gave to be reached — a phone number, WhatsApp number, or email, whichever applies.
- "main_concern" is what they need or want help with — the reason they got in touch.
- "priority" is what they said matters most to them, e.g. "quality and price" or "speed".
- "duration_of_issue" is how long they've had the need or problem, e.g. "a few months", "for years". Null if it doesn't apply to this kind of business.
- "timeline" is when they're looking to move forward, e.g. "soon", "still exploring".
- "travel_country" is the country they'd be traveling from, if mentioned.
- "notes" is any other detail useful to the sales team that doesn't fit the fields above.
- "visitor_language" is the language the CUSTOMER wrote in, judged only from their own messages and never from the assistant's replies. Give it in ENGLISH ("Arabic", "Russian", "German") whatever the rest of this is written in: it is used to route the lead to the right salesperson, so it has to read the same on every lead. If they wrote in more than one, give the one they used most recently at length. Null if they have written too little to tell.
- "ai_summary" is a concise 2-3 sentence briefing written for a sales rep who hasn't read the conversation: who the customer is, what they want, their main concern or objection, and their timeline or intent. Write it fresh each time from the full transcript, not as a diff from a previous summary. Only null if there's genuinely nothing to summarize yet (e.g. the very first message).
- "qualification_score" is an integer from 0 to 100 estimating how strong and ready this lead is, based on how complete their info is, how clearly they've expressed intent, any urgency they've shown, and how engaged they are in the conversation. Higher means a hotter lead. Only null if there's not yet enough conversation to judge.

Respond with the JSON object only, with every field described above written in ${language} except "name" and "contact_info", which stay exactly as the customer gave them, and "visitor_language", which is always in English.`;
}
