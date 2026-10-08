import { detectScript, scriptForLanguage } from "./visitor-language";
import { resolveLanguageCode } from "./languages";

// The greeting and starter chips in the tenant's own language.
//
// What a visitor sees before they have typed anything is the one thing
// the assistant cannot adapt: it is on screen first. An English "Hi!
// We're X. How can we help you today?" above a conversation that then
// runs in Turkish is the seam this closes.
//
// Only the FIXED strings are translated, and the business's own words
// never are. The opener keeps {business} and {place} as placeholders, the
// description-derived intro is passed through untouched, and a starter
// chip made from the owner's own category name stays exactly as they
// wrote it. So nothing a model writes here can invent a business detail,
// and editing a business detail cannot invalidate a translation — the two
// are simply not mixed.
//
// That also makes the cache key small: these strings depend on the
// language and on nothing else about the tenant.

/**
 * Every fixed string the intro can show, in English.
 *
 * The single source of truth: chat-intro.ts refers to these by key rather
 * than repeating the text, and the hash below changes whenever one is
 * edited, so a stale translation cannot survive a copy change.
 */
export const CHAT_INTRO_SOURCE = {
  opener_with_place: "Hi! We're {business} in {place}.",
  opener: "Hi! We're {business}.",
  help: "How can we help you today?",
  chip_team: "Meet our team",
  chip_before_after: "See before & after",
  chip_pricing: "Ask about pricing",
  chip_how_it_works: "How it works",
  chip_guarantees: "Guarantees & aftercare",
  chip_reviews: "What clients say",
  chip_about: "About the business",
  chip_location: "Location & travel",
  chip_hours: "Opening hours",
  // One fallback only. "How does it work?" and "Ask about pricing" used to
  // live here too, duplicating chip_how_it_works and chip_pricing word for
  // word - so the review card asked the owner to translate the same label
  // twice, and the second copy was never even shown.
  fallback_offer: "What do you offer?",
} as const;

export type ChatIntroKey = keyof typeof CHAT_INTRO_SOURCE;
export type ChatIntroStrings = Record<ChatIntroKey, string>;

export type ChatIntroTranslation = {
  /** The language these were written for, as the owner typed it. */
  language: string;
  /** Which English source these came from, so a copy edit invalidates them. */
  sourceHash: string;
  strings: ChatIntroStrings;
  /**
   * The English each string was translated from.
   *
   * Kept so that editing one English string later regenerates only that
   * one and leaves every other translation - including the owner's own
   * edits - alone.
   */
  source: Partial<Record<ChatIntroKey, string>>;
  /**
   * Whether the owner has reviewed this. Nothing generated goes live
   * unreviewed: they speak the language and we do not.
   */
  approved: boolean;
  /**
   * The owner's own words for their own things, KEYED BY LANGUAGE.
   *
   * Inner maps are keyed by what the thing is called today - a category
   * name, the city - and hold what it should read as in that language.
   * An Arabic greeting above buttons reading "Dental treatment" and a
   * city reading "Istanbul" is half-translated, but these are business
   * details and a model must never invent them. So the owner writes
   * them, and a language with none falls back to the original.
   *
   * ── Why this is per language ─────────────────────────────────────
   * It used to be one flat map with no language attached. An owner who
   * wrote their city and categories in Arabic, then switched the chat
   * language to English, got "Hi! We're Prof Clinic in اسطنبول." with
   * Arabic buttons underneath — because nothing recorded which language
   * those words were for.
   *
   * Keeping them per language also means the switch is not destructive:
   * the Arabic words stay under `ar` and come back if the owner switches
   * back, instead of being cleared on the owner's behalf.
   */
  ownLabels: Record<string, Record<string, string>>;
  /**
   * The greeting as literal prose, by language. The new shape.
   *
   * Lives inside chat_intro rather than beside it so one jsonb key holds
   * everything about the greeting, old and new, and a tenant can be read
   * without knowing which generation they are on.
   */
  greetings?: StoredGreetings;
};

/** Stable, dependency-free hash of the English source. */
export function chatIntroSourceHash(source: Record<string, string> = CHAT_INTRO_SOURCE): string {
  const text = Object.entries(source)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("|");
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}


// The {business} and {place} placeholder machinery lived here. It is
// gone with the templated greeting: the owner writes their name into the
// prose like any other word, so there is nothing to substitute and
// nothing to validate the substitution of.




/**
 * What to show for one of the owner's own words.
 *
 * Their translation if they wrote one, otherwise the thing itself. Never
 * a guess: a category or a city rendered wrongly is a business detail
 * stated wrongly to a customer.
 */
export function ownLabel(original: string, labels: Record<string, string> | undefined): string {
  return labels?.[original]?.trim() || original;
}

/**
 * The owner's words for ONE language, or an empty map.
 *
 * The single place that decides whether a stored label applies. Every
 * caller goes through it, so a label can never reach a greeting without
 * its language having been checked — which is exactly what happened
 * before, in the dashboard preview, while the live page had a check of
 * its own and was fine.
 *
 * An empty map is the honest answer for a language the owner has not
 * written words for yet: ownLabel and resolveIntroLine then fall back to
 * the untranslated original, which is always better than another
 * language's words.
 */
export function labelsForLanguage(
  ownLabels: Record<string, Record<string, string>> | undefined,
  language: string | undefined
): Record<string, string> {
  const code = resolveLanguageCode(language ?? "") ?? (language ?? "").trim().toLowerCase();
  if (!code) return {};
  return ownLabels?.[code] ?? {};
}


/**
 * The description-derived line, in the chat language, or null to leave it out.
 *
 * The owner's own sentence about their business, so nothing may translate
 * it but them. If they have not, and it is plainly not in the chat
 * language, it is dropped: a single English sentence in the middle of an
 * Arabic greeting reads worse than a greeting that is one sentence
 * shorter, and the rest of the greeting says the same things anyway.
 *
 * Only dropped when the mismatch can be PROVEN. A language whose script
 * we cannot name, or a line we cannot read a script from, keeps the line —
 * the same rule as everywhere else here, that an incomplete list must
 * never throw away something correct.
 */
export function resolveIntroLine(
  intro: string,
  labels: Record<string, string> | undefined,
  language: string
): string | null {
  const written = labels?.[intro]?.trim();
  if (written) return written;

  const expected = scriptForLanguage(language);
  if (!expected) return intro;

  const actual = detectScript([intro]);
  if (!actual) return intro;

  return actual === expected ? intro : null;
}


/**
 * Hand-written translations, used when generation has not happened or
 * failed.
 *
 * Deliberately only a few. Customers here are medical-tourism clinics
 * serving many languages with sales staff for several of them, so a fixed
 * hand-written set was never going to cover the need — generation plus
 * owner review does. These exist so that a failed or pending generation
 * still shows something better than English to the two non-English
 * languages that come up most.
 */
const BUILT_IN: { match: RegExp; strings: ChatIntroStrings }[] = [
  {
    match: /^(tr|tur|turkish|t(ü|u)rk(ç|c)e)$/i,
    strings: {
      opener_with_place: "Merhaba! Biz {business}, {place}.",
      opener: "Merhaba! Biz {business}.",
      help: "Size nasıl yardımcı olabiliriz?",
      chip_team: "Ekibimizle tanışın",
      chip_before_after: "Öncesi ve sonrası",
      chip_pricing: "Fiyatları sorun",
      chip_how_it_works: "Nasıl çalışır?",
      chip_guarantees: "Garanti ve bakım",
      chip_reviews: "Müşteri yorumları",
      chip_about: "Hakkımızda",
      chip_location: "Konum ve ulaşım",
      chip_hours: "Çalışma saatleri",
      fallback_offer: "Neler sunuyorsunuz?",
    },
  },
  {
    match: /^(ar|ara|arabic|العربية|عربي)$/i,
    strings: {
      opener_with_place: "مرحباً! نحن {business} في {place}.",
      opener: "مرحباً! نحن {business}.",
      help: "كيف يمكننا مساعدتك اليوم؟",
      chip_team: "تعرّف على فريقنا",
      chip_before_after: "قبل وبعد",
      chip_pricing: "اسأل عن الأسعار",
      chip_how_it_works: "كيف تتم العملية",
      chip_guarantees: "الضمان والمتابعة",
      chip_reviews: "آراء العملاء",
      chip_about: "عن الشركة",
      chip_location: "الموقع والوصول",
      chip_hours: "ساعات العمل",
      fallback_offer: "ما الخدمات التي تقدمونها؟",
    },
  },
];

/** A hand-written translation for this language, or null. */
export function builtInTranslation(language: string): ChatIntroStrings | null {
  const name = language.trim();
  if (!name) return null;
  return BUILT_IN.find((entry) => entry.match.test(name))?.strings ?? null;
}

/**
 * Whether a cached translation is still usable.
 *
 * Only reads the LEGACY fifteen-string shape. The greeting a tenant
 * writes now is prose, kept per language and read by storedGreetingFor;
 * this is what buildChatIntro falls back to for a tenant who has not
 * written one.
 */
export function translationIsCurrent(
  cached: ChatIntroTranslation | undefined,
  language: string
): cached is ChatIntroTranslation {
  return (
    !!cached &&
    cached.language.trim().toLowerCase() === language.trim().toLowerCase() &&
    cached.sourceHash === chatIntroSourceHash()
  );
}

/**
 * The strings to render with, best available first.
 *
 * Owner-reviewed text beats a hand-written fallback, which beats English.
 * An unreviewed generation is never shown: the owner speaks the language
 * and we do not, so it is their sign-off that makes it fit to display.
 */
export function resolveChatIntroStrings(
  language: string,
  cached: ChatIntroTranslation | undefined
): ChatIntroStrings {
  if (translationIsCurrent(cached, language) && cached.approved) return cached.strings;
  return builtInTranslation(language) ?? { ...CHAT_INTRO_SOURCE };
}




// Arabic, Hebrew, Persian/Urdu supplements, and their presentation forms.
const RTL_SCRIPT = /[\u0591-\u07FF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * Whether text reads right-to-left, judged by script rather than by a
 * language name.
 *
 * The language setting is free text — "Arabic", "العربية" and "ar" are
 * all things an owner might type — so matching names would be a list that
 * is always one spelling out of date. The translated greeting itself is
 * unambiguous evidence, and it is already in hand when direction is
 * decided.
 */
export function isRtlText(text: string): boolean {
  return RTL_SCRIPT.test(text);
}

/** The language the fixed strings are authored in. */
export const SOURCE_LANGUAGE_CODE = "en";



// ─────────────────────────────────────────────────────────────────────
// The greeting as literal prose
//
// What came before this: fifteen separately translatable strings —
// opener, opener_with_place, help, and a chip label for each category we
// could recognise — assembled at render time with {business} and {place}
// substituted in. Every piece existed because WE needed it translatable
// independently, and the business owner paid for that with a form of
// fifteen labelled fields to fill in for a welcome message.
//
// The greeting is now one string, written as a visitor will read it,
// with the business name and city typed into it like any other words.
//
// ── Why literal, and what it costs ───────────────────────────────────
// A business renames itself once in several years, so templating was
// permanent complexity for a case that barely happens. More importantly,
// working out which words in an owner's prose are "the business name"
// is text interpretation, and text interpretation is where every hard
// bug in this project has come from.
//
// The cost is a greeting that goes stale on a rename. That is handled
// visibly — see greetingNeedsReview — rather than by inference.
// ─────────────────────────────────────────────────────────────────────

export type StoredGreeting = {
  /** The whole message, exactly as a visitor reads it. */
  text: string;
  /**
   * The buttons a visitor can tap.
   *
   * Absent means "derive them from the knowledge base categories", which
   * is what every tenant got before and what a tenant who never opens
   * this still gets. An EMPTY array is different and deliberate: it
   * means the owner removed them all and wants none. Without that
   * distinction, deleting every chip regenerates them and reads as a bug.
   */
  chips?: string[];
  /**
   * Whether the owner has signed this off.
   *
   * True for anything they wrote or edited themselves. False only for a
   * machine translation they have not read yet — the one case where we
   * produced words in a language we cannot check.
   */
  approved: boolean;
  /**
   * The business name and city AT THE TIME this was written.
   *
   * The whole of the rename story. Compared against the current values
   * to decide whether to remind the owner that their welcome message
   * mentions a name they have changed. Nothing is rewritten and nothing
   * is inferred: the greeting is prose, and only its author knows which
   * words matter.
   */
  wroteWith?: { businessName?: string; place?: string };
  /**
   * Where these words came from.
   *
   *   written    the owner typed or edited it
   *   suggested  a model drafted it, the owner read it and saved it
   *   translated a model translated another greeting into this language
   *
   * The distinction that matters is the last one, and it exists to stop
   * translating a translation. An owner writes English, approves an
   * Arabic translation of it, then switches the chat to Russian: picking
   * the most recent greeting as the source would translate the ARABIC,
   * compounding whatever the first translation got wrong. The English is
   * the source of truth and stays the source.
   *
   * Absent on rows written before this existed, which are treated as
   * "written" — they are what the owner had live, so they are as close
   * to authored as anything we have.
   */
  origin?: "written" | "suggested" | "translated";
  /**
   * When it was saved, epoch ms.
   *
   * Only used to choose between several candidate sources. Absent on
   * older rows, which sort last rather than first — an unknown date is
   * not evidence of recency.
   */
  savedAt?: number;
};

/** Greetings by language code. */
export type StoredGreetings = Record<string, StoredGreeting>;

/** The greeting stored for one language, if there is one. */
export function storedGreetingFor(
  greetings: StoredGreetings | undefined,
  language: string | undefined
): StoredGreeting | null {
  const code = resolveLanguageCode(language ?? "") ?? (language ?? "").trim().toLowerCase();
  if (!code) return null;
  const found = greetings?.[code];
  return found && found.text.trim() ? found : null;
}

/**
 * Whether a stored greeting predates a change to the name or the city.
 *
 * Returns WHAT changed, so the reminder can say which — "you changed
 * your business name" is actionable and "something changed" is not.
 *
 * A greeting saved before this field existed has nothing to compare
 * against and says so by returning null: a reminder nobody can act on is
 * worse than silence, and the next save records the snapshot.
 */
export function greetingNeedsReview(
  stored: StoredGreeting | null,
  current: { businessName?: string | null; place?: string | null }
): { name: boolean; place: boolean } | null {
  if (!stored?.wroteWith) return null;

  const was = stored.wroteWith;
  const name =
    !!was.businessName &&
    !!current.businessName &&
    was.businessName.trim() !== current.businessName.trim();
  const place = !!was.place && !!current.place && was.place.trim() !== current.place.trim();

  return name || place ? { name, place } : null;
}

/**
 * The greeting to translate FROM, or null when there is nothing to do.
 *
 * ── The whole of the Translate button's logic ───────────────────────
 * There is something to translate when the owner has a greeting in some
 * language and NOT in the one visitors are greeted in. That is decided
 * from which key the greeting is filed under — never by looking at the
 * words. Reading the text to guess its language is the kind of
 * interpretation that placeholders were removed to avoid.
 *
 * Before this, the button translated whatever was in the editor into the
 * chat language, with no notion of a source at all: on a tenant whose
 * chat language was English and whose greeting was English, it offered
 * to translate English into English.
 *
 * ── Which source, when there are several ────────────────────────────
 * The most recent one the owner AUTHORED — written or suggested — in
 * preference to any translation, because translating a translation
 * compounds its errors. Only if every stored greeting is itself a
 * translation does the most recent of those win, which is better than
 * refusing to do anything.
 */
export function translationSourceFor(
  greetings: StoredGreetings | undefined,
  targetLanguage: string | undefined,
  options: {
    /**
     * Find a source even though the target already has a greeting.
     *
     * For re-translating one that has NOT been approved: the owner has
     * a translation they have not accepted, and redoing it must start
     * from the original rather than from the translation it produced.
     * Never set once a translation is live — at that point a greeting
     * exists for this language and there is nothing left to translate.
     */
    ignoreExisting?: boolean;
  } = {}
): { language: string; greeting: StoredGreeting } | null {
  const target = resolveLanguageCode(targetLanguage ?? "") ?? (targetLanguage ?? "").trim().toLowerCase();
  if (!target) return null;

  // Already in the language visitors are greeted in: nothing to do.
  if (!options.ignoreExisting && storedGreetingFor(greetings, target)) return null;

  const candidates = Object.entries(greetings ?? {})
    .filter(([code, g]) => code !== target && g.text.trim())
    .map(([language, greeting]) => ({ language, greeting }));
  if (candidates.length === 0) return null;

  // Most recent first. Absent savedAt sorts last: an unknown date is not
  // evidence of recency, and guessing one would quietly promote an old
  // row over a new one.
  //
  // Ties are broken by preferring the SOURCE language and then
  // alphabetically, which matters more than it looks. Every row migrated
  // from the old fifteen-string shape has no savedAt, so on a tenant
  // with two of them the order would otherwise come from the order the
  // keys happen to sit in the JSON — arbitrary, and in practice it
  // picked a tenant's 633-character Arabic over the English it was
  // derived from. English is where the fixed strings are authored and is
  // the likeliest original.
  const byRecency = (a: typeof candidates[number], b: typeof candidates[number]) => {
    const recency = (b.greeting.savedAt ?? 0) - (a.greeting.savedAt ?? 0);
    if (recency !== 0) return recency;
    if (a.language !== b.language) {
      if (a.language === SOURCE_LANGUAGE_CODE) return -1;
      if (b.language === SOURCE_LANGUAGE_CODE) return 1;
    }
    return a.language.localeCompare(b.language);
  };

  // Absent origin counts as authored: those rows are what the owner had
  // live before this field existed.
  const authored = candidates.filter((c) => (c.greeting.origin ?? "written") !== "translated");
  const pool = authored.length > 0 ? authored : candidates;

  return [...pool].sort(byRecency)[0];
}
