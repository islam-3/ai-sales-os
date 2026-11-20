// Create test-realty, the second (non-clinic) test tenant, with its 12 entries.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/create-realty-tenant.ts
//       (dry: prints what it would write, writes nothing)
//   APPLY=1 ...   (creates it; refuses if test-realty already exists)
//
// Approved as written in docs/second-test-tenant-proposal-2026-11-19.md.
// The legal and tax figures are illustrative: this is a test tenant.
//
// is_test is set, so every test-only switch works here and nothing else
// does. No owner: owner_user_id is nullable, and nobody signs in to it.
// Each entry is embedded with OpenAI (about $0.001 for all twelve),
// metered as knowledge_embedding against this tenant.

import { REALTY_SLUG } from "./_realty-cases";

const TENANT = {
  slug: REALTY_SLUG,
  business_name: "TEST — Bosphorus Key Realty (automated runs)",
  industry: "Real estate agency",
  description:
    "We help international buyers and renters find apartments and villas in Istanbul, from Beşiktaş and Sarıyer on the European side to Kadıköy on the Asian side. Our team speaks English, Arabic, Russian and Turkish, arranges viewings in person or by video, and handles the title deed (tapu) process and residence permit paperwork for buyers.",
  settings: {
    is_test: true,
    location: { address: "Büyükdere Cad. 185, Levent", city: "Istanbul", country: "Turkey" },
    chat_language: "en",
    lead_language: "Turkish",
    languages: ["English", "Arabic", "Russian", "Turkish"],
    opening_hours: "Mon–Sat 09:00–19:00",
    contact: { whatsapp: "+90 212 555 01 47" },
    chat_intro: {
      greetings: {
        en: {
          text: "Welcome to Bosphorus Key Realty in Istanbul. We help international buyers and renters find apartments and villas, with viewings in person or by video. How can we help?",
          chips: ["Buy an apartment", "Rent", "Citizenship by investment", "Arrange a viewing"],
          approved: true,
          origin: "suggested",
        },
      },
    },
  },
};

const ENTRIES: { category: string; title: string; content: string }[] = [
  { category: "About the business", title: "About us", content: "Founded in 2012. 14 consultants, with offices in Levent. More than 1,200 homes sold to buyers from 40 countries. Members of the Istanbul real estate association (İSTEMDER)." },
  { category: "Areas", title: "Areas we cover", content: "Beşiktaş and Şişli are central, from about USD 4,500 per m². Sarıyer has Bosphorus views, from about USD 6,000 per m². Kadıköy, on the Asian side, starts from about USD 3,500 per m². Başakşehir and Beylikdüzü have new-build family compounds, from about USD 1,800 per m²." },
  { category: "Buying", title: "Buying as a foreigner, step by step", content: "Choose the home. Sign a reservation agreement with a 5% deposit. Get a Turkish tax number and a bank account; we take you to both. A government appraisal report (ekspertiz) is required for foreign buyers. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. DASK earthquake insurance is arranged before the transfer." },
  { category: "Buying", title: "Costs on top of the price", content: "The title deed fee is 4% of the declared value. Our commission is 2% plus VAT. The appraisal report costs about USD 300, and a sworn translator at the Land Registry about USD 150." },
  { category: "Citizenship by investment", title: "Citizenship by investment", content: "Turkish citizenship requires property worth at least USD 400,000, kept for 3 years. The application takes about 6–9 months after the title deed. We work with a partner law firm, Aydın & Partners, for the application." },
  { category: "Residence permit", title: "Residence permit through property", content: "A home worth at least USD 200,000 in Istanbul qualifies the buyer for a short-term residence permit, renewed every 1–2 years." },
  { category: "Rentals", title: "Renting", content: "Rental contracts run for at least 12 months. The deposit is one to two months' rent, and our fee is one month's rent. We do not handle short-term or holiday lets." },
  { category: "Viewings", title: "Viewings and viewing trips", content: "Viewings in person Monday to Saturday, or live by video on WhatsApp. For buyers flying in, we plan a 2–3 day viewing trip with airport pickup and up to 10 viewings." },
  { category: "New-build", title: "New-build and off-plan", content: "Developers offer payment plans of up to 36 months without interest on off-plan homes. Handover dates are written into the contract." },
  { category: "Buying", title: "Earthquake safety", content: "We recommend buildings permitted after the 2000 building regulations, and give every buyer the building's permit year and an engineer's report before reservation." },
  { category: "After-sales", title: "After the purchase", content: "Furnishing packages start from USD 8,000 for a two-bedroom flat. For owners who rent out, our property management costs 8% of the rent." },
  { category: "Buying", title: "Mortgages", content: "Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full." },
];

async function main() {
  const apply = process.env.APPLY === "1";
  console.log(`${apply ? "APPLY" : "dry run"}: tenant ${TENANT.slug} (${TENANT.business_name}), ${ENTRIES.length} entries`);
  for (const e of ENTRIES) console.log(`  [${e.category}] ${e.title}: ${e.content.length} chars`);
  if (!apply) {
    console.log("dry: nothing written. Set APPLY=1 to create it.");
    return;
  }
  const { supabaseServer: s } = await import("../lib/supabase-server");
  const { generateEmbedding } = await import("../lib/embeddings");
  const { embeddingTextFor } = await import("../lib/knowledge-base");
  const { data: existing } = await s.from("tenants").select("id").eq("slug", TENANT.slug);
  if ((existing ?? []).length) throw new Error(`${TENANT.slug} already exists; refusing to create it twice`);

  const { data: tenant, error } = await s.from("tenants").insert(TENANT).select("id").single();
  if (error || !tenant) throw new Error(`tenant insert failed: ${error?.message}`);
  console.log(`created tenant ${tenant.id}`);

  for (const e of ENTRIES) {
    // The same text the dashboard embeds when an owner saves an entry.
    const embedding = await generateEmbedding(embeddingTextFor(e), tenant.id);
    const { error: kbError } = await s.from("knowledge_base").insert({ tenant_id: tenant.id, category: e.category, title: e.title, content: e.content, embedding });
    if (kbError) throw new Error(`entry "${e.title}" failed: ${kbError.message}. Tenant ${tenant.id} exists with the entries before it.`);
    console.log(`  + ${e.title}`);
  }
  const { data: check } = await s.from("knowledge_base").select("id, embedding").eq("tenant_id", tenant.id);
  const embedded = (check ?? []).filter((r) => r.embedding).length;
  console.log(`verified: ${check?.length ?? 0} entries, ${embedded} with an embedding`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
