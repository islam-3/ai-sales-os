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
    // owner_user_id is NOT written on an update. Setting it null here
    // once wiped the dedicated test owner that create-test-owner.ts had
    // created, and the next smoke run failed every dashboard check with
    // "the test tenant has no owner" - one script silently undoing
    // another's work, which is exactly the kind of difference that makes
    // a green run meaningless.
    const { error } = await supabaseServer.from("tenants").update(fields).eq("id", existing.id);
    if (error) throw error;
    tenantId = existing.id;
    console.log(`updated existing test tenant ${TEST_TENANT_SLUG} (${tenantId})`);
  } else {
    const { data, error } = await supabaseServer
      .from("tenants")
      // No owner on creation; scripts/create-test-owner.ts assigns the
      // dedicated account afterwards.
      .insert({ ...fields, slug: TEST_TENANT_SLUG, owner_user_id: null })
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
    .select("id, content, category, title, embedding, knowledge_base_media(media_url, media_type)")
    .eq("tenant_id", source.id);
  if (kbError) throw kbError;

  const { error: clearError } = await supabaseServer
    .from("knowledge_base")
    .delete()
    .eq("tenant_id", tenantId);
  if (clearError) throw clearError;

  let mediaCopied = 0;
  if (entries && entries.length > 0) {
    // The attached PHOTOS come too. Without them the test tenant has 23
    // entries and nothing to show, so the entire media feature - offers,
    // acceptance, the images themselves - is untestable there, and the
    // smoke test reports green on a path it never exercises. That was
    // true for days before anyone noticed.
    const { data: inserted, error: insertError } = await supabaseServer
      .from("knowledge_base")
      .insert(
        entries.map(({ knowledge_base_media: _media, id: _id, ...rest }) => ({
          ...rest,
          tenant_id: tenantId,
        }))
      )
      .select("id, title");
    if (insertError) throw insertError;

    // Matched back by title, which is safe here and nowhere else: both
    // sides are rows we just wrote, in one process, with no language
    // involved.
    const idByTitle = new Map((inserted ?? []).map((r) => [r.title ?? "", r.id]));
    const mediaRows = entries.flatMap((e) => {
      const newId = idByTitle.get(e.title ?? "");
      if (!newId) return [];
      return (e.knowledge_base_media ?? []).map((m) => ({
        tenant_id: tenantId,
        knowledge_base_id: newId,
        media_url: m.media_url,
        media_type: m.media_type,
      }));
    });
    if (mediaRows.length > 0) {
      const { error: mediaError } = await supabaseServer
        .from("knowledge_base_media")
        .insert(mediaRows);
      if (mediaError) throw mediaError;
      mediaCopied = mediaRows.length;
    }
  }
  console.log(`copied ${entries?.length ?? 0} knowledge base entries and ${mediaCopied} photos`);

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
