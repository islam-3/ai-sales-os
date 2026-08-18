import { supabaseServer } from "./supabase-server";
import { parseTenantSettings, type TenantSettings } from "./tenant-settings";

export type ResolvedTenant = {
  id: string;
  businessName: string;
  industry: string | null;
  description: string | null;
  settings: TenantSettings;
};

// Looks up a tenant by its public slug — the one shared lookup used by
// /chat/[slug]'s page and both of its API routes (chat, upload). Uses
// supabaseServer (service_role) deliberately: this serves anonymous chat
// visitors with no session, the same category as the rest of the /chat
// flow, so it must be able to find any tenant regardless of who's asking.
//
// Returns null if the slug doesn't match any tenant — every caller must
// treat that as "not found" and show a clear error, never fall back to
// any default tenant.
export async function resolveTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  const { data, error } = await supabaseServer
    .from("tenants")
    .select("id, business_name, industry, description, settings")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Failed to resolve tenant by slug:", error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    businessName: data.business_name,
    industry: data.industry ?? null,
    description: data.description ?? null,
    settings: parseTenantSettings(data.settings),
  };
}
