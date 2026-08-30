import { Instrument_Sans } from "next/font/google";
import { resolveTenantBySlug } from "@/lib/resolve-tenant";
import { supabaseServer } from "@/lib/supabase-server";
import { ChatClient } from "@/components/chat/ChatClient";
import { buildChatIntro } from "@/lib/chat-intro";
import { buildChatPalette, monogram, type ChatTheme } from "@/lib/branding";
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
  const tenant = await resolveTenantBySlug(params.slug);
  if (!tenant) return { title: "Chat" };
  return {
    title: `Chat with ${tenant.businessName}`,
    description: tenant.description ?? `Message ${tenant.businessName} directly.`,
  };
}

export default async function ChatPage({ params }: { params: { slug: string } }) {
  const tenant = await resolveTenantBySlug(params.slug);

  if (!tenant) {
    return (
      <div className={`nx-chat ${instrumentSans.variable}`} data-theme="light">
        <div className="nx-empty">
          <p>This chat link isn&apos;t valid</p>
          <p>Please double-check the link you were given.</p>
        </div>
      </div>
    );
  }

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

  // The business chooses how its own customer-facing page looks, so this
  // comes from the tenant's setting and NOT from the visitor's OS
  // preference. Absent means light.
  const theme: ChatTheme = tenant.settings.chat_theme === "dark" ? "dark" : "light";
  const palette = buildChatPalette(tenant.brandColor, theme);

  // Location first, industry as the fallback — a city tells a visitor
  // something the business name doesn't, and is more reassuring than a
  // category label. Null when neither exists, and the header shows only
  // the online status rather than an empty line.
  const place = [tenant.settings.location?.city, tenant.settings.location?.country]
    .filter(Boolean)
    .join(", ");
  const subline = place || tenant.industry || null;

  return (
    <ChatClient
      slug={params.slug}
      businessName={tenant.businessName}
      logoUrl={tenant.logoUrl}
      monogram={monogram(tenant.businessName)}
      theme={theme}
      palette={palette}
      fontClassName={instrumentSans.variable}
      subline={subline}
      greeting={intro.greeting}
      greetingTitle={intro.title}
      greetingSub={intro.sub}
      starterChips={intro.chips}
    />
  );
}
