// What the model is asked for when it drafts or translates a greeting.
//
// Two jobs, deliberately separate, because they carry different risks.
//
// SUGGEST writes a welcome message from the business's own stored
// details. It is the only place in this product where a model writes
// prose that a visitor reads before anyone has typed anything, so the
// constraint is the same one that applies everywhere else: it may use
// what it is given and nothing else. No invented services, no invented
// numbers, no claims the business has not made about itself.
//
// It does NOT draft the chips. Chips are claims about what the business
// offers, and a model adding "Teeth whitening" to a clinic that does not
// do it is exactly the invented-business-detail failure this codebase
// guards against for prices, phone numbers and photographs. The chips
// already have a correct source the owner wrote: their own knowledge
// base categories.
//
// TRANSLATE moves an existing greeting into another language, chips
// included. That one IS a language operation, so the chips come with it
// — rendering "Dental treatment" under an Arabic greeting is the
// half-translated state the owner used to fix by hand.

export type GreetingDraftInput = {
  businessName: string;
  industry: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  /** Their own category names, for context only — never to be listed back. */
  categories: string[];
  /** The language to write in, named rather than coded. */
  language: string;
};

/** Roughly three sentences. Long enough to be warm, short enough to read. */
export const GREETING_MAX_CHARS = 320;

export function buildGreetingSuggestionPrompt(input: GreetingDraftInput): string {
  const details = [
    `Business name: ${input.businessName}`,
    input.industry ? `What it is: ${input.industry}` : null,
    [input.city, input.country].filter(Boolean).length
      ? `Where it is: ${[input.city, input.country].filter(Boolean).join(", ")}`
      : null,
    input.description ? `How the owner describes it: ${input.description}` : null,
    input.categories.length ? `Topics it has written about: ${input.categories.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are writing the welcome message for a business's chat widget. It is the first thing a visitor sees, before they have typed anything.

THE BUSINESS, in its own words:
${details}

Write the message in ${input.language}.

Rules:
- Use ONLY what is above. Do not invent a service, a number, a guarantee, a year, a location or anything else the business has not said about itself. If a detail is not above, it does not exist.
- Write the business name and the place as ordinary words in the sentence. Do not use placeholders or brackets.
- Two or three sentences, under ${GREETING_MAX_CHARS} characters. It is read on a phone.
- Say something specific about this business rather than something any business could say, then invite them to write.
- Warm and plain. No marketing superlatives, no exclamation stacking, no emoji.
- Do not ask for a name, a number or any detail yet. This is hello.

Reply with the message itself and nothing else: no quotes, no preamble, no explanation.`;
}

export type GreetingTranslationInput = {
  text: string;
  chips: string[];
  language: string;
};

export function buildGreetingTranslationPrompt(input: GreetingTranslationInput): string {
  return `You translate a business's chat welcome message and its buttons into ${input.language}.

Reply with ONLY this JSON object, no other text and no markdown fences:
{"text": "...", "chips": ["...", "..."]}

text — the welcome message in ${input.language}.
chips — each button label in ${input.language}, in the same order, the same number of them.

Rules:
- Translate. Do not rewrite, expand, shorten or improve.
- The business's NAME stays exactly as it is written, in its own script. A business is called what it is called.
- A place name keeps its usual form in ${input.language} if it plainly has one, and is otherwise left as written.
- Do not add a service, a number or a claim that is not in the original.
- Keep the same number of chips, in the same order. A chip is a button: keep it short.`;
}
