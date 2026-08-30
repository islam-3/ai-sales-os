import { cn } from "@/lib/utils";

// The Naroxe identity: an "N" monogram drawn as a single continuous
// stroke on a 32-unit grid, optionally paired with the wordmark.
//
// Colour is never set here — the mark strokes with `currentColor` and the
// wordmark inherits — so a parent decides by setting a text colour. That
// is what keeps this reusable on a white card, on a navy surface, and in
// the dark theme without a variant for each. Set `text-naroxe-ink` for
// the standard treatment; it inverts automatically between themes.

type LogoSize = "sm" | "md" | "lg";

// The supplied artwork is drawn on a 32-unit grid, but the stroke only
// occupies x 5.7-26.3 and y 2.2-26.8 within it. That leaves roughly 18%
// dead space on each side and, more awkwardly, puts the art's centre 1.5
// units ABOVE the box centre — so centring the box against text leaves
// the mark itself sitting visibly high and too far from the wordmark.
//
// The viewBox is cropped to the inked bounds (plus 0.2 for antialiasing)
// so the rendered box IS the visible mark. The path data is untouched.
// Padding is then the consumer's decision, which is what a standalone use
// like an avatar tile actually wants.
const MARK_VIEWBOX = "5.5 2 21 25";

// Height only — width follows from the viewBox aspect (0.84), so the box
// never carries empty space into the lockup's gap.
//
// Sized against the wordmark's cap height rather than its font size: a
// monogram reads best slightly taller than the caps beside it, about
// 1.15x. At lg that is a 17.3px cap and a 20px mark.
const MARK_SIZE: Record<LogoSize, string> = {
  sm: "h-3.5 w-auto",
  md: "h-4 w-auto",
  lg: "h-5 w-auto",
};

// Optical centring. With leading-none the line box equals the font size,
// but "Naroxe" has no descenders, so the visible text sits above the line
// box's centre. Centring the mark on that box therefore parks it low by
// about 0.08em; these values put it back.
// Sub-pixel values are deliberate: the correction is under 2px and
// rounding it to whole pixels at the smaller sizes overshoots visibly.
const MARK_NUDGE: Record<LogoSize, string> = {
  sm: "translate-y-[-1px]",
  md: "translate-y-[-1.5px]",
  lg: "translate-y-[-2px]",
};

// Tracked slightly wide at every size: the wordmark is short, and a
// little letter-spacing is what makes it read as a mark rather than as a
// word in a sentence.
const WORDMARK_SIZE: Record<LogoSize, string> = {
  sm: "text-base tracking-[0.01em]",
  md: "text-lg tracking-[0.015em]",
  lg: "text-2xl tracking-[0.02em]",
};

// Applied on BOTH sides of the divider, so this is the padding around
// the rule rather than the whole mark-to-wordmark distance. At lg that
// reads as 8px, rule, 8px.
const GAP: Record<LogoSize, string> = {
  sm: "gap-1.5",
  md: "gap-1.5",
  lg: "gap-2",
};

// A hairline between mark and name. Without it the monogram sits close
// enough to the wordmark to be read as a letter — "N Naroxe" — instead of
// a mark beside a name.
//
// Kept a little shorter than the mark on purpose: a rule matching its
// full height competes with the artwork, and the point is to separate the
// two quietly, not to draw a third element.
const DIVIDER_SIZE: Record<LogoSize, string> = {
  sm: "h-3",
  md: "h-[14px]",
  lg: "h-[18px]",
};

function Mark({
  size,
  className,
  decorative,
}: {
  size: LogoSize;
  className?: string;
  /** True when a visible wordmark sits beside it and already names the brand. */
  decorative: boolean;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={MARK_VIEWBOX}
      fill="none"
      className={cn(MARK_SIZE[size], "shrink-0", className)}
      // Announced once or not at all: when the wordmark is present it
      // carries the name, so repeating it here would read the brand
      // twice to a screen reader.
      {...(decorative
        ? { "aria-hidden": true as const }
        : { role: "img" as const, "aria-label": "Naroxe" })}
    >
      <path
        d="M7 25.5V7L25 25.5V3.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Logo({
  variant = "full",
  size = "md",
  className,
  markClassName,
}: {
  variant?: "full" | "mark" | "wordmark";
  size?: LogoSize;
  className?: string;
  /** Extra classes for the monogram alone, e.g. to tint it differently. */
  markClassName?: string;
}) {
  if (variant === "mark") {
    return <Mark size={size} className={cn(className, markClassName)} decorative={false} />;
  }

  if (variant === "wordmark") {
    return (
      <span className={cn("font-semibold", WORDMARK_SIZE[size], className)}>Naroxe</span>
    );
  }

  return (
    <span className={cn("inline-flex items-center", GAP[size], className)}>
      <Mark
        size={size}
        // Applied here rather than inside Mark: the offset corrects for
        // the wordmark's metrics, so a standalone mark must not inherit it.
        className={cn(MARK_NUDGE[size], markClassName)}
        decorative
      />

      {/* Decorative: it separates the mark from the name visually and has
          nothing to announce. Carries the same nudge as the mark, so the
          monogram, the rule and the wordmark all sit on one optical
          centre rather than the mark and rule drifting against the text. */}
      <span
        aria-hidden
        className={cn(
          "w-px shrink-0 bg-naroxe-silver/70",
          DIVIDER_SIZE[size],
          MARK_NUDGE[size]
        )}
      />
      <span className={cn("font-semibold leading-none", WORDMARK_SIZE[size])}>Naroxe</span>
    </span>
  );
}
