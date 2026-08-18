import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AI Sales OS",
  description: "Lead qualification and CRM for growing businesses.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the
    // theme class on <html> in a pre-paint script, before React
    // hydrates, so the server and client markup intentionally differ
    // on this one element.
    //
    // The font variables must be declared on <html>, not <body>:
    // Tailwind's preflight sets `font-family` on <html>, so if
    // --font-geist-sans were only defined on <body> the var() would be
    // undefined at that level, invalidating the whole declaration and
    // silently falling back to the browser's default serif.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
