import type { Config } from "tailwindcss";

// Every color below is written as `hsl(var(--token) / <alpha-value>)`
// rather than `hsl(var(--token))`. The <alpha-value> placeholder is what
// lets Tailwind's opacity modifiers work against CSS variables — without
// it, utilities like `bg-muted/50` or `bg-success/10` silently render at
// full opacity. Tokens are defined in app/globals.css.
const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/ holds class-name maps (STATUS_META, SCORE_TIER_CLASSES in
    // lib/dashboard.ts). Without this glob Tailwind never sees those
    // strings, so the utilities are silently never generated and the
    // badges render unstyled — which is exactly what was happening
    // before this was added.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        // Brand blue — links, focus, selection. Kept separate from
        // `accent` so neutral hover states never pick up colour.
        brand: {
          DEFAULT: "hsl(var(--brand) / <alpha-value>)",
          foreground: "hsl(var(--brand-foreground) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          foreground: "hsl(var(--info-foreground) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        overlay: "hsl(var(--overlay) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      spacing: {
        "page-x": "var(--space-page-x)",
        "page-y": "var(--space-page-y)",
        "section-y": "var(--space-section-y)",
        "card-p": "var(--space-card-p)",
      },
      maxWidth: {
        container: "var(--container-max)",
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "var(--text-xs-lh)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--text-sm-lh)" }],
        base: ["var(--text-base)", { lineHeight: "var(--text-base-lh)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--text-lg-lh)" }],
        xl: ["var(--text-xl)", { lineHeight: "var(--text-xl-lh)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "var(--text-2xl-lh)" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "var(--text-3xl-lh)" }],
      },
      letterSpacing: {
        tight: "var(--tracking-tight)",
        normal: "var(--tracking-normal)",
        wide: "var(--tracking-wide)",
      },
      // The in-var() fallbacks are deliberate. A bare `var(--x)` that
      // resolves to nothing makes the whole font-family declaration
      // invalid at computed-value time, which silently reverts text to
      // the browser's default serif rather than to the next font in the
      // list. The fallback keeps the declaration valid no matter what.
      fontFamily: {
        sans: ["var(--font-geist-sans, ui-sans-serif)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono, ui-monospace)", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
