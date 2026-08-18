import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { parseTenantSettings } from "@/lib/tenant-settings";
import { DashboardShell, DashboardMessage } from "@/components/dashboard/DashboardShell";
import { BusinessIdentityForm } from "@/components/dashboard/business/BusinessIdentityForm";
import { LocationContactForm } from "@/components/dashboard/business/LocationContactForm";
import { OperationsForm } from "@/components/dashboard/business/OperationsForm";

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
    .select("business_name, industry, description, settings")
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
        <LocationContactForm initial={settings} />
        <OperationsForm initial={settings} />
      </div>
    </DashboardShell>
  );
}
