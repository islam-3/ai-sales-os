import type { ChatIntroKey, ChatIntroStrings, ChatIntroTranslation } from "./chat-intro-i18n";
import { resolveLanguageCode } from "./languages";

// Shape of tenants.settings — the flexible, secondary business fields
// that don't warrant their own typed columns.
//
// Every field is optional. The chat route reads this on every message, so
// parseTenantSettings() below is deliberately forgiving: a hand-edited or
// half-written row should degrade to "that field is missing", never throw
// and take the conversation down with it.

export type TenantSettings = {
  location?: {
    address?: string;
    city?: string;
    country?: string;
  };
  /** Free text — real hours are too irregular for a rigid per-day grid. */
  opening_hours?: string;
  languages?: string[];
  /**
   * The language the TEAM reads leads in — summaries, qualification
   * details and notes. Distinct from `languages` above, which is who the
   * assistant can serve: a clinic may answer visitors in three languages
   * while its reps work in one. The visitor's own transcript is never
   * translated regardless.
   */
  lead_language?: string;
  /**
   * The language the CHAT greets visitors in, before they have written
   * anything. Distinct again from both fields above: what the assistant
   * speaks once a visitor writes is decided by the visitor.
   */
  chat_language?: string;
  /**
   * The greeting and starter chips in `chat_language`, generated once and
   * reviewed by the owner. Only the fixed strings live here — never the
   * business's own name, city or description.
   */
  chat_intro?: ChatIntroTranslation;
  contact?: {
    phone?: string;
    whatsapp?: string;
    email?: string;
    website?: string;
  };
  service_area?: string;
  /** Currency prices are quoted in, e.g. "USD", "EUR", "TRY". */
  currency?: string;
  /**
   * Light or dark for the PUBLIC chat page. Stored here rather than as a
   * column because it is presentation, not business data, and needs no
   * migration to add. Absent means light — a customer-facing page should
   * default to the safer, more familiar surface, and the owner opts into
   * dark deliberately.
   */
  chat_theme?: "light" | "dark";
  /**
   * Marks a tenant as existing only for automated runs. Set by
   * scripts/create-test-tenant.ts and by nothing else — a real business
   * must never carry it. See lib/test-tenant.ts for what it gates.
   */
  is_test?: boolean;
  /**
   * Getting-started checklist state. Only the parts that can't be
   * derived from real data live here — whether the owner has completed
   * their business info or added a knowledge entry is read from those
   * tables directly, so it can never drift out of sync.
   */
  onboarding?: {
    /** Set when the owner copies or opens their chat link. */
    chat_link_copied?: boolean;
    /** Set when the owner hides the checklist early; sticky thereafter. */
    dismissed?: boolean;
  };
};

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((v) => asString(v))
    .filter((v): v is string => v !== undefined);
  return items.length > 0 ? items : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// Normalises whatever is actually in the jsonb column into TenantSettings,
// dropping anything malformed or blank. Empty strings are treated as
// absent so a cleared form field behaves the same as one never filled in.
/**
 * A stored greeting translation, or undefined if it is not intact.
 *
 * Forgiving in the same way as everything else here: a half-written row
 * degrades to "no translation", which falls back to a hand-written one or
 * to English, rather than throwing on a visitor's first paint.
 */
function parseChatIntro(raw: unknown): ChatIntroTranslation | undefined {
  const root = asObject(raw);
  const language = asString(root.language);
  const sourceHash = asString(root.sourceHash);
  const strings = asObject(root.strings);
  if (!language || !sourceHash) return undefined;

  const keys = Object.keys(strings);
  if (keys.length === 0) return undefined;

  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = asString(strings[key]);
    if (value) out[key] = value;
  }
  if (Object.keys(out).length === 0) return undefined;

  const sourceRaw = asObject(root.source);
  const source: Record<string, string> = {};
  for (const key of Object.keys(sourceRaw)) {
    const value = asString(sourceRaw[key]);
    if (value) source[key] = value;
  }

  // The owner's own words for their own categories and city. Free-form
  // keys, because they are keyed by what those things are called.
  const labelsRaw = asObject(root.ownLabels);
  const ownLabels: Record<string, string> = {};
  for (const key of Object.keys(labelsRaw)) {
    const value = asString(labelsRaw[key]);
    if (value) ownLabels[key] = value;
  }

  return {
    // Normalised alongside chat_language. These two are COMPARED to decide
    // whether a cached translation still matches the chosen language, so
    // moving one to codes without the other would mark every approved
    // translation stale and silently fall the greeting back to English.
    language: resolveLanguageCode(language) ?? language,
    sourceHash,
    strings: out as ChatIntroStrings,
    source: source as Partial<Record<ChatIntroKey, string>>,
    approved: root.approved === true,
    ownLabels,
  };
}

export function parseTenantSettings(raw: unknown): TenantSettings {
  const root = asObject(raw);
  const location = asObject(root.location);
  const contact = asObject(root.contact);

  const parsed: TenantSettings = {};

  const address = asString(location.address);
  const city = asString(location.city);
  const country = asString(location.country);
  if (address || city || country) {
    parsed.location = { ...(address && { address }), ...(city && { city }), ...(country && { country }) };
  }

  const phone = asString(contact.phone);
  const whatsapp = asString(contact.whatsapp);
  const email = asString(contact.email);
  const website = asString(contact.website);
  if (phone || whatsapp || email || website) {
    parsed.contact = {
      ...(phone && { phone }),
      ...(whatsapp && { whatsapp }),
      ...(email && { email }),
      ...(website && { website }),
    };
  }

  const openingHours = asString(root.opening_hours);
  if (openingHours) parsed.opening_hours = openingHours;

  // Language fields are normalised to canonical codes HERE, on the single
  // read path, rather than by a migration that would have to be repeated
  // for every row written before it ran. A value that does not resolve is
  // kept exactly as stored: an owner's unusual entry degrades to its old
  // free-text behaviour rather than disappearing.
  const languages = asStringArray(root.languages);
  if (languages) parsed.languages = languages.map((l) => resolveLanguageCode(l) ?? l);

  const leadLanguage = asString(root.lead_language);
  if (leadLanguage) parsed.lead_language = resolveLanguageCode(leadLanguage) ?? leadLanguage;

  const chatLanguage = asString(root.chat_language);
  if (chatLanguage) parsed.chat_language = resolveLanguageCode(chatLanguage) ?? chatLanguage;

  const chatIntro = parseChatIntro(root.chat_intro);
  if (chatIntro) parsed.chat_intro = chatIntro;

  const serviceArea = asString(root.service_area);
  if (serviceArea) parsed.service_area = serviceArea;

  const currency = asString(root.currency);
  if (currency) parsed.currency = currency;

  // Anything other than the two known values is dropped, so a hand-edited
  // row can't put the public page into an undefined theme.
  if (root.chat_theme === "dark" || root.chat_theme === "light") {
    parsed.chat_theme = root.chat_theme;
  }

  // Strictly true, and carried through every save. Automated runs refuse
  // to hold a conversation with a tenant that lacks it (see
  // lib/test-tenant.ts), so a settings round-trip that silently dropped
  // it would lock the test tenant out of its own scripts. There is no UI
  // for this and there should not be: a real tenant acquiring it is the
  // failure the flag exists to prevent.
  if (root.is_test === true) parsed.is_test = true;

  const onboarding = asObject(root.onboarding);
  const chatLinkCopied = onboarding.chat_link_copied === true;
  const dismissed = onboarding.dismissed === true;
  if (chatLinkCopied || dismissed) {
    parsed.onboarding = {
      ...(chatLinkCopied && { chat_link_copied: true }),
      ...(dismissed && { dismissed: true }),
    };
  }

  return parsed;
}

// Suggestions only — industry is free text, so a business that isn't on
// this list can still type its own.
export const INDUSTRY_SUGGESTIONS = [
  "Dental clinic",
  "Medical clinic",
  "Cosmetic surgery clinic",
  "Veterinary clinic",
  "Law firm",
  "Accounting firm",
  "Real estate agency",
  "Gym / fitness studio",
  "Hair & beauty salon",
  "Spa & wellness",
  "Restaurant",
  "Hotel",
  "Driving school",
  "Home renovation",
  "Auto repair",
];
