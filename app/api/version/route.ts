import { NextResponse } from "next/server";

// Which commit is actually serving?
//
// There was no way to answer that from outside. Before a live check
// against production the question is always "is the fix I just pushed
// the code that is about to be tested", and the available answers were
// the Vercel dashboard by hand, a CLI that needs an interactive login,
// or guessing. Guessing is how a run reports a pass against the build
// before the fix.
//
// Vercel sets these at build time. Locally they are absent, which is
// the honest answer rather than a fake one — a dev server is not
// serving a commit.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    // Public information: this is an open-source-shaped deployment
    // marker, the same thing a Git tag or a build banner exposes. No
    // secret, no environment variable value, nothing tenant-scoped.
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    shortCommit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    // "production" or "preview". Worth having: a check aimed at a
    // preview URL that reports a pass is a check of the wrong thing.
    environment: process.env.VERCEL_ENV ?? "local",
  });
}
