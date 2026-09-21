import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { parseTenantSettings } from "@/lib/tenant-settings";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { BusinessIdentityForm } from "@/components/dashboard/business/BusinessIdentityForm";
import { BrandingForm } from "@/components/dashboard/business/BrandingForm";
import { LocationContactForm } from "@/components/dashboard/business/LocationContactForm";
import { OperationsForm } from "@/components/dashboard/business/OperationsForm";
import { ChatGreetingCard } from "@/components/dashboard/business/ChatGreetingCard";
import { chipPlanFor, deriveIntroLine } from "@/lib/chat-intro";

// Always fresh — edits here change what the AI says on /chat immediately,
// so a stale view would be actively misleading.
export const dynamic = "force-dynamic";

export default async function BusinessPage() {
  const context = await getCurrentTenant();

  if (!context) {
    return (
      <DashboardMessage>
        We couldn&apos;t find a business for your account. Please log in again.
      </DashboardMessage>
    );
  }

  const { supabase, tenantId, businessName } = context;

  // Read through the session client, so RLS scopes this to the caller's
  // own tenant exactly like every other dashboard query.
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("business_name, industry, description, settings, logo_url, brand_color")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !tenant) {
    return (
      <DashboardMessage>
        We couldn&apos;t load your business details. Please refresh and try again.
      </DashboardMessage>
    );
  }

  const settings = parseTenantSettings(tenant.settings);

  // Which starter chips this tenant actually shows. Reviewing twelve chip
  // labels when a visitor sees four was most of what made the card
  // confusing, and which four depends on this tenant's own categories.
  const { data: categoryRows } = await supabase
    .from("knowledge_base")
    .select("category")
    .eq("tenant_id", tenantId)
    .not("category", "is", null);

  const categories: string[] = [];
  for (const row of categoryRows ?? []) {
    const category = (row as { category: string | null }).category;
    if (category && !categories.includes(category)) categories.push(category);
  }
  const chipPlan = chipPlanFor(categories);
  const introLine = deriveIntroLine(tenant.description ?? null, tenant.business_name ?? "");

  return (
    <DashboardShell
      clinicName={businessName}
      title="Business"
      description="What your AI assistant knows about your business when it talks to visitors."
      contentWidth="narrow"
    >
      <div className="flex flex-col gap-6">
        <BusinessIdentityForm
          initialBusinessName={tenant.business_name ?? ""}
          initialIndustry={tenant.industry ?? ""}
          initialDescription={tenant.description ?? ""}
        />
        <BrandingForm
          businessName={tenant.business_name ?? ""}
          initialLogoUrl={tenant.logo_url ?? null}
          initialBrandColor={tenant.brand_color ?? null}
          initialChatTheme={settings.chat_theme ?? "light"}
        />
        <LocationContactForm initial={settings} />
        <OperationsForm initial={settings} />
        <ChatGreetingCard
          settings={settings}
          businessName={tenant.business_name ?? ""}
          shownChipKeys={chipPlan.keys}
          ownWordChips={chipPlan.ownWords}
          introLine={introLine}
        />
      </div>
    </DashboardShell>
  );
}
