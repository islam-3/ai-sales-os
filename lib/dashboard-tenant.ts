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
  /**
   * How many businesses this account owns, almost always 1.
   *
   * Exposed so the UI can say so when it is more than that. Choosing one
   * silently would be the worse bug: an owner would manage one location,
   * never see the other's leads, and have nothing to tell them why.
   */
  ownedCount: number;
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

  // Ordered and unbounded, NOT .maybeSingle().
  //
  // maybeSingle() tolerates zero rows but ERRORS on two, and the line
  // below turns any error into "no business for your account". So an
  // owner with two businesses was not shown one of them — they were
  // locked out of the dashboard entirely, told their account had nothing,
  // with no way to tell a data condition from a broken login. That
  // happened, to this project's own owner, for a day.
  //
  // Oldest first, and id as a tiebreak so the choice is total even if two
  // rows share a timestamp. Stability is the property that matters: the
  // dashboard must not show a different business because a query came
  // back in a different order.
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, business_name, slug")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error || !tenants || tenants.length === 0) return null;

  const tenant = tenants[0];

  return {
    supabase,
    tenantId: tenant.id,
    businessName: tenant.business_name,
    slug: tenant.slug,
    user,
    ownedCount: tenants.length,
  };
}
