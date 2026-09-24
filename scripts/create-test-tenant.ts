// Creates (or refreshes) the tenant that automated runs are allowed to
// talk to, cloned from a real tenant's BUSINESS data only.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/create-test-tenant.ts
//
// What is copied: industry, description, brand colour, settings, and
// every knowledge_base row including its media and embeddings. That is
// what makes a measurement meaningful — a conversation against an empty
// tenant proves nothing about the real one.
//
// What is never copied: leads, transcripts, sessions, usage. The point of
// this tenant is to be the place that data lands instead.
//
// Safe to re-run. It updates the tenant in place and replaces the
// knowledge base; it never touches the source tenant.

import { TEST_TENANT_SLUG } from "../lib/test-tenant";

const SOURCE_SLUG = process.env.SOURCE_SLUG ?? "prof-clinic";

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");

  const { data: source, error: sourceError } = await supabaseServer
    .from("tenants")
    .select("*")
    .eq("slug", SOURCE_SLUG)
    .single();
  if (sourceError || !source) throw new Error(`source tenant "${SOURCE_SLUG}" not found`);

  // The flag, and a name nobody could mistake for a customer on a leads
  // list or in an admin table.
  const settings = { ...((source.settings ?? {}) as Record<string, unknown>), is_test: true };

  const fields = {
    business_name: "TEST — Prof Clinic (automated runs)",
    industry: source.industry,
    description: source.description,
    brand_color: source.brand_color,
    logo_url: source.logo_url,
    // NOT the owner. Copying it gave one account two tenants, and
    // getCurrentTenant() resolved the dashboard with .maybeSingle(),
    // which errors on two rows — so this project's owner was told their
    // account had no business at all, for a day, on production.
    //
    // The test tenant needs no owner: its chat resolves by slug, and
    // nobody signs in to it. getCurrentTenant() is now robust to this
    // too, but the two mistakes were independent and so are the fixes.
    owner_user_id: null,
    settings,
    // Never inherit billing. A test tenant that looks subscribed would
    // distort every usage and revenue figure it appears in.
    plan_id: "trial",
    subscription_status: "trialing",
    paddle_customer_id: null,
    paddle_subscription_id: null,
    paddle_price_id: null,
    current_period_conversations: 0,
  };

  const { data: existing } = await supabaseServer
    .from("tenants")
    .select("id")
    .eq("slug", TEST_TENANT_SLUG)
    .maybeSingle();

  let tenantId: string;
  if (existing) {
    const { error } = await supabaseServer.from("tenants").update(fields).eq("id", existing.id);
    if (error) throw error;
    tenantId = existing.id;
    console.log(`updated existing test tenant ${TEST_TENANT_SLUG} (${tenantId})`);
  } else {
    const { data, error } = await supabaseServer
      .from("tenants")
      .insert({ ...fields, slug: TEST_TENANT_SLUG })
      .select("id")
      .single();
    if (error) throw error;
    tenantId = data.id;
    console.log(`created test tenant ${TEST_TENANT_SLUG} (${tenantId})`);
  }

  // Knowledge base: replaced wholesale, so re-running tracks the source
  // rather than accumulating two generations of entries.
  const { data: entries, error: kbError } = await supabaseServer
    .from("knowledge_base")
    .select("content, category, title, embedding")
    .eq("tenant_id", source.id);
  if (kbError) throw kbError;

  const { error: clearError } = await supabaseServer
    .from("knowledge_base")
    .delete()
    .eq("tenant_id", tenantId);
  if (clearError) throw clearError;

  if (entries && entries.length > 0) {
    const { error: insertError } = await supabaseServer
      .from("knowledge_base")
      .insert(entries.map((e) => ({ ...e, tenant_id: tenantId })));
    if (insertError) throw insertError;
  }
  console.log(`copied ${entries?.length ?? 0} knowledge base entries`);

  // Proof the guard will actually let scripts through, read back the same
  // way the guard reads it rather than from the object just written.
  const { data: check } = await supabaseServer
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .single();
  const { isTestTenant } = await import("../lib/test-tenant");
  const ok = isTestTenant((check?.settings ?? {}) as { is_test?: boolean });
  console.log(`is_test reads back as: ${ok}`);
  if (!ok) throw new Error("the flag did not persist — scripts would be refused");

  console.log(`\nchat: /chat/${TEST_TENANT_SLUG}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
