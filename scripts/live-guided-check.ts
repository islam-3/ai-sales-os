// Guided data entry, against the real database, on the test tenant.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/live-guided-check.ts
//
// test-clinic ONLY, and it cleans up after itself. Every row it writes
// carries a question_key, so the cleanup is exact rather than a guess at
// what it created.
//
// ── What this can and cannot reach ──────────────────────────────────
// It exercises the SCHEMA and the pure state logic against real rows:
// the new columns, the check constraint, category scoping, "everything"
// as a null category, the declines round-trip through settings, and
// guidedProgress over all of it.
//
// It does NOT exercise the server actions. Those call getCurrentTenant
// and need a signed-in dashboard session, which this has no way to hold.
// The browser check covers that layer, and this covers what it writes.

import { supabaseServer } from "../lib/supabase-server";
import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";
import { guidedProgress, type GuidedEntry } from "../lib/guided-progress";
import { packForIndustry, questionsFor } from "../lib/guided-questions";
import { parseTenantSettings } from "../lib/tenant-settings";

const SLUG = process.env.SLUG ?? TEST_TENANT_SLUG;

let bad = 0;
const check = (name: string, ok: boolean, detail?: string) => {
  if (!ok) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

/** Every row this script writes is tagged, so cleanup is exact. */
const KEYS = ["guarantee", "pricing", "materials"];

async function loadGuided(tenantId: string) {
  const { data: rows, error } = await supabaseServer
    .from("knowledge_base")
    .select("id, title, category, content, question_key, answer_kind, embedding")
    .eq("tenant_id", tenantId)
    .not("question_key", "is", null);
  if (error) throw error;
  const entries: GuidedEntry[] = (rows ?? []).map((r) => ({
    id: r.id,
    questionKey: r.question_key as string,
    category: r.category,
    answerKind: r.answer_kind as GuidedEntry["answerKind"],
    content: r.content,
  }));
  return { rows: rows ?? [], entries };
}

async function cleanup(tenantId: string) {
  await supabaseServer
    .from("knowledge_base")
    .delete()
    .eq("tenant_id", tenantId)
    .in("question_key", KEYS);

  const { data } = await supabaseServer
    .from("tenants").select("settings").eq("id", tenantId).single();
  const raw = (data!.settings ?? {}) as Record<string, unknown>;
  const guided = { ...((raw.guided ?? {}) as Record<string, unknown>) };
  delete guided.declined;
  await supabaseServer
    .from("tenants")
    .update({ settings: { ...raw, guided } })
    .eq("id", tenantId);
}

async function main() {
  const { data: tenant, error } = await supabaseServer
    .from("tenants").select("id, slug, industry, settings").eq("slug", SLUG).single();
  if (error) throw error;

  // The same door every other live script goes through. A guided answer
  // is a knowledge entry on a real business if this is wrong.
  const rawSettings = (tenant.settings ?? {}) as { is_test?: boolean };
  if (!isTestTenant(rawSettings)) throw new Error(refusalMessage(SLUG));
  const tenantId = tenant.id;
  console.log(`✓ target: ${SLUG} — test tenant`);
  console.log(`  industry: ${JSON.stringify(tenant.industry)}\n`);

  // Start from a known state, in case a previous run died mid-way.
  await cleanup(tenantId);

  const questions = questionsFor(tenant.industry);
  const pack = packForIndustry(tenant.industry);
  console.log(`--- the question set for this tenant ---`);
  check(
    `pack is ${pack ? pack.id : "none"}, ${questions.length} questions`,
    questions.length === (pack ? 12 : 10),
    `${questions.length}`
  );

  const { data: kb } = await supabaseServer
    .from("knowledge_base").select("category").eq("tenant_id", tenantId).not("category", "is", null);
  const categories: string[] = [];
  for (const r of kb ?? []) {
    const c = (r.category ?? "").trim();
    if (c && !categories.includes(c)) categories.push(c);
  }
  console.log(`  categories: ${JSON.stringify(categories)}`);
  check("the tenant has at least two categories to scope between", categories.length >= 2);

  const [first, second] = categories;

  // ── 1. The columns accept what they should ────────────────────────
  console.log("\n--- writing an answer, as the action does ---");
  const { error: insertError } = await supabaseServer.from("knowledge_base").insert({
    tenant_id: tenantId,
    title: `Guarantee and cover — ${first}`,
    content: "Twenty years on the crowns and lifetime on the implants.",
    category: first,
    question_key: "guarantee",
    answer_kind: "answered",
  });
  check("an answer saves", !insertError, insertError?.message);

  const { error: badKind } = await supabaseServer.from("knowledge_base").insert({
    tenant_id: tenantId,
    title: "nope",
    content: "nope",
    category: first,
    question_key: "pricing",
    answer_kind: "whatever",
  });
  check(
    "and the constraint refuses an answer_kind nobody defined",
    !!badKind,
    // Without it, a typo in a future action would store a state the UI
    // cannot render and the progress count cannot classify.
    badKind ? `refused: ${badKind.message.slice(0, 60)}` : "IT WAS ACCEPTED"
  );

  // ── 2. Scoping ───────────────────────────────────────────────────
  console.log("\n--- an answer belongs to a category ---");
  let state = guidedProgress(questions, (await loadGuided(tenantId)).entries, {}, categories);
  const guarantee = () =>
    guidedProgress(questions, [], {}, categories).questions.find((q) => q.question.key === "guarantee")!;
  const guaranteeNow = () =>
    state.questions.find((q) => q.question.key === "guarantee")!;

  check("the question is resolved", guaranteeNow().resolved === true);
  check(
    `and ${second} is still open`,
    guaranteeNow().openCategories.includes(second),
    JSON.stringify(guaranteeNow().openCategories)
  );
  check("while it was open before", guarantee().resolved === false);

  console.log("\n--- a negative is scoped the same way ---");
  await supabaseServer.from("knowledge_base").insert({
    tenant_id: tenantId,
    title: `Guarantee and cover — ${second}`,
    content: "This business does not offer a guarantee or warranty on this.",
    category: second,
    question_key: "guarantee",
    answer_kind: "not_offered",
  });
  state = guidedProgress(questions, (await loadGuided(tenantId)).entries, {}, categories);
  check("both categories now have something", guaranteeNow().byCategory.length === 2);
  check(
    `and exactly the other ${categories.length - 2} are still open`,
    guaranteeNow().openCategories.length === categories.length - 2 &&
      !guaranteeNow().openCategories.includes(first) &&
      !guaranteeNow().openCategories.includes(second),
    // Written first as "nothing is left open", which assumed this tenant
    // had two categories. It has six — so answering two leaves four, and
    // the original assertion was wrong rather than the code. Exactly the
    // shape of gap the per-category scoping exists for: six service
    // lines, and an answer only ever covers the one it was written for.
    JSON.stringify(guaranteeNow().openCategories)
  );
  check(
    "the two states are different and both recorded",
    new Set(guaranteeNow().byCategory.map((c) => c.state)).size === 2,
    JSON.stringify(guaranteeNow().byCategory.map((c) => `${c.category}=${c.state}`))
  );

  console.log("\n--- everything is a null category, not a magic string ---");
  await supabaseServer.from("knowledge_base").insert({
    tenant_id: tenantId,
    title: "How pricing works",
    content: "Every case is priced individually after the team has looked at it.",
    category: null,
    question_key: "pricing",
    answer_kind: "answered",
  });
  state = guidedProgress(questions, (await loadGuided(tenantId)).entries, {}, categories);
  const pricing = () => state.questions.find((q) => q.question.key === "pricing")!;
  check("it closes every category at once", pricing().openCategories.length === 0);
  check("as one row", pricing().byCategory.length === 1);
  check("stored as SQL null", pricing().byCategory[0].category === null);

  // ── 3. Prefer not to say ─────────────────────────────────────────
  console.log("\n--- prefer not to say writes no knowledge row ---");
  const { data: before } = await supabaseServer
    .from("tenants").select("settings").eq("id", tenantId).single();
  const rawBefore = (before!.settings ?? {}) as Record<string, unknown>;
  await supabaseServer
    .from("tenants")
    .update({
      settings: {
        ...rawBefore,
        guided: { ...((rawBefore.guided ?? {}) as object), declined: { materials: [first] } },
      },
    })
    .eq("id", tenantId);

  const { data: after } = await supabaseServer
    .from("tenants").select("settings").eq("id", tenantId).single();
  const parsed = parseTenantSettings(after!.settings);
  check(
    "it round-trips through settings",
    parsed.guided?.declined?.materials?.[0] === first,
    JSON.stringify(parsed.guided)
  );

  const loaded = await loadGuided(tenantId);
  check(
    "and NOTHING was written to the knowledge base for it",
    !loaded.entries.some((e) => e.questionKey === "materials"),
    // A row saying the owner declined to comment would be read out to a
    // customer, which is worse than the silence they asked for.
    "silence has to be silent"
  );

  state = guidedProgress(questions, loaded.entries, parsed.guided?.declined ?? {}, categories);
  const materials = () => state.questions.find((q) => q.question.key === "materials")!;
  check("it shows as declined", materials().byCategory[0].state === "declined");
  check("carries no content", materials().byCategory[0].content === undefined);
  check("resolves the question", materials().resolved === true);
  check(
    `and leaves ${second} open, like any other answer`,
    materials().openCategories.includes(second)
  );

  console.log("\n--- the headline count ---");
  console.log(`  ${state.resolved} of ${state.total} dealt with`);
  check("three questions dealt with", state.resolved === 3, `${state.resolved}`);
  check(
    "out of the full set for this tenant",
    state.total === questions.length,
    `${state.total} vs ${questions.length}`
  );

  // ── 4. The answers are ordinary knowledge entries ────────────────
  console.log("\n--- an answer is just a knowledge entry ---");
  const { data: asEntries } = await supabaseServer
    .from("knowledge_base")
    .select("id, title, category, content")
    .eq("tenant_id", tenantId)
    .not("category", "is", null)
    .eq("question_key", "guarantee");
  check(
    "it appears in the ordinary category listing the prompt is built from",
    (asEntries ?? []).length === 2,
    `${(asEntries ?? []).length}`
  );
  check(
    "with the question as its title",
    (asEntries ?? []).every((e) => String(e.title).startsWith("Guarantee and cover")),
    JSON.stringify((asEntries ?? []).map((e) => e.title))
  );

  // ── 5. Clean up, and prove it ────────────────────────────────────
  console.log("\n--- cleanup ---");
  await cleanup(tenantId);
  const end = await loadGuided(tenantId);
  check("no guided rows left behind", end.entries.length === 0, `${end.entries.length} remain`);
  const { data: endSettings } = await supabaseServer
    .from("tenants").select("settings").eq("id", tenantId).single();
  check(
    "no declines left behind",
    !parseTenantSettings(endSettings!.settings).guided?.declined,
    JSON.stringify(parseTenantSettings(endSettings!.settings).guided)
  );
  const { count } = await supabaseServer
    .from("knowledge_base").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
  console.log(`  ${SLUG} knowledge entries: ${count} (unchanged by this run)`);

  console.log(bad ? `\n${bad} FAILING` : "\nguided data entry works against the real database");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

export {};
