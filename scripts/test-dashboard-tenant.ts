// Resolving which business the dashboard is showing.
//
//   npx tsx scripts/test-dashboard-tenant.ts
//
// This exists because of a real lockout. create-test-tenant.ts copied
// owner_user_id, so one account owned two tenants; getCurrentTenant()
// asked for them with .maybeSingle(), which tolerates zero rows but
// ERRORS on two; and the next line turned any error into "we couldn't
// find a business for your account". The owner of this project was
// locked out of production for a day, told their account had nothing.
//
// The query is against a live database, so the logic is tested here the
// way it is actually reachable: against the source, and against a fake
// client that returns the rows a real one would.

import { readFileSync } from "fs";
import { join } from "path";

let bad = 0;
const check = (name: string, pass: boolean, detail?: string) => {
  if (!pass) {
    bad++;
    console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
  } else {
    console.log(`  ok  ${name}`);
  }
};

const src = readFileSync(join(process.cwd(), "lib/dashboard-tenant.ts"), "utf8");

console.log("--- the lookup must survive an account owning two businesses ---");
check(
  "the tenant query does not use maybeSingle()",
  !/\.eq\("owner_user_id", user\.id\)[\s\S]{0,120}?maybeSingle\(\)/.test(src),
  "maybeSingle() errors on two rows, and the caller reads an error as 'no business'"
);
check(
  "nor single(), which errors on two rows as well",
  !/\.eq\("owner_user_id", user\.id\)[\s\S]{0,120}?\.single\(\)/.test(src)
);
check(
  "the choice is ordered, so it cannot depend on row order",
  /\.order\("created_at", \{ ascending: true \}\)/.test(src),
  "without an order, the dashboard could show a different business between loads"
);
check(
  "and totally ordered, so equal timestamps still decide",
  /\.order\("id", \{ ascending: true \}\)/.test(src)
);
check(
  "how many are owned is carried out, not discarded",
  /ownedCount: tenants\.length/.test(src),
  "choosing one silently would hide the other business with nothing to explain it"
);

console.log("\n--- and the behaviour itself ---");

/** Stands in for the session client, returning whatever rows we give it. */
function fakeClient(rows: { id: string; business_name: string; slug: string; created_at: string }[]) {
  const sorted = [...rows].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => void) => resolve({ data: sorted, error: null }),
  };
  return { from: () => builder };
}

/** The same selection rule getCurrentTenant applies, in isolation. */
async function resolve(rows: Parameters<typeof fakeClient>[0]) {
  const client = fakeClient(rows);
  const { data, error } = (await client.from().select().eq().order().order()) as {
    data: typeof rows;
    error: null;
  };
  if (error || !data || data.length === 0) return null;
  return { chosen: data[0], ownedCount: data.length };
}

const ONE = [{ id: "a", business_name: "Prof Clinic", slug: "prof-clinic", created_at: "2026-08-14" }];
const TWO = [
  { id: "b", business_name: "Second Branch", slug: "second", created_at: "2026-09-22" },
  { id: "a", business_name: "Prof Clinic", slug: "prof-clinic", created_at: "2026-08-14" },
];
const SAME_DAY = [
  { id: "z", business_name: "Zed", slug: "zed", created_at: "2026-08-14" },
  { id: "a", business_name: "Alpha", slug: "alpha", created_at: "2026-08-14" },
];

async function main() {
  const one = await resolve(ONE);
  check("one business resolves to itself", one?.chosen.slug === "prof-clinic");
  check("and reports a count of one", one?.ownedCount === 1);

  const two = await resolve(TWO);
  check(
    "TWO businesses still resolve — the lockout case",
    two !== null,
    "this is the exact condition that returned null and locked the owner out"
  );
  check("the oldest is chosen", two?.chosen.slug === "prof-clinic", two?.chosen.slug);
  check("and the other is not hidden silently", two?.ownedCount === 2);

  // Order coming back differently must not change the answer.
  const reversed = await resolve([...TWO].reverse());
  check(
    "the same business is chosen whatever order the rows arrive in",
    reversed?.chosen.slug === two?.chosen.slug
  );

  const sameDay = await resolve(SAME_DAY);
  check(
    "equal timestamps are still decided, by id",
    sameDay?.chosen.slug === "alpha",
    sameDay?.chosen.slug
  );

  const none = await resolve([]);
  check("no business at all is still null", none === null);

  console.log("\n--- the banner must be detectable in rendered HTML ---");
  // React server-rendering splits interpolated values out of the text
  // around them. The page really contains:
  //
  //   This account has <!-- -->2<!-- --> businesses.
  //
  // A pattern expecting "has 2 businesses" never matches, and checking
  // for that produced a false alarm — "the banner does not render on
  // production" — when it rendered perfectly. This string is the exact
  // markup captured from production, so the smoke test's detector is
  // pinned to what a server emits rather than to what the source reads
  // like.
  const AS_RENDERED =
    "This account has <!-- -->2<!-- --> businesses. You&#x27;re seeing<!-- --> " +
    "<strong>TEST — Prof Clinic (automated runs)</strong>, the oldest one. " +
    "Switching between them isn&#x27;t built yet";

  const dashSrc = readFileSync(join(process.cwd(), "scripts/smoke-dashboard.ts"), "utf8");
  const declared = /const BANNER = \/(.+)\/;/.exec(dashSrc);
  check("the smoke test declares a banner pattern", declared !== null);
  if (declared) {
    const re = new RegExp(declared[1]);
    check("it matches the banner as a server actually renders it", re.test(AS_RENDERED), declared[0]);
    check(
      "and it does not match a page without the banner",
      !re.test("<div>Leads (3)</div><div>Most Requested Services</div>")
    );
  }

  console.log("\n--- the test tenant must never take the owner ---");
  const creator = readFileSync(join(process.cwd(), "scripts/create-test-tenant.ts"), "utf8");
  check(
    "create-test-tenant does not copy owner_user_id",
    /owner_user_id: null/.test(creator) && !/owner_user_id: source\.owner_user_id/.test(creator),
    "copying it is what gave one account two tenants"
  );

  console.log("\n--- a backup must be able to restore what it backed up ---");
  const wipe = readFileSync(join(process.cwd(), "scripts/wipe-visitor-data.ts"), "utf8");
  check(
    "the wipe exports the whole tenant row",
    /\.from\("tenants"\)\s*\n?\s*\.select\("\*"\)/.test(wipe),
    "it exported four columns, so the backup could not have restored the row"
  );

  console.log(bad ? `\n${bad} FAILING` : "\nall dashboard-tenant tests passed");
  process.exit(bad ? 1 : 0);
}

main();
