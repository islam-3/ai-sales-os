"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" } = {}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The server has no way to know the visitor's resolved theme, so
  // rendering the icon before mount would guarantee a hydration
  // mismatch. Render a same-sized placeholder instead — that also
  // avoids the header shifting when the real button appears.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Placeholder matches the rendered size in both variants, so neither
    // the header nor the drawer shifts when the real control appears.
    return <div className={variant === "row" ? "h-9 w-full" : "h-8 w-8"} aria-hidden />;
  }

  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  // Full-width labelled row for the mobile drawer: a bare icon in a
  // vertical list of text links reads as decoration rather than a control.
  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isDark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
        {label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
