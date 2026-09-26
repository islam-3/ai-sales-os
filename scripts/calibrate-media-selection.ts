// What actually separates the right photo from the wrong one?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/calibrate-media-selection.ts
//
// Not a guess. This embeds real visitor sentences in six languages,
// compares them against the REAL knowledge base, and includes NEGATIVES —
// things visitors say that no photo answers — because the failure that
// reaches a customer is a photo nobody asked for, not a photo withheld.
// This product has already sent a Hollywood-smile picture to an implant
// patient once.
//
// The first run of this found that absolute similarity is language-bound:
// the same correct match scores 0.55 in English and 0.17 in Arabic, so no
// fixed bar can serve both. What travels is how far the best match stands
// above the rest of the field.

import { generateEmbedding } from "../lib/embeddings";
import { cosineSimilarity, parseEmbedding, type EmbeddedCandidate } from "../lib/media-selection";

type Probe = { klass: string; text: string; expect: RegExp | null };

const PROBES: Probe[] = [
  // Should show something.
  { klass: "English", text: "I lost most of my upper teeth five years ago and I'm looking into full mouth dental implants", expect: /implant/i },
  { klass: "English", text: "can I see what the results look like for implant patients?", expect: /implant/i },
  { klass: "English", text: "I want a brighter whiter smile, like the celebrities have", expect: /hollywood|smile/i },
  { klass: "Arabic", text: "فقدت معظم أسناني العلوية وأفكر في زراعة الأسنان الكاملة", expect: /implant/i },
  { klass: "Arabic", text: "أريد ابتسامة هوليوود بيضاء وجميلة", expect: /hollywood|smile/i },
  { klass: "Russian", text: "Я потерял верхние зубы и рассматриваю полную имплантацию", expect: /implant/i },
  { klass: "Chinese", text: "我失去了大部分上排牙齿，正在考虑全口种植牙", expect: /implant/i },
  { klass: "Turkish", text: "Üst dişlerimi kaybettim ve tam ağız implant düşünüyorum", expect: /implant/i },
  { klass: "Spanish", text: "Perdí mis dientes superiores y estoy considerando implantes completos", expect: /implant/i },

  // Should show nothing.
  { klass: "English-neg", text: "how much does the whole thing cost and do you offer financing?", expect: null },
  { klass: "English-neg", text: "my name is David and my number is +44 7700 900123", expect: null },
  { klass: "English-neg", text: "how do I get from the airport to the clinic?", expect: null },
  { klass: "Arabic-neg", text: "كم التكلفة وهل يوجد تقسيط؟", expect: null },
  { klass: "Chinese-neg", text: "费用是多少？可以分期吗？", expect: null },
  { klass: "Russian-neg", text: "Сколько это стоит и есть ли рассрочка?", expect: null },
];

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return {
    min: s[0] ?? 0,
    median: s[Math.floor(s.length / 2)] ?? 0,
    max: s[s.length - 1] ?? 0,
  };
}

async function main() {
  const { supabaseServer } = await import("../lib/supabase-server");
  const slug = process.env.SLUG ?? "test-clinic";
  const { data: t } = await supabaseServer.from("tenants").select("id").eq("slug", slug).single();
  const { data: rows } = await supabaseServer
    .from("knowledge_base")
    .select("id, title, embedding, knowledge_base_media(media_url, media_type)")
    .eq("tenant_id", t!.id);

  const candidates: EmbeddedCandidate[] = (rows ?? [])
    .map((r) => ({
      id: r.id,
      title: r.title ?? "",
      media: (r.knowledge_base_media ?? []).map((m) => ({ url: m.media_url, type: m.media_type })),
      embedding: parseEmbedding(r.embedding),
    }))
    .filter((c) => c.media.length > 0);

  console.log(`${candidates.length} entries with photos, on ${slug}\n`);

  const positiveLifts: number[] = [];
  const negativeLifts: number[] = [];
  let wrongTop = 0;

  for (const probe of PROBES) {
    const vector = await generateEmbedding(probe.text);
    const scored = candidates
      .map((entry) => ({ entry, similarity: cosineSimilarity(vector, entry.embedding ?? []) }))
      .sort((a, b) => b.similarity - a.similarity);

    const top = scored[0];
    const mean = scored.reduce((a, s) => a + s.similarity, 0) / scored.length;
    // Relative, because absolute similarity is language-bound. How far
    // the best stands above the field is comparable across languages in
    // a way the raw number is not.
    const lift = mean > 0 ? top.similarity / mean : 0;

    if (probe.expect === null) {
      negativeLifts.push(lift);
      console.log(
        `  [${probe.klass.padEnd(11)}] lift ${lift.toFixed(2)}  best ${top.similarity.toFixed(3)}  "${top.entry.title.slice(0, 32)}"  (should show NOTHING)`
      );
      continue;
    }

    positiveLifts.push(lift);
    const ok = probe.expect.test(top.entry.title);
    if (!ok) wrongTop++;
    console.log(
      `  [${probe.klass.padEnd(11)}] lift ${lift.toFixed(2)}  best ${top.similarity.toFixed(3)}  "${top.entry.title.slice(0, 32)}"  ${ok ? "correct" : "WRONG"}`
    );
  }

  const pos = stats(positiveLifts);
  const neg = stats(negativeLifts);

  console.log(`\n${"=".repeat(64)}`);
  console.log(`  top-1 correct      : ${positiveLifts.length - wrongTop}/${positiveLifts.length}`);
  console.log(`  lift, should show  : min ${pos.min.toFixed(2)}  median ${pos.median.toFixed(2)}  max ${pos.max.toFixed(2)}`);
  console.log(`  lift, should not   : min ${neg.min.toFixed(2)}  median ${neg.median.toFixed(2)}  max ${neg.max.toFixed(2)}`);
  console.log(
    pos.min > neg.max
      ? `\n  SEPARATES: any bar between ${neg.max.toFixed(2)} and ${pos.min.toFixed(2)} works in every language.\n  Midpoint ${((pos.min + neg.max) / 2).toFixed(2)}.`
      : `\n  OVERLAPS: ${neg.max.toFixed(2)} vs ${pos.min.toFixed(2)}. Lift alone is not enough.`
  );
  console.log("=".repeat(64));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
