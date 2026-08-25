import { resolveTenantBySlug } from "@/lib/resolve-tenant";
import { supabaseServer } from "@/lib/supabase-server";
import { ChatClient } from "@/components/chat/ChatClient";
import { buildChatIntro } from "@/lib/chat-intro";
import { resolveBrandColor } from "@/lib/branding";

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
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-neutral-50 px-6 text-center">
        <p className="text-base font-semibold text-neutral-900">This chat link isn&apos;t valid</p>
        <p className="mt-1.5 text-sm text-neutral-500">
          Please double-check the link you were given.
        </p>
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

  // Location first, industry as the fallback — a city tells a visitor
  // something the business name doesn't, and is more reassuring than a
  // category label. Null when neither exists, and the header omits the
  // line entirely rather than showing a gap.
  const place = [tenant.settings.location?.city, tenant.settings.location?.country]
    .filter(Boolean)
    .join(", ");
  const subline = place || tenant.industry || null;

  return (
    <ChatClient
      slug={params.slug}
      businessName={tenant.businessName}
      logoUrl={tenant.logoUrl}
      brandColor={resolveBrandColor(tenant.brandColor)}
      subline={subline}
      greeting={intro.greeting}
      starterChips={intro.chips}
    />
  );
}
