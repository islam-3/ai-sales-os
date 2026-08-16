-- RLS policies for the anon-key client used by the dashboard (signed in as
-- a real Supabase Auth user). The /chat route uses the service_role client
-- and bypasses RLS entirely, so these only need to cover a logged-in
-- tenant owner reading/writing their own tenant's data.
--
-- Every policy below is scoped `to authenticated` — the built-in Postgres
-- role PostgREST uses when a request carries a valid user JWT. The `anon`
-- role (no session) matches none of these policies, and since RLS is
-- already enabled on all five tables with no anon policies, unauthenticated
-- requests get zero access, full stop.
--
-- tenants is checked directly via owner_user_id; the other four tables
-- have their own tenant_id column, checked via an EXISTS against tenants
-- owned by auth.uid().

-- ── tenants ──────────────────────────────────────────────────────────────
create policy "tenants_select_own"
  on public.tenants for select
  to authenticated
  using (owner_user_id = auth.uid());

create policy "tenants_insert_own"
  on public.tenants for insert
  to authenticated
  with check (owner_user_id = auth.uid());

create policy "tenants_update_own"
  on public.tenants for update
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "tenants_delete_own"
  on public.tenants for delete
  to authenticated
  using (owner_user_id = auth.uid());

-- ── knowledge_base ───────────────────────────────────────────────────────
create policy "knowledge_base_select_own_tenant"
  on public.knowledge_base for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "knowledge_base_insert_own_tenant"
  on public.knowledge_base for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "knowledge_base_update_own_tenant"
  on public.knowledge_base for update
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base.tenant_id
        and t.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "knowledge_base_delete_own_tenant"
  on public.knowledge_base for delete
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

-- ── knowledge_base_media ─────────────────────────────────────────────────
create policy "knowledge_base_media_select_own_tenant"
  on public.knowledge_base_media for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base_media.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "knowledge_base_media_insert_own_tenant"
  on public.knowledge_base_media for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base_media.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "knowledge_base_media_update_own_tenant"
  on public.knowledge_base_media for update
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base_media.tenant_id
        and t.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base_media.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "knowledge_base_media_delete_own_tenant"
  on public.knowledge_base_media for delete
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = knowledge_base_media.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

-- ── conversations ────────────────────────────────────────────────────────
create policy "conversations_select_own_tenant"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = conversations.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "conversations_insert_own_tenant"
  on public.conversations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = conversations.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "conversations_update_own_tenant"
  on public.conversations for update
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = conversations.tenant_id
        and t.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = conversations.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "conversations_delete_own_tenant"
  on public.conversations for delete
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = conversations.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

-- ── lead_profile ─────────────────────────────────────────────────────────
create policy "lead_profile_select_own_tenant"
  on public.lead_profile for select
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = lead_profile.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "lead_profile_insert_own_tenant"
  on public.lead_profile for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = lead_profile.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "lead_profile_update_own_tenant"
  on public.lead_profile for update
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = lead_profile.tenant_id
        and t.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tenants t
      where t.id = lead_profile.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );

create policy "lead_profile_delete_own_tenant"
  on public.lead_profile for delete
  to authenticated
  using (
    exists (
      select 1 from public.tenants t
      where t.id = lead_profile.tenant_id
        and t.owner_user_id = auth.uid()
    )
  );
