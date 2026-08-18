import type { User } from "@supabase/supabase-js";
import { createSessionClient, type SessionClient } from "./supabase-session";

export type DashboardContext = {
  supabase: SessionClient;
  tenantId: string;
  businessName: string;
  slug: string;
  /**
   * The signed-in Auth user. Returned here because getCurrentTenant()
   * already fetches it to resolve the tenant — the profile page needs the
   * email and user_metadata, and this saves a second round trip.
   */
  user: User;
};

// Resolves the tenant owned by the currently signed-in user, replacing
// the old hardcoded TENANT_ID constant for everything under
// app/dashboard/**. The returned client is session-bound (anon key), so
// every subsequent query made with it is subject to the RLS policies in
// supabase/migrations/20260814000001_add_rls_policies_for_dashboard_owner_access.sql
// — it can only ever see/touch rows belonging to this same tenant.
//
// Returns null if there's no signed-in user or they don't own a tenant.
// middleware.ts already redirects unauthenticated requests to /login
// before they reach anything under /dashboard, so the "no user" case
// shouldn't normally happen here — this stays defensive rather than
// assuming that always holds.
export async function getCurrentTenant(): Promise<DashboardContext | null> {
  const supabase = createSessionClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id, business_name, slug")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error || !tenant) return null;

  return {
    supabase,
    tenantId: tenant.id,
    businessName: tenant.business_name,
    slug: tenant.slug,
    user,
  };
}
