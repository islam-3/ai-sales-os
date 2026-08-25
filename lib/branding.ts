// Per-tenant visual identity for the public chat page.
//
// Everything here has to survive a tenant that has configured nothing,
// and a tenant that has configured something unwise. The public chat page
// is the product's face to an end customer, so "no logo" and "a pale
// yellow brand colour" both have to still look deliberate.

/**
 * Used whenever a tenant hasn't chosen a colour. A deep, confident blue:
 * it reads as professional across healthcare, legal and trades alike,
 * and holds contrast against white without tuning.
 */
export const DEFAULT_BRAND_COLOR = "#1D4ED8";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** True for exactly the format the database CHECK constraint allows. */
export function isValidBrandColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/**
 * The colour to actually render with. Anything missing or malformed
 * falls back to the default rather than reaching the browser — this runs
 * on values that are interpolated into inline styles on a public page.
 */
export function resolveBrandColor(stored: string | null | undefined): string {
  if (!stored || !isValidBrandColor(stored)) return DEFAULT_BRAND_COLOR;
  return stored;
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Relative luminance per WCAG 2.x, including the sRGB gamma correction.
 *
 * The gamma step matters: a naive average of the raw channels rates
 * mid-tones far too bright and flips the foreground to black on colours
 * that genuinely need white text.
 */
function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Readable text colour to sit ON the brand colour — used for the visitor's
 * message bubbles and the send button.
 *
 * Without this a tenant who picks a pale colour gets white-on-pale text
 * that is effectively invisible, and the person it fails for is the
 * visitor, who has no way to fix it. Whichever of black/white contrasts
 * better wins, so there is no colour that produces unreadable output.
 */
export function foregroundFor(brandColor: string): string {
  const color = resolveBrandColor(brandColor);
  return contrastRatio(color, "#FFFFFF") >= contrastRatio(color, "#111111")
    ? "#FFFFFF"
    : "#111111";
}

/**
 * The brand colour at a given alpha, as an rgba() string.
 *
 * Used for tints — chip backgrounds, focus rings — where a flat brand
 * colour would be overpowering. Returns rgba rather than an 8-digit hex
 * because it's applied via inline styles, and rgba is unambiguous
 * everywhere.
 */
export function brandTint(brandColor: string, alpha: number): string {
  const [r, g, b] = channels(resolveBrandColor(brandColor));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Initials for the logo fallback — at most two characters, taken from the
 * first two words of the business name.
 *
 * A tenant with no logo still gets something that looks intentional in
 * the header rather than an empty box or a broken image icon.
 */
export function monogram(businessName: string): string {
  const words = businessName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
