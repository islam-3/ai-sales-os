// Wait for a pushed commit to be served and smoke-tested, and say how it went.
//
//   npx tsx scripts/watch-deploy.ts [sha]        (default: HEAD)
//
// Free: GitHub's REST API and the production /api/version, nothing paid.
// Uses fetch, not the gh CLI, which is not installed here. The first
// watcher used gh with its errors sent to /dev/null, so every check
// failed silently and it waited out its whole timeout on a smoke run that
// had passed an hour earlier. Here any check that cannot be made stops
// the watch loudly instead.
//
// Exit codes: 0 smoke passed · 1 smoke failed · 2 a check errored · 3 timed out.
//
// Exit codes are set, not forced with process.exit: on Windows, exiting
// while a fetch socket is closing crashes Node (libuv assertion, exit 127).
//
// Unauthenticated, GitHub allows 60 requests an hour, so it polls once a
// minute with one request per poll. GITHUB_TOKEN raises the limit if set.

import { execSync } from "node:child_process";

const PROD_URL = process.env.PROD_URL ?? "https://ai-sales-os-drab.vercel.app";
const REPO = process.env.GITHUB_REPO ?? "islam-3/ai-sales-os";
const POLL_MS = 60_000;
const TIMEOUT_MIN = Number(process.env.TIMEOUT_MIN ?? 30);

class CheckError extends Error {}

async function getJson(url: string, github = true): Promise<any> {
  const headers: Record<string, string> = github ? { Accept: "application/vnd.github+json", "User-Agent": "watch-deploy" } : {};
  if (github && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new CheckError(`could not reach ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const reset = res.headers.get("x-ratelimit-reset");
    const limited = res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0";
    throw new CheckError(
      `${url} answered ${res.status}` +
        (limited && reset ? ` (rate limit; resets ${new Date(Number(reset) * 1000).toISOString()}; set GITHUB_TOKEN)` : `: ${(await res.text()).slice(0, 200)}`)
    );
  }
  return res.json();
}

const api = (path: string) => getJson(`https://api.github.com/repos/${REPO}${path}`);
const log = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)}  ${s}`);

async function main() {
  // Always the full hash: GitHub's head_sha filter matches 40 characters
  // only, so a short one would wait out the whole timeout on nothing.
  const sha = execSync(`git rev-parse ${process.argv[2] ?? "HEAD"}`).toString().trim();
  log(`watching ${sha.slice(0, 7)} on ${REPO}, serving at ${PROD_URL}`);
  const deadline = Date.now() + TIMEOUT_MIN * 60_000;

  let run: any = null;
  for (;;) {
    const runs = await api(`/actions/runs?head_sha=${sha}`);
    run = (runs.workflow_runs ?? []).find((r: any) => /smoke/i.test(r.name)) ?? null;
    if (run?.status === "completed") break;
    log(run ? `smoke run ${run.id}: ${run.status}` : "no smoke run yet (deploy still building, or the path filter skipped it)");
    if (Date.now() > deadline) {
      console.error(`TIMED OUT after ${TIMEOUT_MIN} min: ${run ? `smoke run ${run.id} still ${run.status}` : "no smoke run for this commit"}`);
      process.exitCode = 3;
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  // Once it is done, the rest is read once.
  const version = await getJson(`${PROD_URL}/api/version`, false);
  log(`/api/version: ${version.shortCommit ?? version.commit} (${version.environment})${version.commit === sha ? "" : `  NOT ${sha.slice(0, 7)}`}`);
  const deployments = await api(`/deployments?sha=${sha}`);
  for (const d of deployments) {
    const statuses = await api(`/deployments/${d.id}/statuses`);
    log(`deployment ${d.id} (${d.environment}): ${statuses.map((s: any) => s.state).join(" -> ") || "no status"}`);
  }
  const jobs = await api(`/actions/runs/${run.id}/jobs`);
  for (const j of jobs.jobs) {
    log(`job ${j.name}: ${j.conclusion}, ${j.started_at?.slice(11, 19)}-${j.completed_at?.slice(11, 19)}`);
    for (const a of await api(`/check-runs/${j.id}/annotations`)) {
      log(`  ${a.annotation_level}: ${[a.title, a.message].filter(Boolean).join(" | ").replace(/\s+/g, " ").slice(0, 300)}`);
    }
  }
  log(`SMOKE ${run.conclusion.toUpperCase()}  ${run.html_url}`);
  process.exitCode = run.conclusion === "success" ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof CheckError ? `CHECK FAILED: ${e.message}` : e);
  process.exitCode = 2;
});
