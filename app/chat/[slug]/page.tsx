import { cache } from "react";
import type { Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { resolveTenantBySlug } from "@/lib/resolve-tenant";
import { supabaseServer } from "@/lib/supabase-server";
import { ChatClient } from "@/components/chat/ChatClient";
import { buildChatIntro } from "@/lib/chat-intro";
import { isRtlText, storedGreetingFor } from "@/lib/chat-intro-i18n";
import { unstable_noStore as noStore } from "next/cache";
import { buildChatPalette, CHAT_SURFACE, monogram, type ChatTheme } from "@/lib/branding";
import "./chat.css";

// Loaded here rather than in the root layout so it applies to this route
// only — the dashboard keeps Geist. Weights limited to the three the
// design actually uses, since this page is reached from phone ads and
// every extra file is on the critical path.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--nx-font-sans",
  display: "swap",
});

// Always resolve the slug fresh — a tenant can be created (or renamed)
// after this route is first built, and a stale "not found" would be a
// much worse failure mode than a stale success.
export const dynamic = "force-dynamic";

// ── And never serve a stale GREETING either ──────────────────────────
// force-dynamic alone is about rendering per request; this is about the
// data the render reads. Supabase's client calls fetch, Next patches
// fetch, and a cached tenant row means a business changes its welcome
// message in the dashboard and visitors keep getting the old one with
// nothing in the UI to explain why.
//
// Stated explicitly rather than relied upon. force-dynamic is
// documented to imply no-store for fetches that do not opt in, so these
// two lines should be redundant — and a greeting that was demonstrably
// stale on production is exactly the situation where "should be
// redundant" is not good enough. They cost one uncached read per page
// load, which this page already makes.
export const fetchCache = "force-no-store";
export const revalidate = 0;

// One lookup per request, shared by generateViewport, generateMetadata
// and the page. Each used to make its own; the viewport made it three.
const getTenant = cache(resolveTenantBySlug);

// The business chooses how its own customer-facing page looks, so this
// comes from the tenant's setting and NOT from the visitor's OS
// preference. Absent means light, and so does an unknown link.
function chatThemeOf(tenant: Awaited<ReturnType<typeof resolveTenantBySlug>>): ChatTheme {
  return tenant?.settings.chat_theme === "dark" ? "dark" : "light";
}

/**
 * What the phone draws OUTSIDE the page: the status bar area, the
 * home-indicator strip, the browser's own chrome.
 *
 * viewport-fit=cover lets the page draw under the status bar and the
 * home indicator, which is what makes the env(safe-area-inset-*) padding
 * on the header and composer in chat.css do anything at all. Without it
 * those insets are 0 and iOS fills the strips itself, from the page
 * background.
 *
 * theme-color tints the browser chrome. Both come from the tenant's chat
 * theme, never the device: the bug was a light chat with near-black
 * strips above and below it on a phone in dark mode.
 */
export async function generateViewport({ params }: { params: { slug: string } }): Promise<Viewport> {
  const theme = chatThemeOf(await getTenant(params.slug));
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: CHAT_SURFACE[theme],
    colorScheme: theme,
  };
}

/**
 * The page background, behind the chat, in the chat's colour.
 *
 * The root layout puts every route under next-themes with
 * defaultTheme="system", so on a phone in dark mode <html> gets the
 * "dark" class and globals.css paints <body> near-black. That body is
 * what showed in the safe areas and in any overscroll. A nested page
 * cannot set attributes on <html>, so this states the background
 * directly, from the same CHAT_SURFACE as theme-color. !important
 * because it must beat globals.css whichever class next-themes picked;
 * color-scheme too, so native controls and scrollbars match the chat
 * rather than the device.
 */
function ChatPageBackground({ theme }: { theme: ChatTheme }) {
  const css = `html,body{background-color:${CHAT_SURFACE[theme]}!important;color-scheme:${theme}!important}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

// Distinct knowledge_base categories for this tenant, used to derive the
// starter chips. service_role for the same reason the rest of this flow
// uses it: the visitor is anonymous and has no session.
async function getCategories(tenantId: string): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("knowledge_base")
    .select("category")
    .eq("tenant_id", tenantId)
    .not("category", "is", null);

  if (error) {
    // Chips are a nice-to-have; a failure here must not take the page
    // down. buildChatIntro falls back to generic prompts on an empty list.
    console.error("Failed to load knowledge categories for starter chips:", error);
    return [];
  }

  const seen = new Set<string>();
  const categories: string[] = [];
  for (const row of data ?? []) {
    const category = (row.category ?? "").trim();
    if (!category || seen.has(category.toLowerCase())) continue;
    seen.add(category.toLowerCase());
    categories.push(category);
  }
  return categories;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const tenant = await getTenant(params.slug);
  if (!tenant) return { title: "Chat" };
  return {
    title: `Chat with ${tenant.businessName}`,
    description: tenant.description ?? `Message ${tenant.businessName} directly.`,
  };
}

export default async function ChatPage({ params }: { params: { slug: string } }) {
  const tenant = await getTenant(params.slug);

  if (!tenant) {
    return (
      <div className={`nx-chat ${instrumentSans.variable}`} data-theme="light">
        <ChatPageBackground theme="light" />
        <div className="nx-empty">
          <p>This chat link isn&apos;t valid</p>
          <p>Please double-check the link you were given.</p>
        </div>
      </div>
    );
  }

  // Belt and braces with fetchCache above: this one is per-render rather
  // than per-route, and it is the call Next documents for "never cache
  // what this render reads".
  noStore();

  const categories = await getCategories(tenant.id);

  // Computed on the server so the greeting and chips are in the very first
  // HTML payload — the visitor sees a warm opening immediately, with no
  // loading state and no AI call.
  const intro = buildChatIntro({
    businessName: tenant.businessName,
    industry: tenant.industry,
    description: tenant.description,
    settings: tenant.settings,
    categories,
  });

  // Which language the server THINKS it is greeting in, and whether that
  // came from the owner's own saved words or from our built-in default.
  //
  // Rendered into the page as data attributes because working out why a
  // visitor was greeted in the wrong language took a database dump, a
  // local server and a side-by-side diff — when one request should have
  // answered it. Nothing secret: the greeting itself is public, and this
  // only says which bucket it came out of.
  const greetingLanguage = tenant.settings.chat_language ?? "default";
  const greetingSource = storedGreetingFor(
    tenant.settings.chat_intro?.greetings,
    tenant.settings.chat_language
  )
    ? "owner"
    : "built-in";

  const theme = chatThemeOf(tenant);
  const palette = buildChatPalette(tenant.brandColor, theme);

  // Location first, industry as the fallback — a city tells a visitor
  // something the business name doesn't, and is more reassuring than a
  // category label. Null when neither exists, and the header shows only
  // the online status rather than an empty line.
  const place = [tenant.settings.location?.city, tenant.settings.location?.country]
    .filter(Boolean)
    .join(", ");
  const subline = place || tenant.industry || null;

  // Not a fragment: the attributes have to land on a real element in
  // the HTML, and ChatClient owns its own root.
  return (
    <div data-greeting-language={greetingLanguage} data-greeting-source={greetingSource}>
      <ChatPageBackground theme={theme} />
      <ChatClient
        slug={params.slug}
        businessName={tenant.businessName}
        logoUrl={tenant.logoUrl}
        monogram={monogram(tenant.businessName)}
        theme={theme}
        palette={palette}
        fontClassName={instrumentSans.variable}
        subline={subline}
        // Judged on the greeting itself rather than on a language name:
        // the setting is free text, and "Arabic", the Arabic for it and
        // "ar" are all things an owner might type.
        direction={isRtlText(intro.greeting) ? "rtl" : "ltr"}
        greeting={intro.greeting}
        greetingTitle={intro.title}
        greetingSub={intro.sub}
        starterChips={intro.chips}
      />
    </div>
  );
}
