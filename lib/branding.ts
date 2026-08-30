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

// ─────────────────────────────────────────────────────────────────────
// Chat palette
//
// The public chat renders in a per-tenant light or dark theme, and its
// accent is whatever colour the owner picked. That combination is why
// these need real colour maths rather than fixed values: a navy chosen
// for a white page is nearly invisible on a near-black one, and a pale
// yellow needs dark text on top in both.
// ─────────────────────────────────────────────────────────────────────

export type ChatTheme = "light" | "dark";

function rgbToHsl(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return [0, 0, l * 100];

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = 60 * (((g - b) / delta) % 6);
  else if (max === g) h = 60 * ((b - r) / delta + 2);
  else h = 60 * ((r - g) / delta + 4);
  if (h < 0) h += 360;

  return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = Math.min(100, Math.max(0, s)) / 100;
  const lN = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;

  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/** Same hue and saturation, lightness moved by `delta` percentage points. */
export function adjustLightness(hex: string, delta: number): string {
  const [h, s, l] = rgbToHsl(resolveBrandColor(hex));
  return hslToHex(h, s, l + delta);
}

/** Same hue, lightness pinned to an absolute value. */
export function withLightness(hex: string, lightness: number): string {
  const [h, s] = rgbToHsl(resolveBrandColor(hex));
  return hslToHex(h, s, lightness);
}

export type ChatPalette = Record<string, string>;

/**
 * The tenant-specific half of the chat's token set, returned as CSS custom
 * properties to be set inline on the chat root. Everything else lives in
 * chat.css.
 *
 * On dark the accent is stepped up in lightness, as the design handoff
 * calls for — an accent tuned against white sinks into a #0D1112 surface
 * otherwise. `--nx-brand-mark` goes further still, because it colours the
 * typing dots and the monogram glyph, which sit ON the dark bubble rather
 * than on the accent.
 */
export function buildChatPalette(brandColor: string | null, theme: ChatTheme): ChatPalette {
  const base = resolveBrandColor(brandColor);

  if (theme === "dark") {
    const brand = adjustLightness(base, 8);
    const mark = withLightness(base, 62);
    return {
      "--nx-brand": brand,
      "--nx-brand-hover": adjustLightness(base, 13),
      "--nx-brand-mark": mark,
      "--nx-on-brand": foregroundFor(brand),
      "--nx-brand-focus": brandTint(brand, 0.5),
      "--nx-chip-fg": withLightness(base, 76),
      "--nx-chip-bg-hv": brandTint(mark, 0.12),
      "--nx-sh-user": `0 12px 30px ${brandTint(brand, 0.35)}`,
      "--nx-sh-send": `0 10px 24px ${brandTint(brand, 0.5)}`,
      "--nx-sh-avatar": `0 6px 18px ${brandTint(brand, 0.45)}`,
    };
  }

  return {
    "--nx-brand": base,
    "--nx-brand-hover": adjustLightness(base, 6),
    "--nx-brand-mark": base,
    "--nx-on-brand": foregroundFor(base),
    "--nx-brand-focus": brandTint(base, 0.45),
    "--nx-chip-fg": base,
    "--nx-chip-bg-hv": brandTint(base, 0.05),
    "--nx-sh-user": `0 10px 26px ${brandTint(base, 0.26)}, 0 1px 2px ${brandTint(base, 0.14)}`,
    "--nx-sh-send": `0 8px 18px ${brandTint(base, 0.32)}`,
    "--nx-sh-avatar": `0 4px 12px ${brandTint(base, 0.26)}`,
  };
}
