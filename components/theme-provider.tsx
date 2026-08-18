"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Wraps next-themes so the root layout can stay a Server Component.
// Configured in app/layout.tsx with attribute="class" to match
// tailwind.config.ts's darkMode: ["class"], and defaultTheme="system"
// so a first-time visitor gets their OS preference.
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
