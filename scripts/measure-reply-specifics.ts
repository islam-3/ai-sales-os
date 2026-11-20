// Do replies surface what is specific about the business, and do they
// hold the handoff back until the visitor is comfortable?
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/measure-reply-specifics.ts docs/reply-provider-<date>.sessions.json
//
// FREE and read-only: it reads stored conversations, no model call.
//
// The business prompt (lib/business-prompt.ts) asks for both:
//   - "Open with something specific and inviting about this business",
//     drawing on "the specific facts, numbers and names you are given";
//   - name and number only "when you understand their situation and the
//     conversation feels comfortable", a photo only where it helps.
//
// Arms: Sonnet is the twelve production smoke conversations of the last
// two deploys (2026-11-17 c0f383b, 2026-11-18 1fb9b58), on the reply
// prompt production serves today. The OpenAI arm is read from the
// sessions file measure-reply-provider writes.
//
// (a) DIFFERENTIATORS, generic: a "fact" is a token taken from the
// tenant's own material (knowledge base and description), never a list
// of dental words: a number of two or more digits, or a capitalised Latin
// name used mid-sentence (a brand, a programme, an acronym). The business
// name, its city and country, contact channels, and anything the visitor
// said are excluded. Limit, the same for both arms: a number written out
// in words ("fifteen years") is not counted.
//
// (b) EARLY HANDOFF: replies 1 and 2 asking for a name, a number or a
// photo, or giving the WhatsApp number, when the visitor has not raised
// it. Matched by phrase in six languages, so every flag is quoted to be
// read.
//
// The bars, set before the OpenAI run (2026-11-19):
//   (a) first replies carrying a fact: OpenAI >= Sonnet - 10 points,
//       overall AND in English; distinct facts per conversation >= 80%
//       of Sonnet's;
//   (b) early handoffs: OpenAI <= Sonnet, overall AND in English.
//
// BARS=facts: the bars for the run after the facts fix (set 2026-11-19,
// before it ran). Not Sonnet's 3.5, which overloads:
//   - at least 2.0 distinct business facts per conversation;
//   - a fact in the process reply (reply 4) in at least 10 of 12;
//   - no price bar: dropped on 2026-11-20, because the price reply's
//     job is the photo step (was 10/12, then 3/12). Still reported;
//   - early handoffs in replies 1-2: none (Sonnet: none).
// Overloaded replies are measured by measure-reply-provider's density
// check and compared with its own report.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BARS = process.env.BARS ?? "relative";
const PRICE_REPLY = 2;
const PROCESS_REPLY = 3;

const SONNET_SESSIONS: { label: string; sessionId: string; run: number }[] = [
  ["Spanish", "92985564-d415-43ab-9cee-8940d5c02956"], ["Turkish", "d398a0e1-8ebb-4587-9d60-ca7feba70da7"],
  ["Chinese", "cce0512c-caf0-44f1-9010-4eedea2021d0"], ["Russian", "dcb0905e-74fa-4b66-b4cb-63558f478cea"],
  ["Arabic", "06209320-92d7-4df9-a588-6037d4b48690"], ["English", "eee97d63-ed4c-4f8d-8150-6a779e02cf8d"],
  ["Spanish", "b52142fb-cf89-4c80-8eef-4da9763063af"], ["Turkish", "7282dc78-f5b0-4d3c-ad5a-1835dbf9214a"],
  ["Chinese", "9eb4c463-f391-4be7-bd28-8d32478846f4"], ["Russian", "6286a163-62b1-4e50-b841-38d5f04aee00"],
  ["Arabic", "150170b3-9c23-4e44-ac85-241dbd494dd7"], ["English", "f882b2bc-d955-4397-92bc-6b1ae09f2a56"],
].map(([label, sessionId], i) => ({ label, sessionId, run: i < 6 ? 1 : 2 }));

const LANGS = ["English", "Arabic", "Russian", "Chinese", "Turkish", "Spanish"];

const ASKS: Record<string, RegExp> = {
  name: /your (full )?name|what('s| is) your name|(may|can) I (have|ask|get) your name|اسمك|اسم حضرتك|ваше имя|как вас зовут|как к вам обращаться|您的名字|你的名字|怎么称呼|贵姓|姓名|adınız|isminiz|adını|ismini|tu nombre|su nombre|cómo te llamas|cómo se llama/i,
  number: /(phone|whatsapp|contact|mobile) number|your number|best number|reach you|رقمك|رقم (الهاتف|الجوال|واتساب|الواتساب|للتواصل)|ваш номер|номер телефона|номер для связи|ваш телефон|电话|号码|手机|numaranız|numaranızı|telefon numara|tu número|su número|número de (teléfono|whatsapp)/i,
  photo: /photo|picture|x-?ray|\bscan\b|صورة|صور |أشعة|фото|снимок|снимк|照片|图片|X光|片子|fotoğraf|röntgen|\bfoto|radiograf|imagen/i,
};

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const asciiDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)));

type Conv = { arm: string; label: string; run: number; sessionId: string; visitor: string[]; replies: string[]; offered: string[][] };

function factVocabulary(material: string, exclude: string[]): { numbers: Set<string>; names: Set<string> } {
  const numbers = new Set<string>();
  // Every figure, single digits included ("2 visits", "5 days"): the
  // first version counted only 2+ digits and scored a reply carrying the
  // whole two-visit timeline as having no fact.
  for (const m of material.match(/\d[\d.,]*\d|\d/g) ?? []) numbers.add(m.replace(/\D/g, ""));
  const names = new Set<string>();
  // Capitalised Latin words after a word or a comma, so a heading, a
  // bullet or a sentence opening is not mistaken for a name.
  for (const m of Array.from(material.matchAll(/(?<=[A-Za-z0-9,;)]\s+)([A-Z][A-Za-z]{2,}|[A-Z]{2,})/g))) names.add(m[1]);
  const ex = new Set(exclude.map((e) => e.toLowerCase()));
  // A name is a word the material NEVER writes in lower case: "Straumann",
  // "VIP", "Hollywood". Title case alone ("Best Dental Implants") is not
  // a name when the same word appears as "implants" elsewhere.
  const lower = new Set((material.match(/\b[a-z][a-z]+\b/g) ?? []).map((w) => w.toLowerCase()));
  for (const n of Array.from(names)) if (ex.has(n.toLowerCase()) || lower.has(n.toLowerCase())) names.delete(n);
  return { numbers, names };
}

function factsIn(reply: string, vocab: { numbers: Set<string>; names: Set<string> }, visitorText: string): string[] {
  const found = new Set<string>();
  const replyDigits = (asciiDigits(reply).match(/\d[\d.,]*\d|\d/g) ?? []).map((m) => m.replace(/\D/g, ""));
  // Whole numbers, not substrings: the "5" of "5 days" is not the visitor's
  // just because their phone number contains a 5.
  const visitorNumbers = new Set((asciiDigits(visitorText).match(/\d[\d.,]*\d|\d/g) ?? []).map((m) => m.replace(/\D/g, "")));
  for (const d of replyDigits) if (vocab.numbers.has(d) && !visitorNumbers.has(d)) found.add(d);
  for (const n of Array.from(vocab.names)) {
    // Not where it opens a sentence of the reply: "Exactly —" is not a fact.
    if (new RegExp(`(?<![.!?]\\s*|^\\s*)(?<![A-Za-z])${n}(?![A-Za-z])`).test(reply) && !visitorText.toLowerCase().includes(n.toLowerCase())) found.add(n);
  }
  return Array.from(found);
}

async function main() {
  const sessionsFile = process.argv[2];
  if (!sessionsFile) throw new Error("usage: measure-reply-specifics.ts <reply-provider-<date>.sessions.json>");
  const openaiSessions = JSON.parse(readFileSync(sessionsFile, "utf8")) as { arm: string; label: string; run: number; sessionId: string; offered?: string[][] }[];
  const { supabaseServer: s } = await import("../lib/supabase-server");

  // TENANT names the tenant whose material the facts come from. Sonnet's
  // baseline exists only for test-clinic; elsewhere only the OpenAI arm is
  // read and the bars are absolute (BARS=facts).
  const tenantSlug = process.env.TENANT ?? "test-clinic";
  const { data: tenant } = await s.from("tenants").select("id, business_name, description, settings").eq("slug", tenantSlug).single();
  const st = tenant!.settings as { location?: { city?: string; country?: string }; contact?: { whatsapp?: string } };
  const { data: kb } = await s.from("knowledge_base").select("title, content").eq("tenant_id", tenant!.id);
  // Entry text, not titles: titles are title-cased, which reads as names.
  const material = [tenant!.description ?? "", ...(kb ?? []).map((k: { content: string | null }) => k.content ?? "")].join("\n");
  const exclude = [
    ...String(tenant!.business_name).split(/\W+/), "Prof", "Clinic", "TEST",
    st.location?.city ?? "", st.location?.country ?? "", "Istanbul", "Turkey", "Türkiye",
    "WhatsApp", "Instagram", "Facebook", "Email", "The", "Our", "We", "You", "Your", "For", "And", "With",
  ].filter(Boolean);
  const vocab = factVocabulary(material, exclude);
  const whatsappDigits = asciiDigits(st.contact?.whatsapp ?? "").replace(/\D/g, "");

  const load = async (arm: string, label: string, run: number, sessionId: string, offered: string[][] = []): Promise<Conv> => {
    const { data } = await s.from("conversations").select("role, content, created_at").eq("session_id", sessionId).order("created_at");
    return {
      arm, label: label.split(" ")[0], run, sessionId, offered,
      visitor: (data ?? []).filter((r) => r.role === "user").map((r) => r.content),
      // The greeting is stored as the first assistant row only when the
      // visitor opened from it; the smoke runs send no greeting, so every
      // assistant row is a reply, in order.
      replies: (data ?? []).filter((r) => r.role === "assistant").map((r) => r.content),
    };
  };
  const convs: Conv[] = [];
  if (tenantSlug === "test-clinic") for (const x of SONNET_SESSIONS) convs.push(await load("sonnet", x.label, x.run, x.sessionId));
  for (const x of openaiSessions) convs.push(await load(x.arm, x.label, x.run, x.sessionId, x.offered));
  const arms = Array.from(new Set(convs.map((c) => c.arm)));

  type Row = { convs: number; firstWithFact: number; distinct: number; handoffs: number; priceFact: number; processFact: number; named: number };
  const table = new Map<string, Row>();
  const handoffQuotes: string[] = [];
  const firstReplies: string[] = [];
  for (const c of convs) {
    const visitorAll = c.visitor.join(" \n ");
    const first = factsIn(c.replies[0] ?? "", vocab, c.visitor[0] ?? "");
    const all = new Set<string>();
    c.replies.forEach((r, i) => factsIn(r, vocab, c.visitor.slice(0, i + 1).join(" ")).forEach((f) => all.add(f)));
    let handoffs = 0;
    for (let i = 0; i < Math.min(2, c.replies.length); i++) {
      const reply = c.replies[i];
      const raisedByVisitor = c.visitor.slice(0, i + 1).join(" ");
      const kinds = Object.entries(ASKS).filter(([, re]) => re.test(reply) && !re.test(raisedByVisitor)).map(([k]) => k);
      if (whatsappDigits.length >= 7 && asciiDigits(reply).replace(/\D/g, "").includes(whatsappDigits)) kinds.push("whatsapp number");
      if (kinds.length) {
        handoffs++;
        handoffQuotes.push(`- **${c.arm}** · ${c.label} · reply ${i + 1} · [${kinds.join(", ")}] ${reply.replace(/\s+/g, " ").slice(0, 260)}`);
      }
    }
    if (c.label === "English" || first.length === 0) {
      firstReplies.push(`- **${c.arm}** · ${c.label} · facts [${first.join(", ") || "none"}] · ${(c.replies[0] ?? "").replace(/\s+/g, " ").slice(0, 300)}`);
    }
    for (const key of [`${c.arm}|${c.label}`, `${c.arm}|all`]) {
      const r = table.get(key) ?? table.set(key, { convs: 0, firstWithFact: 0, distinct: 0, handoffs: 0, priceFact: 0, processFact: 0, named: 0 }).get(key)!;
      if (Array.from(all).some((f) => !/^\d+$/.test(f))) r.named++;
      if (factsIn(c.replies[PRICE_REPLY] ?? "", vocab, c.visitor.slice(0, PRICE_REPLY + 1).join(" ")).length) r.priceFact++;
      if (factsIn(c.replies[PROCESS_REPLY] ?? "", vocab, c.visitor.slice(0, PROCESS_REPLY + 1).join(" ")).length) r.processFact++;
      r.convs++;
      if (first.length) r.firstWithFact++;
      r.distinct += all.size;
      r.handoffs += handoffs;
    }
  }

  const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
  const out: string[] = [
    `# Reply specifics and early handoff, ${new Date().toISOString().slice(0, 10)}`, "",
    `Sonnet: the 12 production smoke conversations of 2026-11-17 and 2026-11-18. ${arms.filter((a) => a !== "sonnet").join(", ")}: ${sessionsFile}.`, "",
    `Fact vocabulary from test-clinic's own material: ${vocab.numbers.size} numbers (${Array.from(vocab.numbers).join(", ")}), ${vocab.names.size} names (${Array.from(vocab.names).join(", ")}).`, "",
    "| Arm | Visitor language | Conversations | First reply carries a fact | Price reply carries a fact | Process reply carries a fact | Distinct facts per conversation | Names a brand or programme | Early handoffs (replies 1-2) |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const arm of arms) for (const lang of [...LANGS, "all"]) {
    const r = table.get(`${arm}|${lang}`);
    if (!r) continue;
    out.push(`| ${lang === "all" ? `**${arm}**` : arm} | ${lang === "all" ? "**all**" : lang} | ${r.convs} | ${r.firstWithFact}/${r.convs} (${pct(r.firstWithFact, r.convs)}%) | ${r.priceFact}/${r.convs} | ${r.processFact}/${r.convs} | ${(r.distinct / r.convs).toFixed(1)} | ${r.named}/${r.convs} | ${r.handoffs} |`);
  }

  // The bars.
  const verdicts: string[] = [];
  const sonnet = (lang: string) => table.get(`sonnet|${lang}`) ?? { convs: 1, firstWithFact: 0, distinct: 0, handoffs: 0, priceFact: 0, processFact: 0, named: 0 };
  if (BARS === "facts") {
    for (const arm of arms.filter((a) => a !== "sonnet")) {
      const o = table.get(`${arm}|all`)!;
      const rows: [string, boolean][] = [
        [`distinct business facts per conversation ${(o.distinct / o.convs).toFixed(1)} (bar 2.0)`, o.distinct / o.convs >= 2.0],
        // No price bar (dropped 2026-11-20): the price reply's job is the
        // photo step. Its column is still reported, for reading.
        [`process reply carries a fact ${o.processFact}/${o.convs} (bar 10/12)`, o.processFact >= Math.ceil((10 / 12) * o.convs)],
        [`early handoffs in replies 1-2: ${o.handoffs} (bar 0)`, o.handoffs === 0],
      ];
      for (const [label, ok] of rows) verdicts.push(`- ${arm}: ${label} → ${ok ? "ok" : "**FAIL**"}`);
      const pass = rows.every(([, ok]) => ok);
      verdicts.push(`- **${arm}: ${pass ? "PASS" : "FAIL"}** (overloaded replies: see measure-reply-provider's report)`);
      if (!pass) process.exitCode = 1;
    }
  }
  for (const arm of BARS === "facts" ? [] : arms.filter((a) => a !== "sonnet")) {
    let pass = true;
    for (const lang of ["all", "English"]) {
      const o = table.get(`${arm}|${lang}`), b = sonnet(lang);
      if (!o) continue;
      const aOk = pct(o.firstWithFact, o.convs) >= pct(b.firstWithFact, b.convs) - 10;
      const hOk = o.handoffs / o.convs <= b.handoffs / b.convs;
      if (!aOk || !hOk) pass = false;
      verdicts.push(`- ${arm}, ${lang}: first reply with a fact ${pct(o.firstWithFact, o.convs)}% vs Sonnet ${pct(b.firstWithFact, b.convs)}% → ${aOk ? "ok" : "**FAIL**"}; early handoffs ${o.handoffs}/${o.convs} conv. vs Sonnet ${b.handoffs}/${b.convs} → ${hOk ? "ok" : "**FAIL**"}`);
    }
    const o = table.get(`${arm}|all`)!, b = sonnet("all");
    const dOk = o.distinct / o.convs >= 0.8 * (b.distinct / b.convs);
    if (!dOk) pass = false;
    verdicts.push(`- ${arm}: distinct facts per conversation ${(o.distinct / o.convs).toFixed(1)} vs Sonnet ${(b.distinct / b.convs).toFixed(1)} (bar ${(0.8 * b.distinct / b.convs).toFixed(1)}) → ${dOk ? "ok" : "**FAIL**"}`);
    verdicts.push(`- **${arm}: ${pass ? "PASS" : "FAIL"}**`);
    if (!pass) process.exitCode = 1;
  }
  // Every price and process reply, side by side with Sonnet's, English first.
  const cell = (s: string) => s.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  const sideBySide: string[] = ["## Price and process replies, side by side", "", "Sonnet: production smoke runs of 2026-11-17 (run 1) and 2026-11-18 (run 2). Facts offered: what the state block handed the OpenAI reply that turn.", ""];
  for (const lang of LANGS) {
    sideBySide.push(`### ${lang}`, "", `| Run | Reply | Sonnet | ${arms.filter((a) => a !== "sonnet").join(" / ")} | Facts offered |`, "|---|---|---|---|---|");
    for (const run of [1, 2]) {
      const s = convs.find((c) => c.arm === "sonnet" && c.label === lang && c.run === run);
      const o = convs.find((c) => c.arm !== "sonnet" && c.label === lang && c.run === run);
      for (const [name, idx] of [["price", PRICE_REPLY], ["process", PROCESS_REPLY]] as const) {
        sideBySide.push(`| ${run} | ${name} | ${cell(s?.replies[idx] ?? "")} | ${cell(o?.replies[idx] ?? "")} | ${cell((o?.offered[idx] ?? []).join(" ◆ ") || "none")} |`);
      }
    }
    sideBySide.push("");
  }
  out.push("", "## Against the bars", "", ...verdicts, "", ...sideBySide, "## Early handoffs, quoted", "", ...(handoffQuotes.length ? handoffQuotes : ["None."]), "",
    "## First replies: every English one, and every one with no fact", "", ...firstReplies, "");
  const path = join(__dirname, "..", "docs", process.env.REPORT ?? `reply-specifics-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(path, out.join("\n"));
  console.log(out.slice(0, out.indexOf("## Price and process replies, side by side")).join("\n"));
  console.log(`wrote ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
