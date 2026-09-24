// Dental-specific wording in strings a user can actually read.
//
//   npx tsx scripts/audit-copy.ts
//
// The product started as a dental-clinic tool and the vocabulary stuck.
// It now serves any business, so a law firm's owner reading "clinic" or a
// salon's visitor reading "patient" is being shown the wrong product.
//
// Comments and illustrative examples are NOT copy: a comment explaining a
// bug using a dental case is documentation, and rewriting it would cost
// the explanation for nothing. This reports strings and JSX text only.

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const TERMS = /\b(clinic|clinics|patient|patients|dentist|dentists|dental|treatment|treatments)\b/i;

const ROOTS = ["app", "components", "lib"];
const SKIP_FILES = /audit-copy|test-|diagnose-|smoke-test/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !SKIP_FILES.test(entry)) out.push(full);
  }
  return out;
}

type Hit = { file: string; line: number; kind: string; text: string };
const hits: Hit[] = [];

for (const root of ROOTS) {
  for (const file of walk(join(process.cwd(), root))) {
    const lines = readFileSync(file, "utf8").split("\n");
    let inBlockComment = false;

    lines.forEach((raw, i) => {
      const line = raw.trim();

      // Track block comments so their contents are skipped.
      if (inBlockComment) {
        if (line.includes("*/")) inBlockComment = false;
        return;
      }
      if (line.startsWith("/*")) {
        if (!line.includes("*/")) inBlockComment = true;
        return;
      }
      if (line.startsWith("//") || line.startsWith("*")) return;
      if (!TERMS.test(line)) return;

      // Classify what kind of thing this is, since the fix differs.
      let kind = "other";
      if (/^(const|let|type|interface|export)/.test(line) && !/["'`]/.test(line)) kind = "identifier";
      else if (/(?:label|placeholder|title|description|alt|aria-label)\s*[=:]/.test(line)) kind = "ui-prop";
      else if (/<[A-Za-z]|&apos;|^\{?["'`]?[A-Z]/.test(line) && /[a-z]{3}/.test(line)) kind = "jsx-or-string";
      if (/clinicName|ClinicName/.test(line)) kind = "identifier";

      hits.push({
        file: relative(process.cwd(), file).replace(/\\/g, "/"),
        line: i + 1,
        kind,
        text: line.slice(0, 150),
      });
    });
  }
}

const byFile = new Map<string, Hit[]>();
hits.forEach((h) => {
  const list = byFile.get(h.file) ?? [];
  list.push(h);
  byFile.set(h.file, list);
});

console.log(`${hits.length} candidate line(s) in ${byFile.size} file(s)\n`);
Array.from(byFile.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([file, list]) => {
    console.log(`── ${file}`);
    list.forEach((h) => console.log(`   ${String(h.line).padStart(4)} [${h.kind}] ${h.text}`));
    console.log("");
  });
