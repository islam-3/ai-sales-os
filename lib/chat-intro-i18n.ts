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
  fallback_offer: "What do you offer?",
  fallback_how: "How does it work?",
  fallback_pricing: "Ask about pricing",
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

/** Whether a cached translation is still usable. */
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

const PLACEHOLDER = /\{(business|place)\}/g;

function placeholdersIn(text: string): string[] {
  return (text.match(PLACEHOLDER) ?? []).sort();
}

/**
 * A translation is only accepted when it is structurally sound.
 *
 * The placeholder check is the important one. A model that renders
 * "{business}" into the business's actual name, or drops it, produces a
 * greeting that is either wrong for every other tenant or missing the
 * name entirely — and it would be cached and shown to every visitor.
 */
export function validateTranslation(raw: unknown): ChatIntroStrings | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const out = {} as ChatIntroStrings;

  for (const key of Object.keys(CHAT_INTRO_SOURCE) as ChatIntroKey[]) {
    const value = candidate[key];
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (!trimmed) return null;
    // Generous, but a translation of a chip label that runs to a
    // paragraph is a model answering the wrong question.
    if (trimmed.length > 200) return null;

    const expected = placeholdersIn(CHAT_INTRO_SOURCE[key]);
    if (placeholdersIn(trimmed).join(",") !== expected.join(",")) return null;

    out[key] = trimmed;
  }

  return out;
}

/** The instruction for translating the fixed strings, and nothing else. */
export function buildChatIntroTranslationPrompt(language: string): string {
  return `You translate a handful of short interface strings for a business's chat widget into ${language}.

Respond with ONLY a JSON object, no other text and no markdown code fences, with exactly these keys and a ${language} translation of each value:

${JSON.stringify(CHAT_INTRO_SOURCE, null, 2)}

Rules:
- {business} and {place} are placeholders that get replaced with the business's own name and city. Keep them EXACTLY as written, including the braces, and put them where they belong in ${language} word order. Never translate them, never remove them, never substitute a real name.
- These are spoken to a customer arriving at a business's chat. Warm and natural in ${language}, not a literal word-for-word rendering.
- The chip values are buttons a customer taps. Keep them short — a few words, as they are in English.
- If ${language} is English, return the values unchanged.

Respond with the JSON object only.`;
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
      fallback_how: "Nasıl çalışıyor?",
      fallback_pricing: "Fiyatları sorun",
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
      fallback_how: "كيف تتم العملية؟",
      fallback_pricing: "اسأل عن الأسعار",
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

/**
 * What a visitor is actually being greeted in right now, and why.
 *
 * Exists so the dashboard can say so plainly. A tenant that picks Russian
 * and never approves the translation is silently greeting Russian
 * visitors in English, and the only thing worse than that happening is it
 * happening invisibly.
 */
export type ChatIntroStatus = {
  /** What a first-time visitor sees this moment. */
  showing: "english" | "built-in" | "approved";
  /** The language the owner chose, or null if they have not chosen one. */
  language: string | null;
  /** Why the chosen language is not live, when it is not. */
  pending: null | "not-generated" | "awaiting-approval" | "out-of-date";
};

export function chatIntroStatus(settings: {
  chat_language?: string;
  chat_intro?: ChatIntroTranslation;
}): ChatIntroStatus {
  const language = settings.chat_language?.trim() || null;
  if (!language) return { showing: "english", language: null, pending: null };

  const cached = settings.chat_intro;
  const hasBuiltIn = builtInTranslation(language) !== null;
  const fallback = hasBuiltIn ? "built-in" : "english";

  if (!cached || cached.language.trim().toLowerCase() !== language.trim().toLowerCase()) {
    return { showing: fallback, language, pending: "not-generated" };
  }
  if (cached.sourceHash !== chatIntroSourceHash()) {
    return { showing: fallback, language, pending: "out-of-date" };
  }
  if (!cached.approved) {
    return { showing: fallback, language, pending: "awaiting-approval" };
  }
  return { showing: "approved", language, pending: null };
}

/**
 * The keys whose English has changed since a translation was made.
 *
 * Only these need redoing. Everything else keeps its translation,
 * including any wording the owner corrected by hand, which is the whole
 * reason the English is stored alongside.
 */
export function staleKeys(cached: ChatIntroTranslation | undefined): ChatIntroKey[] {
  if (!cached) return [];
  return (Object.keys(CHAT_INTRO_SOURCE) as ChatIntroKey[]).filter(
    (key) => cached.source?.[key] !== CHAT_INTRO_SOURCE[key]
  );
}

// Arabic, Hebrew, Persian/Urdu supplements, and their presentation forms.
const RTL_SCRIPT = /[֑-߿ࢠ-ࣿיִ-﷿ﹰ-﻿]/;

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
