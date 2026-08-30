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
function buildGreeting(input: ChatIntroInput): { title: string; sub: string } {
  const { businessName, description, settings } = input;

  // City is the useful unit here — a street address is noise in a
  // greeting, and country alone is too vague unless it's all there is.
  const place = settings.location?.city ?? settings.location?.country ?? null;

  const opener = place
    ? `Hi! We're ${businessName} in ${place}.`
    : `Hi! We're ${businessName}.`;

  const intro = description ? shortIntro(description, businessName) : null;

  // The opener leads; everything else is support copy. Splitting here
  // rather than in the component keeps the greeting's assembly in one
  // place, so `greeting` below can stay byte-identical to what it was.
  const sub = intro ? `${intro} How can we help you today?` : "How can we help you today?";
  return { title: opener, sub };
}

// Free-text categories in practice look like "before_after", "doctors",
// and "Our history" — inconsistent casing and separators from different
// owners. This maps the shapes that recur onto phrasing a visitor would
// actually tap, keyed on normalised text.
const CATEGORY_LABELS: { match: RegExp; label: string }[] = [
  { match: /doctor|dentist|surgeon|staff|team|our people/, label: "Meet our team" },
  { match: /before.?after|result|gallery|portfolio|case/, label: "See before & after" },
  { match: /pric|cost|fee|payment|finance|package/, label: "Ask about pricing" },
  { match: /tech|equipment|method|process|how it works|procedure/, label: "How it works" },
  { match: /guarantee|warrant|aftercare|follow.?up/, label: "Guarantees & aftercare" },
  { match: /review|testimonial|experience|patient experience/, label: "What clients say" },
  { match: /history|about|overview|story|who we are/, label: "About the business" },
  // No "clinic" here on purpose: it appears in category names like
  // "clinic_overview", which is about the business rather than about
  // getting to it. Those are caught by the "About the business" rule above.
  { match: /location|travel|transport|accommodation|getting here/, label: "Location & travel" },
  { match: /hour|open|availab|schedul|book/, label: "Opening hours" },
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
const FALLBACK_CHIPS = ["What do you offer?", "How does it work?", "Ask about pricing"];

const MAX_CHIPS = 4;

/**
 * Starter chips from the tenant's own knowledge categories.
 *
 * Chips are only useful if tapping one leads somewhere the business can
 * actually answer, so they're derived from what this tenant has written
 * rather than from a generic list.
 */
function buildChips(categories: string[]): string[] {
  const chips: string[] = [];
  const seen = new Set<string>();

  for (const raw of categories) {
    if (chips.length >= MAX_CHIPS) break;
    if (!raw) continue;

    const normalised = raw.toLowerCase().replace(/[_-]+/g, " ").trim();
    const mapped = CATEGORY_LABELS.find((c) => c.match.test(normalised));
    const label = mapped ? mapped.label : humanize(raw);

    if (!label) continue;
    // Two different categories can map to the same friendly label
    // (e.g. "clinic_overview" and "our_history" are both "About the
    // business") — showing it twice would look broken.
    if (seen.has(label)) continue;

    seen.add(label);
    chips.push(label);
  }

  if (chips.length === 0) return FALLBACK_CHIPS;
  return chips;
}

export function buildChatIntro(input: ChatIntroInput): ChatIntro {
  const { title, sub } = buildGreeting(input);
  return {
    // Exactly what the previous single-string version produced.
    greeting: sub ? `${title} ${sub}` : title,
    title,
    sub,
    chips: buildChips(input.categories),
  };
}
