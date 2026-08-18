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
  contact?: {
    phone?: string;
    whatsapp?: string;
    email?: string;
    website?: string;
  };
  service_area?: string;
  /** Currency prices are quoted in, e.g. "USD", "EUR", "TRY". */
  currency?: string;
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

  const languages = asStringArray(root.languages);
  if (languages) parsed.languages = languages;

  const serviceArea = asString(root.service_area);
  if (serviceArea) parsed.service_area = serviceArea;

  const currency = asString(root.currency);
  if (currency) parsed.currency = currency;

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
