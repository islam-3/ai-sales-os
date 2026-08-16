-- Links a tenant to the Supabase Auth user who owns it. Nullable because
-- existing tenants (like the demo clinic) predate auth and have no owner
-- yet; on delete set null rather than cascade so removing a user account
-- never silently destroys the tenant's business data.
alter table public.tenants
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
