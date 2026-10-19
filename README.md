# AI Sales OS

A multi-tenant AI sales chat. A clinic or other business fills in a
profile and a knowledge base; visitors land on `/chat/<slug>` and have a
conversation; the business gets a qualified lead with a transcript, a
summary and the practical details its team needs to follow up.

The visitors are international and write in whatever language they like.
Most of the hard-won engineering in here exists because of that.

Next.js 14 (App Router) · Supabase (Postgres, Auth, Storage, pgvector) ·
Anthropic for the conversation · OpenAI for embeddings · Vercel.

For how to run the checks and push safely, see
[CONTRIBUTING.md](CONTRIBUTING.md). This file is about what exists and
why.

---

## The three rules

Everything below is an application of these. They were each learned by
getting it wrong in front of a real visitor.

### 1. Code over prompt wording

A rule written into the prompt is a hope. A rule computed from the
transcript and stated as a fact is a mechanism.

Measured: telling the model to "let your replies look different" moved
nothing. Counting the last two replies' shapes and telling it *"your last
two replies were both two paragraphs ending in a question"* moved it.
Removing a mandatory checklist from the prompt moved the two-paragraph
rate 25 points, where rewording the loudest instruction moved it 6.

So anything checkable is checked in code — markdown stripping, one
question per message, reply shape, reply density, coverage, the reply
guard. The prompt is left to make the judgements that genuinely need
judgement.

The honest corollary, recorded because it keeps being rediscovered: when
something *can't* be enforced in code, a prompt instruction is still
worth having — but do not report it as a fix unless a measurement says it
worked. The dialect-mirroring instruction is the live example. It is
correct, it is cheap, and it did not measurably reduce the thing it
targets.

### 2. Measure, don't reason

No threshold is set by eye. No regex is deleted because it "looks dead".
No fix is called a fix without a before and an after.

This project has shipped a threshold chosen by eye (1.04) that rejected a
correct answer at 1.03, and a classifier budget set at the measured p50
(a coin flip) that aborted two calls in three. Both looked reasonable.

Run measurements **more than once**. Dialect drift showed 0/5 on one pass
and 3/20 across four — a single pass would have reported "cannot
reproduce".

And validate the instrument before quoting it. A model-judge that had
passed five blatant samples went on to flag `سنة` ("year") as a regional
dialect marker, and reported drift *rising* after a change that could not
have caused it. See `scripts/test-dialect-judge.ts`: ten of its sixteen
samples are deliberately hard negatives.

### 3. Never claim a limitation we don't have

The assistant once told an Arabic visitor it could not send pictures.
That was untrue of the business, and we had put it in its mouth
ourselves. It also promised a photo on four consecutive turns and never
sent one.

Not sending images is simply not a topic. The assistant may say the
business has before-and-after cases if its material says so; it may not
imply one is coming, and it may not describe not sending as a limitation.
Enforced by `lib/no-images.ts` and checked by `scripts/test-no-images.ts`,
which asks the model itself in four scripts.

---

## The six failure classes

Every control that reads text is measured across these, never across "six
languages". The properties are what break code; the languages are
examples.

| Class | Example | What breaks |
|---|---|---|
| Latin baseline | English | — |
| Right-to-left | Arabic | `؟` U+061F is not `?` |
| Cyrillic | Russian | no Latin letters |
| No spaces between words | Chinese | word counts, sentence splitting |
| Dotted/dotless i | Turkish | `I`.toLowerCase() is not `i` |
| Inverted punctuation | Spanish | `¿` opens, `?` closes |

Why it matters, measured: the keyword lists that detected hesitation and
impatience scored **zero recall** in five of six — not degraded, zero.
Every control built on them was switched off for any visitor not writing
English, and every English test passed the whole time.

Before changing any detector that reads text, measure it across all six.

---

## Cost per conversation

**7.59 cents**, test-clinic, 4,998 recorded calls across 405
conversations. Regenerate with:

```sh
DOTENV_CONFIG_PATH=.env.local SLUG=test-clinic \
  npx tsx -r dotenv/config scripts/report-cost-per-conversation.ts
```

That script makes **no model calls**. It reads `usage_events`, which is a
record of calls already made and paid for.

| Call | Model | Per conv | Each | Subtotal | Source |
|---|---|---|---|---|---|
| reply | Sonnet | 6.28 | $0.00618 | **$0.03879** | measured |
| lead extraction | Sonnet | 4.38 | $0.00784 | **$0.03435** | measured |
| classifier | Haiku | 6.28 | $0.00044 | **$0.00273** | derived |
| coverage | Haiku | near a close only | — | — | not yet recorded |
| answer-gap judge | Sonnet | 0–4 | $0.00195 warm / $0.01818 cold | **see below** | derived |
| question rewrite | Sonnet | only on a gap | $0.00123 | **see below** | derived |
| question embedding | OpenAI | only on a gap | $0.0000003 | negligible | derived |
| | | | | **$0.07587** | |

The judge and the rewrite are *not* in the total, because how often they
run is the thing that varies most and no single figure is honest:

| Scenario | Warm cache | Cold cache | No caching |
|---|---|---|---|
| 0 questions asked | $0 | $0 | $0 |
| 2 questions, both answered | $0.00390 | $0.02013 | $0.02930 |
| 2 questions, 1 gap | $0.00513 | $0.02136 | $0.03053 |
| 4 questions (the cap), 2 gaps | $0.01026 | $0.02649 | $0.06106 |

Common case **+7%**, worst case **+35%**, worst case with caching off
**+80%** — which is what the caching work bought. The judge's cost scales
with the *knowledge base*, not the conversation: 23 entries is a
4,703-token prefix, and ten times the material is ten times the cost per
call.

Three things worth knowing before quoting any of it:

- **A cold cache write costs 24% *more* than no caching at all** — a
  write bills at 1.25× input. Caching only pays once a second call
  reuses the prefix, and the cache is per *tenant*, not per conversation.
- **The rewrite cannot be cached.** Its prefix is 265 tokens, under
  Anthropic's 1,024-token minimum. Marking it would bill a write at
  1.25× and never be read back.
- **Rates live in one place**, `lib/ai-pricing.ts`, which carries a
  warning to verify them. Every number above is only as good as that file.

### Ready lever: defer the judge to a daily batch

**Not built. Build it when any tenant exceeds ~5 conversations a day.**

The judge runs in real time today, after the reply, so every conversation
on a quiet tenant opens its own cold cache window and pays the write.
Deferring it — capture stores the request as *pending*, a once-a-day
Vercel cron judges a tenant's pending requests back to back, then
rewrites, embeds and groups as now — means **one** cold write per tenant
per day instead of one per conversation. Same judge prompt and model, so
no re-validation.

What it would save, from the measured per-call figures (cold $0.01818,
warm $0.00195, rewrite $0.00123) against the 7.69¢ baseline:

| Conv/day | Requests | Added/conv | vs real-time | Total/conv |
|---|---|---|---|---|
| 1 | 1.6 | $0.02033 | 0% | 9.72¢ |
| 2 | 3.2 | $0.01222 | −40% | 8.91¢ |
| 5 | 8 | $0.00735 | −64% | 8.42¢ |
| 10 | 16 | $0.00573 | −72% | 8.26¢ |
| 20 | 32 | $0.00492 | −76% | 8.18¢ |
| 50 | 80 | $0.00443 | −78% | 8.13¢ |
| floor | ∞ | $0.00410 | −80% | 8.10¢ |

**It buys exactly nothing at one conversation a day** — one cold write is
unavoidable when there is one conversation. What it really buys is making
a quiet tenant pay the *busy*-tenant rate, because "busy" was never about
volume, it was about cache warmth, and a batch manufactures warmth.
Hence the trigger: below ~5 conversations a day it is not worth the
problems below.

Vercel, from the docs: **Hobby** allows 100 cron jobs but a minimum
interval of once per day with ±59 min precision; **Pro** allows once per
minute. A daily batch fits Hobby. Function duration with fluid compute is
**300s hard max on Hobby** (Pro: 800s, 1800s in beta), and at ~2.5s per
judge call that caps a single invocation at roughly 50 conversations a
day for one tenant — past that it needs a cursor and chunking, or Pro.

What it breaks, all of which has to be handled in the same change:

- **Day one reads as broken.** An owner sets up, tests the chat, opens
  this page and sees nothing until tomorrow — at the exact moment they
  are deciding whether the product works. Starter suggestions cover an
  empty list, but their own test questions vanishing is worse than an
  empty state. Needs an immediate judge for a tenant's first few
  requests, or a "check now" button.
- **A silently broken cron is invisible.** The list just stops updating.
  Same shape as the empty test tenant that went unnoticed for days.
  Needs a visible `last_judged_at` and pending count.
- **The cap moves.** `MAX_JUDGE_CALLS_PER_CONVERSATION` is enforced today
  by counting captured rows before judging. Deferred, it must cap the
  *pending insert* per session, or one pathological conversation stores
  50 pending and the batch judges all 50.
- **A per-tenant daily cap becomes necessary.** One invocation making
  unbounded Sonnet calls is a failure mode real time does not have,
  because real time is bounded per conversation.
- **`asked_at` must stay the ask time**, not the judge time, or the
  "returns after 3 asks since dismissal" rule breaks silently — a whole
  day's asks would share one timestamp.

Three things would get better: a gap answered by the owner during the day
is judged against the new knowledge base and correctly never appears;
grouping is more consistent, done in one pass against a fixed set rather
than one at a time against a moving one; and two model calls leave the
post-response path, so capture becomes a single INSERT that cannot be
killed mid-judge.

### The rule

**Every model call in the product calls `recordUsage`.** A call missing
from `UsageCallType` is a call missing from the number above — four were
missing for months (the classifier, coverage, and both halves of capture),
which made the headline a floor reported as a total. Adding a model call
means adding a member to that union and a `recordUsage` beside it, in the
same change.

**A feature that adds a model call states what it adds to this number
before it is approved.** Measured on real usage where that is possible,
derived from prompt size where it is not, and labelled either way — the
script prints `MEASURED` or `DERIVED` per line and flips to the first on
its own as traffic flows.

**No script that calls Anthropic or OpenAI runs without stating the
number of calls and the estimated cost first, and waiting.** Production
chat goes down when credit runs out, so an unannounced measurement run
is an outage risk, not just a bill.

---

## The detectors, and what each is for

### Reading the visitor

| Module | Question it answers | How |
|---|---|---|
| `visitor-signals.ts` | Is this visitor hesitating, impatient, or asking for something? | Haiku classifier, 2s budget, falls back to "no" |
| `visitor-language.ts` | What script and language is this? | Script detection vetoes a model's guess |
| `coverage-answered.ts` | Which practical details have they already given? | Haiku, only near a close |
| `punctuation.ts` | Where do sentences end, how many words is this? | Every mark declared by **codepoint** |

`punctuation.ts` is declared by codepoint on purpose: U+037E, the Greek
question mark, is visually identical to `;`. A literal in a regex is a
bug nobody can see.

### The fifth key, and what adding one costs

`asking_for_information` is the gate for answer-gap capture. The gate it
replaced was a question mark, which is free and catches **nothing**: 0 of
57 visitor messages on the real clinic's tenant contain one, in any
script. People type fragments — `give me the price`, `dental implants`.
A keyword list was not available either, for the reason below.

Measured paired against the four-key prompt, same 120 cases, same run
(`docs/classifier-five-key-2026-10-11.log`, 570 calls):

| | Precision | Recall |
|---|---|---|
| `asking_for_information` alone | **100%** | 42% |
| `asking_for_information \|\| direct_request` | **100%** | **97.7%** |

**Zero false positives in 360 calls, in all six classes.** That is the
mistake that matters: a false positive is a judge call *and* a row
reading `khaled` under "customers asked — no answer yet".

The 42% is one systematic behaviour, not scattered weakness: 24 of the
25 misses per run are requests to be shown photos, where the model sets
`direct_request` and leaves this key false. The model partitions the
keys. Identical in all six classes, all three runs — so the gate is the
OR, and `direct_request` scored 100/100 in the same run with **no**
labelled case where it is true and this key is false.

**Adding a key did not cost the other four.** `accepts_offer` +3/+3,
`direct_request` precision +8, the other two unchanged, nothing worse in
any class. That is the opposite of the two experiments below and
consistent with their explanation: removing a box cost precision because
the model had nowhere to put what it saw, so adding one gives it
somewhere. Do not read this as "key changes are safe" — read it as "key
changes move the other keys, in whichever direction, so measure them".

Capture now **fails closed** on the classifier: a timeout returns
NO_SIGNALS and nothing is captured. A degraded classifier means a
quietly empty dashboard as well as a quietly blunted assistant.

The classifier is asked for five signals and only three are read.
`accepts_offer` and `direct_request` decide nothing since image sending
was removed — but removing either from the prompt costs precision on the
live ones, measured twice (100%→55% on one, 95%→57% on the other). With
no box for "they are saying yes", the model files it under the nearest
box it has. **A classifier needs a box for each thing it sees, even one
nobody reads.**

### Reading the business

| Module | Question |
|---|---|
| `coverage-relevance.ts` | Which pre-close questions does *this business* call for? |
| `vectors.ts` | Cosine similarity over stored embeddings |

Relevance is a property of the **business**, not of the conversation. A
clinic whose work spans two visits needs travel dates asked whatever
language the visitor writes in, and the server already knows what that
clinic does — it supplied the knowledge base. Derived by comparing the
tenant's own entries against fixed English probes; the embedding model is
multilingual, which is the whole point.

Embeddings answer **which**, never **whether**. Ranking across languages
works; absolute magnitude is language-bound (0.55 English vs 0.17 Arabic
for the same meaning), so a similarity threshold is not a yes/no.

### Shaping the reply

| Module | Brake |
|---|---|
| `conversation-state.ts` | Repeated shape, offers already made, coverage gaps, impatience, hesitation, closing |
| `reply-density.ts` | How much one reply asks the reader to absorb |
| `strip-markup.ts` | Markdown out, one question per message |
| `reply-guard.ts` / `safe-fallback.ts` | Discard a broken reply, in the visitor's language |
| `reply-accuracy.ts` | Figures that trace to nothing the business said (watch-only) |

`reply-density.ts` counts **figures + names + lines**. A reply carrying
the implant brand, the crown brand, both warranties, three stages and a
question is four replies' worth. Note what it cannot see: a spelled-out
number, or a brand written in Chinese characters. It undercounts
consistently, which is fine for a bar calibrated on the same measure and
would not be fine if the number were reported as "facts".

### Reading the gap between them

| Module | Question it answers | How |
|---|---|---|
| `answer-gap.ts` | Does the business's own material answer what was just asked? | Sonnet, after the reply, names the entry — the boolean is derived in code |
| `question-short.ts` | What is this question, in the team's language, with no personal detail? | Sonnet, then checked in code |
| `unanswered-questions.ts` | Is this the same question someone already asked, and has it been dismissed? | Cosine over the *short* version, plus two tested rules |
| `capture-unanswered.ts` | Orchestrates the four steps, cheapest gate first | Classifier key → reserve a slot → judge → record |

This is the one detector pointed at the **business**, not the visitor:
its output is a dashboard list, "Customers asked — no answer yet", at the
top of the knowledge base page.

Three things about it are load-bearing.

**It never reads the reply.** A reply sounding unsure is not evidence: a
good assistant hedges about a price it does not have *and* about one it
does. The only question asked is whether the written material contains
the answer, asked of the material directly. Detection is structural or it
is nothing.

**Similarity was tried first and failed conclusively.** Cosine against
the stored entries overlapped in all four languages with no usable bar —
"how much do implants cost?" scores 0.520 against a knowledge base full
of implant entries, none carrying a price. The run is in
`docs/answerability-detection.txt` and the rejected harness is kept as
evidence. Similarity measures *topic*; this question is about *presence*.

**The judge is asked for evidence, not a verdict.** It must name the
numbered entry that answers the question, and `answered` is computed here
from whether that index is real. Asking a model for a boolean beside its
reasoning produced answers where the two disagreed.

It fails toward "answered", always. A missed gap costs a dashboard row
nobody sees; a false gap tells an owner to re-add their own warranty,
which is exactly what made the card before this unusable.

**When retrieval comes back, this needs one change.** The judge
deliberately sees the *whole* knowledge base rather than what retrieval
selected, because a question answered by an entry retrieval *missed* is
our bug and must never reach an owner's dashboard as their homework.
Once `RAG_RETRIEVAL_ENABLED` is true, add a title index to the judge's
material so a verdict can distinguish "not in the knowledge base at all"
from "in it but not retrieved" — the second is an engineering ticket, not
an owner's to-do. Not built now: with retrieval off the two are the same
thing, and building for a branch nobody takes is how dead paths start.

### Protecting the business

| Module | Rule |
|---|---|
| `tenant-settings.ts` | `contact.owner_phone` is private and never reaches the model; only `contact.whatsapp` may be shared |
| `phone-number.ts` | Flags a stored number with no country code, so a rep abroad can dial it |
| `test-tenant.ts` | No script may hold a conversation with a real tenant |
| `keep-alive.ts` | Work that must outlive the response actually does |

`keep-alive.ts` exists because `void extractAndSaveLead()` before
`return` is killed on Vercel. Reproduced 4/4 on production before the
fix, 4/4 after. It checks for the request context itself rather than
trusting `waitUntil` to no-op silently.

---

## Test harnesses, and when to run which

### `test-*.ts` — pure, fast, free

No network, no model, no database. Run the lot before any push; the
pre-push hook runs the typecheck and build but not these.

One exception, and it is deliberate: `test-capture-cap.ts` talks to the
database, because the bound it checks is a Postgres advisory lock and a
faked lock proves nothing. It still makes no model call.

```sh
npx tsx scripts/test-punctuation.ts     # and every other test-*
```

Three deserve special mention:

- **`test-test-tenant-guard.ts`** sweeps every script for a direct
  `fetch` to `/api/chat`. It also checks its own matcher against a sample
  of a forbidden call and an allowed one — because the pattern was once
  narrowed to let a script through, and "narrower" is one edit from
  "switched off".
- **`test-no-images.ts`** has a structural leg and a `LIVE=1` leg that
  asks the model in four scripts.
- **`test-dialect-judge.ts`** validates a *measurement instrument*, not
  the product. Needs the API.

### `measure-*.ts` — numbers, cost money

Produce before/after figures, written to `docs/`. Use `LABEL=before` /
`LABEL=after`, and keep both files.

| Script | Reports |
|---|---|
| `measure-coverage.ts` | Does pre-close coverage fire, per class |
| `measure-coverage-answered.ts` | Does it re-ask what was already answered |
| `measure-coverage-photos.ts` | Asks once, accepts a refusal, stays quiet for a price-list business |
| `measure-reply-density.ts` | Units/blocks per reply, and dialect mirroring |
| `measure-latency.ts` | End-to-end round trip **with reply word counts** |
| `measure-shape.ts` | Paragraph and question-ending distribution |
| `classify-eval.ts` | Precision/recall against 71 labelled cases |
| `measure-answer-gap.ts` | Precision/recall of the answer-gap judge, per language, `SPLIT=tune\|heldout` |
| `measure-answer-gap-cost.ts` | What the judge adds per conversation, and whether caching holds |
| `measure-question-grouping.ts` | Whether a similarity threshold can group two short questions |

`measure-answer-gap.ts` reads `SPLIT`. Tune on `tune`; run `heldout`
**once**, at the end, and report that. The labels and the split live in
`scripts/answer-gap-cases.ts` and were committed *before* the judge
existed — a label adjusted after seeing a verdict is a label fitted to
the verdict.

Both answer-gap scripts refuse to report a clean sheet on nothing. The
first run of the measurement harness had every call fail on a billing
refusal and printed "precision 100%, recall 100%, ZERO false gaps",
because an empty tally defaulted to perfect. Null scores now print `—`
and any unreachable call exits 1. The cost script has the same guard
from the other direction: it forces a cold cache with a run-stamped
marker and exits 1 if the first call is a cache *read*, because a warm
window made it report a per-conversation cost five times too low.

`measure-latency.ts` records word counts because latency without output
length is uninterpretable: a turn that got slower because the model wrote
more is a different finding from one that got slower because the route
does more. Its turns are **frozen** so runs stay comparable with every
number in `docs/latency-*.txt`.

### `smoke-test.ts` — the real deployment, after every push

Six conversations, one per failure class, against the production URL.
Asserts: no safe fallback, every reply in the visitor's script, a
step-back is not answered with a re-pitch, and the lead saved with name
and number. Runs in CI on Vercel's `deployment_status` event.

Every conversation asks for the process **step by step** on purpose: the
guard bug only fired on replies formatted as a list, and a first draft of
this file passed against the broken build because no turn ever provoked
one. *A smoke test that cannot fail on a known-bad deployment is
decoration.*

### `live-*.ts` and `diagnose-*.ts`

Run by hand against a deployment when chasing something specific.

---

## What is deliberately NOT built

The reasons matter more than the list.

**Image sending.** Removed entirely after three sessions where every fix
revealed another layer. 3,500 lines deleted. Dashboard photo upload went
with it — a dead path nobody exercises is how an empty test tenant went
unnoticed for days. Visitors uploading *their own* photos is a different
path and is core to the product.

**RAG retrieval of knowledge entries** (`RAG_RETRIEVAL_ENABLED`). Off: it
duplicated the category dump already in the prompt and cost a round trip
on the critical path. Embeddings are still used — for coverage relevance.

**A two-signal classifier prompt.** Tried, measured, rejected. See above.

**Asking the business our own questions.** Built as a twelve-question
guided-entry card, used by an owner, removed — 1,845 lines. Not buggy;
the wrong shape. It read "0 of 12" while the warranty, the brands, the
durations and the packages all sat in the list below it, so the owner was
being asked to redo work they had done. What replaced it asks the
business nothing and shows it what real customers asked instead.

**A similarity pre-filter in front of the answer-gap judge.** It would
only have been a cost saving, and the measurement says similarity cannot
tell answered from unanswered at any threshold — so the filter would
have discarded real gaps before the judge ever saw them.

**Model-judged grouping of captured questions.** Grouping uses cosine
over the short version, and the distributions overlap: no threshold
separates "same question, different words" from "same topic, different
question". The bar is set high (0.75) so it never merges wrongly, which
means it sometimes lists one question twice. A model call per captured
question would fix it and is not worth it — a duplicate line is visible,
self-correcting, and costs an owner nothing.

**Lead deduplication beyond 24 hours.** Resume restores a conversation
for 24h, measured from its *first* message. A visitor returning on day
three gets a new session, a correctly-counted conversation and a second
lead row. Fixing that wants a long-lived *visitor id* that links leads
without resuming anything. Widening the resume window would be the wrong
fix: metering is idempotent per session id, so a 30-day session is 30
days of conversation for the price of one.

**`conversations.media_url`.** Dead in code, not dropped. Unlike
`pending_offer` it is a *record* — which image was actually sent to a real
visitor. Deleting it would destroy history to tidy a schema.

**Trimming an over-long reply in code.** Density is reported to the model
as a fact about its *last* reply; nothing truncates prose. This project
has already shipped one truncated reply.

---

## Known limitations, stated plainly

- **The density brake is reactive, and its measured effect is modest.**
  It catches the second wall of text, not the first; the standing prompt
  instruction aims at the first and is weaker by construction. Measured
  over 70 replies (`docs/reply-density-*.txt`), overloaded replies went
  from 17/70 to 13/70 — but that splits into 11/42 → 5/42 on a single
  pass of six classes and 6/28 → **8/28** on four repeats of Arabic. The
  six-class figure alone reads as a halving and should not be quoted on
  its own. Worst case fell (12 units → 10) and the shape of the worst
  replies improved, but at n=70 this is a nudge, not a fix.
- **Dialect mirroring did not work.** Drift is real — the judge catches
  genuine Levantine and Egyptian markers (`تقدر`, `يبقى`, `نقدر`) in
  replies to a Modern Standard Arabic visitor. But it runs at roughly 1
  in 25, and after the instruction the rate went 2/50 → 4/50, i.e. up.
  Some of those are judge imprecision — `لما` was flagged and is ordinary
  Modern Standard Arabic — so the true rate is lower than either figure
  and the two are indistinguishable at this sample size. The instruction
  is kept because it is correct and costs nothing. It is **not** a fix,
  and `scripts/test-dialect-judge.ts` plus the harness are the only
  durable things that came out of this.
- **Resume dedupes a returning browser, not a returning person.** Phone
  then laptop is still two leads.
- **The answer-gap judge is weak on partially answered questions.**
  Held-out: precision 100% in all four languages, recall 75% overall
  (Turkish 60%), and only 4 of 8 partials caught. A question the material
  answers *in part* — "a 5-star hotel is included" against "how many
  nights?" — reads as answered to the judge about half the time. Shipped
  knowingly: precision over recall stands, because the error that costs
  trust is telling an owner to write what they already wrote. Ten more
  cases were added after that run to tell a real Turkish weakness from a
  small sample.
- **Captured questions can appear twice.** See grouping, above. At the
  shipped threshold, 9 of 14 labelled same-meaning pairs stay separate.
- **A captured question's short version is checked, not verified.** The
  code rejects an empty line, a second line, an over-long one, a long
  digit run and a contact detail. It cannot check that a name was
  removed. That is why the customer's own words stay in `question_raw`
  and the dashboard links to the transcript — the short version is a
  convenience, never the record.
- **The assistant can commit the TEAM to sending photos.** Rule 3 stops
  it claiming a limitation it does not have, and `lib/no-images.ts`
  stops it implying it will send an image itself. Neither covers what it
  said to an Arabic visitor on 2026-10-17: *"فريقنا سيرسل لك صور قبل
  وبعد مباشرةً على الواتساب"* — our team will send you before-and-after
  photos directly on WhatsApp. For prof-clinic that is approved and
  true: the clinic has three before-and-after entries and a WhatsApp
  number, and a human does send them. It is a promise made on the
  business's behalf, though, and nothing checks the business ever agreed
  to it. **Open:** for a tenant that does not share photos, a reply like
  this is a commitment it cannot keep, and the fix is probably a fact
  the business states rather than a prompt rule. Not built — no tenant
  is in that position today.
- **CI holds a service-role key** that can read every tenant's leads.
  Acceptable while there is no real customer data. **Launch blocker:**
  replace it with a narrow read-only endpoint scoped to `is_test` tenants
  before the first paying clinic goes live.

---

## Before the first paying customer

Nothing here is needed while test-clinic and prof-clinic are the only
tenants and nobody is paying. Every item is a thing that is survivable
today and is not survivable the day a clinic is paying for uptime.

- **Enable auto-reload on the Anthropic account.** Credit ran out on
  2026-10-12 and production chat served the safe fallback to every
  visitor for three days. That is the deliberate arrangement for now:
  there are no real customers, the account emails when credit runs out,
  and it gets topped up at the start of a working session. It stops
  being acceptable the moment a clinic is paying — a billing threshold
  crossed on a Friday is a weekend of degraded chat.
- **Build a degraded-chat alert.** The outage lasted three days because
  graceful degradation is invisible: `/api/chat` returns HTTP 200 and a
  safe fallback in the visitor's language, so nothing errors, nothing
  pages, and the only way to know is to look. The `degraded` flag is
  already on the response and `scripts/live-degraded-check.ts` already
  knows how to read it — what is missing is something that runs it, or
  reads the same flag off real traffic, and shouts. The same shape of
  blindness hid an empty test tenant for days and would hide a silently
  broken judge cron.
- **Replace CI's service-role key** with a narrow read-only endpoint
  scoped to `is_test` tenants. Stated in full under Known limitations:
  the key can read every tenant's leads, which is acceptable only while
  no tenant holds real customer data.

---

## Where the receipts are

`docs/` holds every measurement that has been taken, before and after.
When a number appears in a code comment, the run behind it is in there
under a matching name. If you change a threshold, add the run that
justifies it.
