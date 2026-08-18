"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant } from "@/lib/dashboard-tenant";
import { parseTenantSettings, type TenantSettings } from "@/lib/tenant-settings";

export type BusinessIdentityInput = {
  businessName: string;
  industry: string;
  description: string;
};

// Saves the typed identity columns. Scoped with .eq("tenant_id"-equivalent)
// via the session client, so RLS plus the explicit id filter both have to
// agree the caller owns this row.
export async function updateBusinessIdentity(input: BusinessIdentityInput): Promise<void> {
  const businessName = input.businessName.trim();
  if (!businessName) throw new Error("Business name is required");

  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("tenants")
    .update({
      business_name: businessName,
      // Empty inputs are stored as null rather than "", so the prompt
      // builder's "is this present?" checks stay simple.
      industry: input.industry.trim() || null,
      description: input.description.trim() || null,
    })
    .eq("id", tenantId);

  if (error) {
    console.error("Failed to update business identity:", error);
    throw new Error("Failed to save business details");
  }

  revalidatePath("/dashboard/business");
  // The header and chat page both render business_name, so they need to
  // pick up a rename too.
  revalidatePath("/dashboard", "layout");
}

// Merges a partial settings object over whatever is already stored, so
// each card on the page can save independently without clobbering fields
// owned by the other cards.
export async function updateBusinessSettings(patch: TenantSettings): Promise<void> {
  const context = await getCurrentTenant();
  if (!context) throw new Error("You must be signed in to do this");
  const { supabase, tenantId } = context;

  const { data: current, error: readError } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (readError || !current) {
    console.error("Failed to read current settings:", readError);
    throw new Error("Failed to save business details");
  }

  // Re-parsed on the way out so anything malformed already in the column
  // is normalised rather than merged forward.
  const merged = parseTenantSettings({ ...parseTenantSettings(current.settings), ...patch });

  const { error } = await supabase.from("tenants").update({ settings: merged }).eq("id", tenantId);

  if (error) {
    console.error("Failed to update business settings:", error);
    throw new Error("Failed to save business details");
  }

  revalidatePath("/dashboard/business");
}
