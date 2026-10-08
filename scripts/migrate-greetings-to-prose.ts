// Turns the assembled greeting into the literal prose it already reads as.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
//     scripts/migrate-greetings-to-prose.ts
//   ... then again with CONFIRM_MIGRATE=WRITE_PROSE_GREETINGS
//
// The greeting used to be fifteen separately translatable strings —
// opener, opener_with_place, help, and a chip label per recognised
// category — assembled at render time with {business} and {place}
// substituted in. Every piece existed because WE needed it translatable
// independently; the owner paid for it with a fifteen-field form for a
// welcome message.
//
// ── Why this runs buildChatIntro rather than joining strings ─────────
// Joining the parts by hand would be a second implementation of the
// assembly, and it would get the details wrong: which opener applies
// when there is no city, the owner's own words for the city and their
// categories, the rule that drops the description line when it is
// plainly in the wrong language, the chip de-duplication, the chip cap.
//
// So it runs the REAL assembly, once per tenant per language, and stores
// what came out. The migrated prose is therefore byte-identical to what
// visitors are seeing right now — which is the only definition of
// "migrated correctly" worth having.
//
// ── Non-destructive ─────────────────────────────────────────────────
// Nothing is removed. The old strings, source hash and own-words stay in
// the row, and buildChatIntro falls back to assembling them whenever
// there is no prose for the chosen language. A tenant this misses keeps
// exactly today's greeting.

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { supabaseServer } from "../lib/supabase-server";
import { parseTenantSettings } from "../lib/tenant-settings";
import { buildChatIntro } from "../lib/chat-intro";
import type { StoredGreeting, StoredGreetings } from "../lib/chat-intro-i18n";

const CONFIRM_PHRASE = "WRITE_PROSE_GREETINGS";
const CONFIRM = process.env.CONFIRM_MIGRATE ?? "";

async function main() {
  const { data: tenants, error } = await supabaseServer
    .from("tenants")
    .select("id, slug, business_name, industry, description, settings");
  if (error) throw error;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const backupPath = join(dir, `greetings-before-prose-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        note:
          "settings.chat_intro for every tenant, before prose greetings were written. " +
          "Nothing was removed by the migration; this is here so the write can be undone.",
        rows: (tenants ?? []).map((t) => ({
          slug: t.slug,
          chat_intro: (t.settings as Record<string, unknown>)?.chat_intro ?? null,
        })),
      },
      null,
      2
    )
  );
  console.log(`backed up to ${backupPath}\n`);

  const planned: { slug: string; id: string; greetings: StoredGreetings }[] = [];

  for (const t of tenants ?? []) {
    const settings = parseTenantSettings(t.settings);
    const stored = settings.chat_intro;

    const { data: kb } = await supabaseServer
      .from("knowledge_base")
      .select("category")
      .eq("tenant_id", t.id)
      .not("category", "is", null);
    const categories = Array.from(new Set((kb ?? []).map((r) => r.category as string)));

    // Every language this tenant has anything for. The chosen one, the
    // one a translation was made for, and any language they wrote their
    // own words in — so work done in a language they are not currently
    // using survives and reappears if they switch back.
    const languages = new Set<string>();
    if (settings.chat_language) languages.add(settings.chat_language);
    if (stored?.language) languages.add(stored.language);
    Object.keys(stored?.ownLabels ?? {}).forEach((l) => languages.add(l));

    if (languages.size === 0) {
      console.log(`${t.slug.padEnd(14)} nothing stored — will keep using the built-in default`);
      continue;
    }

    const greetings: StoredGreetings = { ...(stored?.greetings ?? {}) };
    const place = settings.location?.city ?? settings.location?.country ?? undefined;

    for (const language of Array.from(languages)) {
      // The assembly, with the chat language forced to this one, so the
      // result is what a visitor greeted in this language actually sees.
      const intro = buildChatIntro({
        businessName: t.business_name,
        industry: t.industry,
        description: t.description,
        categories,
        settings: { ...settings, chat_language: language },
      });

      const code = language.trim().toLowerCase();
      if (greetings[code]) {
        console.log(`${t.slug.padEnd(14)} [${code}] already has prose — left alone`);
        continue;
      }

      const entry: StoredGreeting = {
        text: intro.greeting,
        chips: intro.chips,
        // Already live, so already the owner's. Approval exists for a
        // machine translation nobody has read, and this is not one — it
        // is the text their visitors are being shown this minute.
        approved: true,
        wroteWith: {
          ...(t.business_name ? { businessName: t.business_name } : {}),
          ...(place ? { place } : {}),
        },
      };
      greetings[code] = entry;

      const long = entry.text.length > 320;
      console.log(
        `${t.slug.padEnd(14)} [${code}] ${String(entry.text.length).padStart(4)} chars, ` +
          `${entry.chips?.length ?? 0} chips${long ? "   ← LONG, worth a look" : ""}`
      );
      console.log(`${" ".repeat(16)}${entry.text.replace(/\s+/g, " ").slice(0, 110)}`);
    }

    if (Object.keys(greetings).length > 0) {
      planned.push({ slug: t.slug, id: t.id, greetings });
    }
  }

  console.log(`\n${planned.length} tenant(s) to write`);

  if (CONFIRM !== CONFIRM_PHRASE) {
    console.log(`\nNothing written. To write, re-run with:`);
    console.log(`  CONFIRM_MIGRATE=${CONFIRM_PHRASE}`);
    return;
  }

  for (const row of planned) {
    const { data: current } = await supabaseServer
      .from("tenants")
      .select("settings")
      .eq("id", row.id)
      .single();
    const settings = (current?.settings ?? {}) as Record<string, unknown>;
    const chatIntro = (settings.chat_intro ?? {}) as Record<string, unknown>;

    // Merged into the raw row rather than through parseTenantSettings:
    // the parser is an allowlist, and writing its output back would drop
    // any key it does not yet know about. Nothing is removed here.
    const { error: writeError } = await supabaseServer
      .from("tenants")
      .update({
        settings: { ...settings, chat_intro: { ...chatIntro, greetings: row.greetings } },
      })
      .eq("id", row.id);
    if (writeError) throw new Error(`${row.slug}: ${writeError.message}`);
    console.log(`  ${row.slug}: written`);
  }

  console.log(`\ndone. The old strings are untouched; ${backupPath} can undo this.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {};
