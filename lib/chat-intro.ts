// The proactive opening a visitor sees the instant the chat page loads,
// plus the starter chips under it.
//
// Both are computed deterministically from the tenant profile — no AI
// call. That keeps the first paint instant and free, and means the
// opening never varies between two visitors to the same business, which
// is what makes it feel like the business's own greeting rather than a
// chatbot improvising.
//
// Every field it reads is optional. A tenant that has filled in nothing
// but its name still gets a clean, truthful greeting.

import type { TenantSettings } from "./tenant-settings";
import {
  CHAT_INTRO_SOURCE,
  ownLabel,
  resolveChatIntroStrings,
  resolveIntroLine,
  type ChatIntroKey,
  type ChatIntroStrings,
} from "./chat-intro-i18n";

export type ChatIntroInput = {
  businessName: string;
  industry: string | null;
  description: string | null;
  settings: TenantSettings;
  /** Distinct knowledge_base categories this tenant actually has. */
  categories: string[];
};

export type ChatIntro = {
  /**
   * The full opening line, unchanged. This exact string is posted back to
   * /api/chat as `openingMessage` and stored as the assistant's first
   * turn, so it must stay the concatenation of `title` and `sub` — the
   * split below is presentation only.
   */
  greeting: string;
  /** First sentence, set as the greeting headline. */
  title: string;
  /** The remainder, set beneath it in a quieter style. Empty if there is none. */
  sub: string;
  chips: string[];
};

/** Roughly one comfortable sentence on a phone before it starts to wall off. */
const MAX_INTRO_CHARS = 130;

/**
 * First sentence of the description, trimmed to something that reads as a
 * greeting rather than an essay.
 *
 * Owners write descriptions of wildly different lengths — some a phrase,
 * some several paragraphs — and the whole thing pasted into a chat bubble
 * looks like a wall of text on a phone.
 */
function shortIntro(description: string, businessName: string): string | null {
  let cleaned = description.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;

  // Owners very often start the description with their own name ("Atlas
  // Legal is a full service..."), which follows "Hi! We're Atlas Legal."
  // as an immediate, clumsy repetition. Strip that opening reference and
  // re-point the sentence at "We" so the greeting reads as one thought.
  const escaped = businessName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (escaped) {
    const leadingName = new RegExp(`^${escaped}\\s*(is|are|was|were)\\b\\s*`, "i");
    if (leadingName.test(cleaned)) {
      cleaned = cleaned.replace(leadingName, "We are ");
    }
  }

  // Split on sentence enders followed by a space, so decimals and
  // abbreviations mid-sentence don't cut it short.
  const firstSentence = cleaned.split(/(?<=[.!?])\s/)[0] ?? cleaned;

  if (firstSentence.length <= MAX_INTRO_CHARS) return firstSentence;

  // Too long even as one sentence — cut on a word boundary and ellipsize
  // rather than slicing mid-word.
  const cut = firstSentence.slice(0, MAX_INTRO_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.]$/, "")}…`;
}

/**
 * Builds the greeting from whatever the profile actually has.
 *
 * Each clause is independently optional, so this degrades in steps rather
 * than all at once: name + place + intro, then name + place, then just a
 * warm line with the name.
 */
function buildGreeting(
  input: ChatIntroInput,
  strings: ChatIntroStrings,
  labels: Record<string, string> | undefined,
  language: string
): { title: string; sub: string } {
  const { businessName, description, settings } = input;

  // City is the useful unit here — a street address is noise in a
  // greeting, and country alone is too vague unless it's all there is.
  const rawPlace = settings.location?.city ?? settings.location?.country ?? null;
  // The owner's own spelling of their city in this language, if they gave
  // one. "Istanbul" inside an Arabic greeting is the seam this closes.
  const place = rawPlace ? ownLabel(rawPlace, labels) : null;

  // The name and city are substituted in, never translated: whatever
  // language the greeting is in, a business is called what it is called.
  const opener = place
    ? strings.opener_with_place.replace("{business}", businessName).replace("{place}", place)
    : strings.opener.replace("{business}", businessName);

  // The owner's own sentence about their business: shown in their
  // translation of it where they wrote one, dropped where it is plainly
  // in the wrong language, and otherwise exactly as they wrote it.
  const derived = description ? shortIntro(description, businessName) : null;
  const intro = derived ? resolveIntroLine(derived, labels, language) : null;

  // The opener leads; everything else is support copy. Splitting here
  // rather than in the component keeps the greeting's assembly in one
  // place, so `greeting` below can stay byte-identical to what it was.
  const sub = intro ? `${intro} ${strings.help}` : strings.help;
  return { title: opener, sub };
}

// Free-text categories in practice look like "before_after", "doctors",
// and "Our history" — inconsistent casing and separators from different
// owners. This maps the shapes that recur onto phrasing a visitor would
// actually tap, keyed on normalised text.
const CATEGORY_LABELS: { match: RegExp; key: ChatIntroKey }[] = [
  { match: /doctor|dentist|surgeon|staff|team|our people/, key: "chip_team" },
  { match: /before.?after|result|gallery|portfolio|case/, key: "chip_before_after" },
  { match: /pric|cost|fee|payment|finance|package/, key: "chip_pricing" },
  { match: /tech|equipment|method|process|how it works|procedure/, key: "chip_how_it_works" },
  { match: /guarantee|warrant|aftercare|follow.?up/, key: "chip_guarantees" },
  { match: /review|testimonial|experience|patient experience/, key: "chip_reviews" },
  { match: /history|about|overview|story|who we are/, key: "chip_about" },
  // No "clinic" here on purpose: it appears in category names like
  // "clinic_overview", which is about the business rather than about
  // getting to it. Those are caught by the "About the business" rule above.
  { match: /location|travel|transport|accommodation|getting here/, key: "chip_location" },
  { match: /hour|open|availab|schedul|book/, key: "chip_hours" },
];

/**
 * Turns an unrecognised category into something presentable —
 * "patient_experience" becomes "Patient experience".
 */
function humanize(category: string): string {
  const words = category.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** Shown when a tenant has no knowledge entries yet, so chips are never empty. */
const FALLBACK_CHIP_KEYS: ChatIntroKey[] = ["fallback_offer", "chip_how_it_works", "chip_pricing"];

const MAX_CHIPS = 4;

/**
 * Starter chips from the tenant's own knowledge categories.
 *
 * Chips are only useful if tapping one leads somewhere the business can
 * actually answer, so they're derived from what this tenant has written
 * rather than from a generic list.
 */
function buildChips(
  categories: string[],
  strings: ChatIntroStrings,
  labels: Record<string, string> | undefined
): string[] {
  const chips: string[] = [];
  const seen = new Set<string>();

  for (const raw of categories) {
    if (chips.length >= MAX_CHIPS) break;
    if (!raw) continue;

    const normalised = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
    const mapped = CATEGORY_LABELS.find((c) => c.match.test(normalised));
    // A recognised category gets the translated label; an unrecognised one
    // is the owner's own word for it, shown exactly as they wrote it.
    // A recognised category gets the translated label; an unrecognised one
    // is the owner's own word for it, shown in their own translation of it
    // where they wrote one, and otherwise exactly as they wrote it.
    const label = mapped ? strings[mapped.key] : ownLabel(humanize(raw), labels);

    if (!label) continue;
    // Two different categories can map to the same friendly label
    // (e.g. "clinic_overview" and "our_history" are both "About the
    // business") — showing it twice would look broken.
    if (seen.has(label)) continue;

    seen.add(label);
    chips.push(label);
  }

  if (chips.length === 0) return FALLBACK_CHIP_KEYS.map((key) => strings[key]);
  return chips;
}

/**
 * The chips a given tenant actually shows, as keys.
 *
 * The review card asked owners to check twelve chip labels when a visitor
 * only ever sees four, and which four depends on this tenant's own
 * categories. `ownWords` are the categories that matched no label and are
 * shown in the owner's own wording, so they need no review at all.
 */
/**
 * The line the greeting derives from the business description, or null.
 *
 * Exported so the dashboard can offer it for translation and show it in
 * the preview: it is part of what a visitor reads, and a preview that
 * leaves it out is how an English sentence survived in an otherwise
 * Arabic greeting without anyone seeing it on the card.
 */
export function deriveIntroLine(description: string | null, businessName: string): string | null {
  if (!description) return null;
  return shortIntro(description, businessName) || null;
}

export function chipPlanFor(categories: string[]): {
  keys: ChatIntroKey[];
  ownWords: string[];
} {
  const keys: ChatIntroKey[] = [];
  const ownWords: string[] = [];
  const seen = new Set<string>();

  for (const raw of categories) {
    if (keys.length + ownWords.length >= MAX_CHIPS) break;
    if (!raw) continue;
    const normalised = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
    const mapped = CATEGORY_LABELS.find((c) => c.match.test(normalised));
    if (mapped) {
      if (seen.has(mapped.key)) continue;
      seen.add(mapped.key);
      keys.push(mapped.key);
    } else {
      const label = humanize(raw);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      ownWords.push(label);
    }
  }

  if (keys.length === 0 && ownWords.length === 0) return { keys: [...FALLBACK_CHIP_KEYS], ownWords: [] };
  return { keys, ownWords };
}

export function buildChatIntro(input: ChatIntroInput): ChatIntro {
  // English unless the owner has chosen another language AND signed off a
  // translation of it; otherwise a hand-written one where one exists.
  const strings = input.settings.chat_language
    ? resolveChatIntroStrings(input.settings.chat_language, input.settings.chat_intro)
    : { ...CHAT_INTRO_SOURCE };

  // Owner-written, so they need no review and apply as soon as they are
  // saved - unlike the generated strings, which wait for sign-off.
  const labels =
    input.settings.chat_intro?.language?.trim().toLowerCase() ===
    input.settings.chat_language?.trim().toLowerCase()
      ? input.settings.chat_intro?.ownLabels
      : undefined;

  const { title, sub } = buildGreeting(input, strings, labels, input.settings.chat_language ?? "English");
  return {
    // Exactly what the previous single-string version produced.
    greeting: sub ? `${title} ${sub}` : title,
    title,
    sub,
    chips: buildChips(input.categories, strings, labels),
  };
}
