# Working on this project

## Enable the pre-push check, once per clone

```sh
git config core.hooksPath .githooks
```

It refuses a push that does not typecheck or does not build.

This exists because a commit that did not compile reached `master`. The
command was:

```sh
npx next build 2>&1 | tail -2 && git push
```

A pipeline reports the exit code of its **last** command. `tail` always
succeeds, so `&& git push` ran on a build that had failed. Vercel refused
the deployment and production stayed on the previous commit — luck, not
design. The same mistake on a change that happened to build would have
shipped.

So: **never pipe a build or a test in a chain that gates a push.** Read
the exit code from the command itself:

```sh
npx next build > build.log 2>&1; echo "exit=$?"    # good
npx next build | tail -2 && git push               # hides failures
```

The hook makes that structural rather than a thing to remember. To bypass
it deliberately:

```sh
SKIP_VERIFY=1 git push
```

## Running the checks by hand

```sh
npx tsc --noEmit
npx next build
npx tsx scripts/test-<name>.ts      # any script starting test-
```

Scripts starting `measure-` and `calibrate-` produce numbers rather than
pass/fail, and write their output to `docs/` when it is worth keeping.

## Anything that holds a conversation must use the test tenant

Measurement and live-check scripts write real leads and transcripts. They
go through `say()` in `scripts/_chat-client.ts`, which refuses any tenant
not marked `is_test` — see `lib/test-tenant.ts`. A script that builds its
own `fetch` to `/api/chat` fails `scripts/test-test-tenant-guard.ts`.

## Before changing a detector that reads text

Measure it across the six failure classes first: Latin baseline,
right-to-left, Cyrillic, no-spaces-between-words, dotted/dotless i,
inverted punctuation. Several rules in this codebase passed every English
test while doing nothing at all in the other five.

`docs/` holds the measurements that have already been taken.
