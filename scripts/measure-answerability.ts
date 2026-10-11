// Can we tell, structurally, that the knowledge base cannot answer a
// question — without reading the reply?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-answerability.ts
//
// The proposed detector: embed the visitor's turn, take the best cosine
// similarity against the tenant's stored entry embeddings, and call it
// unanswered when nothing clears a bar. No model involved, nothing read
// from the reply.
//
// Whether that works is a measurement, not an opinion. Two things have
// to hold:
//
//   1. questions the knowledge base CAN answer must score higher than
//      ones it cannot, with a gap wide enough to put a bar in;
//   2. it has to hold for a visitor writing Arabic, Russian or Turkish —
//      and the README already records that embedding MAGNITUDE is
//      language-bound (0.55 English vs 0.17 Arabic for the same
//      meaning) even though RANKING survives. If that applies here, one
//      absolute bar cannot work and the design has to change.
//
// test-clinic only.

import { supabaseServer } from "../lib/supabase-server";
import { isTestTenant, refusalMessage, TEST_TENANT_SLUG } from "../lib/test-tenant";
import { generateEmbedding } from "../lib/embeddings";
import { cosineSimilarity, parseEmbedding } from "../lib/vectors";

const SLUG = process.env.SLUG ?? TEST_TENANT_SLUG;

type Probe = { answerable: boolean; en: string; ar: string; ru: string; tr: string };

/**
 * Labelled by hand against what test-clinic's entries actually contain.
 *
 * ANSWERABLE ones have a specific entry behind them: "The warranty",
 * "Implants brand", "Crowns brand", "The duration...", "The package",
 * "Teeth Whitening", "Hair transplant for female".
 *
 * UNANSWERABLE ones are the gaps found by auditing that knowledge base —
 * price, financing, who the doctors are, what happens if it fails, age
 * limits. Nothing in the twenty-three entries addresses any of them.
 */
const PROBES: Probe[] = [
  {
    answerable: true,
    en: "what warranty do you give on the crowns?",
    ar: "ما هو الضمان على التيجان؟",
    ru: "какая гарантия на коронки?",
    tr: "kronlar için garanti nedir?",
  },
  {
    answerable: true,
    en: "which implant brand do you use?",
    ar: "ما نوع الغرسات التي تستخدمونها؟",
    ru: "какие импланты вы используете?",
    tr: "hangi implant markasını kullanıyorsunuz?",
  },
  {
    answerable: true,
    en: "which crowns do you use?",
    ar: "ما نوع التيجان التي تستخدمونها؟",
    ru: "какие коронки вы используете?",
    tr: "hangi kronları kullanıyorsunuz?",
  },
  {
    answerable: true,
    en: "how many visits does the implant treatment take?",
    ar: "كم زيارة تحتاج زراعة الأسنان؟",
    ru: "сколько визитов нужно для имплантации?",
    tr: "implant tedavisi kaç ziyaret sürüyor?",
  },
  {
    answerable: true,
    en: "what does the package include?",
    ar: "ماذا يشمل الباقة؟",
    ru: "что входит в пакет?",
    tr: "pakete neler dahil?",
  },
  {
    answerable: true,
    en: "do you do teeth whitening?",
    ar: "هل تقومون بتبييض الأسنان؟",
    ru: "вы делаете отбеливание зубов?",
    tr: "diş beyazlatma yapıyor musunuz?",
  },
  {
    answerable: true,
    en: "do you do hair transplants for women?",
    ar: "هل تقومون بزراعة الشعر للنساء؟",
    ru: "вы делаете пересадку волос женщинам?",
    tr: "kadınlara saç ekimi yapıyor musunuz?",
  },
  {
    answerable: false,
    en: "how much do dental implants cost?",
    ar: "كم تكلفة زراعة الأسنان؟",
    ru: "сколько стоит имплантация зубов?",
    tr: "diş implantı ne kadar?",
  },
  {
    answerable: false,
    en: "do you offer payment plans or financing?",
    ar: "هل يمكن الدفع على أقساط؟",
    ru: "можно ли оплатить в рассрочку?",
    tr: "taksitle ödeme imkanı var mı?",
  },
  {
    answerable: false,
    en: "who are the doctors and what are their qualifications?",
    ar: "من هم الأطباء وما هي مؤهلاتهم؟",
    ru: "кто врачи и какая у них квалификация?",
    tr: "doktorlar kim ve nitelikleri neler?",
  },
  {
    answerable: false,
    en: "what happens if an implant fails after I go home?",
    ar: "ماذا يحدث إذا فشلت الغرسة بعد عودتي إلى بلدي؟",
    ru: "что будет, если имплант не приживётся после возвращения домой?",
    tr: "eve döndükten sonra implant başarısız olursa ne olur?",
  },
  {
    answerable: false,
    en: "is there an age limit for treatment?",
    ar: "هل هناك حد للعمر للعلاج؟",
    ru: "есть ли возрастные ограничения?",
    tr: "tedavi için yaş sınırı var mı?",
  },
  {
    answerable: false,
    en: "is there parking at the clinic?",
    ar: "هل يوجد موقف سيارات في العيادة؟",
    ru: "есть ли парковка у клиники?",
    tr: "klinikte otopark var mı?",
  },
  {
    answerable: false,
    en: "do you accept insurance?",
    ar: "هل تقبلون التأمين الصحي؟",
    ru: "вы принимаете страховку?",
    tr: "sigorta kabul ediyor musunuz?",
  },
];

const LANGS = ["en", "ar", "ru", "tr"] as const;

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return {
    min: s[0] ?? 0,
    max: s[s.length - 1] ?? 0,
    median: s[Math.floor(s.length / 2)] ?? 0,
  };
}

async function main() {
  const { data: tenant, error } = await supabaseServer
    .from("tenants").select("id, settings").eq("slug", SLUG).single();
  if (error) throw error;
  if (!isTestTenant((tenant.settings ?? {}) as { is_test?: boolean })) {
    throw new Error(refusalMessage(SLUG));
  }

  const { data: rows } = await supabaseServer
    .from("knowledge_base")
    .select("title, content, embedding")
    .eq("tenant_id", tenant.id);
  const vectors = (rows ?? [])
    .map((r) => parseEmbedding(r.embedding))
    .filter((v): v is number[] => !!v && v.length > 0);

  console.log(`${SLUG}: ${(rows ?? []).length} entries, ${vectors.length} embedded\n`);

  const best = async (text: string) => {
    const q = await generateEmbedding(text);
    return vectors.reduce((m, v) => Math.max(m, cosineSimilarity(q, v)), 0);
  };

  const scores: Record<string, { answerable: number[]; unanswerable: number[] }> = {};

  for (const lang of LANGS) {
    scores[lang] = { answerable: [], unanswerable: [] };
    console.log(`── ${lang} ──`);
    for (const p of PROBES) {
      const score = await best(p[lang]);
      (p.answerable ? scores[lang].answerable : scores[lang].unanswerable).push(score);
      console.log(
        `  ${p.answerable ? "CAN  " : "can't"} ${score.toFixed(3)}  ${p[lang].slice(0, 52)}`
      );
    }
    console.log();
  }

  console.log("═".repeat(66));
  console.log("  Does a bar separate them?");
  console.log("═".repeat(66));
  for (const lang of LANGS) {
    const a = stats(scores[lang].answerable);
    const u = stats(scores[lang].unanswerable);
    const separable = u.max < a.min;
    console.log(
      `  ${lang}  answerable ${a.min.toFixed(3)}–${a.max.toFixed(3)} (med ${a.median.toFixed(3)})` +
        `   unanswerable ${u.min.toFixed(3)}–${u.max.toFixed(3)} (med ${u.median.toFixed(3)})` +
        `   ${separable ? `CLEAN GAP, bar anywhere in ${u.max.toFixed(3)}–${a.min.toFixed(3)}` : "OVERLAP"}`
    );
  }

  console.log("\n  And does ONE bar work across all four languages?");
  const allA = LANGS.flatMap((l) => scores[l].answerable);
  const allU = LANGS.flatMap((l) => scores[l].unanswerable);
  const a = stats(allA);
  const u = stats(allU);
  console.log(`    answerable   ${a.min.toFixed(3)}–${a.max.toFixed(3)}`);
  console.log(`    unanswerable ${u.min.toFixed(3)}–${u.max.toFixed(3)}`);
  console.log(
    u.max < a.min
      ? `    ONE ABSOLUTE BAR WORKS, anywhere in ${u.max.toFixed(3)}–${a.min.toFixed(3)}`
      : `    NO SINGLE ABSOLUTE BAR — they overlap by ${(u.max - a.min).toFixed(3)}`
  );

  // Per-language bars, if one global bar fails.
  console.log("\n  Per-language bars, if that is the answer:");
  for (const lang of LANGS) {
    const la = stats(scores[lang].answerable);
    const lu = stats(scores[lang].unanswerable);
    console.log(
      `    ${lang}  ${lu.max < la.min ? `bar ${((lu.max + la.min) / 2).toFixed(3)}` : "unusable — overlap"}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
