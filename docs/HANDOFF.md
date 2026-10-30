# Handoff — 30 October 2026

The state of play at the end of a session, for whoever picks this up
next. README.md is the durable reference; this file is what is live,
what has been proven, and what is still open. The decisions from the
15 October handoff that still hold are kept at the end (§6).

---

## 0. Production

**URL: https://ai-sales-os-drab.vercel.app**

Check which commit is serving before any live check. A check that runs
against the previous build proves nothing about this one:

```sh
curl -s https://ai-sales-os-drab.vercel.app/api/version
```

CI holds the same URL as the `PRODUCTION_URL` secret.

**Chat is working.** The 12–15 October credit outage is over. Model
calls through `/api/chat` succeeded on 30 October (see §2).

---

## 1. What is live

Production is serving `c2600ce` plus docs/scripts-only commits on top.

| Commit | What |
|---|---|
| `8dc247f` | Doc: nothing in the app ingests an auth link |
| `3819734` | `.gitignore` for the Supabase CLI scratch directory |
| `eb6358e` | "No answer yet" list shows the top 3 by count, then "Show all N questions". Compact rows: count and "Read the conversation" kept, script labels gone, 28px buttons. **"View conversation"** on each lead card |
| `9296a21` | **Dismiss** on the starter suggestions (`settings.dismissed_starters`, no undo). **Smoke test skips capture** via `skipCapture`, honoured only on an `is_test` tenant (`shouldSkipCapture` in `lib/test-tenant.ts`) |
| `6a1e1cc` | Corrected the `LeadProfile.session_id` comment. The column has been NOT NULL since it was created |
| `f0e5f77` `73a5d06` | Grouping candidate, its labels (committed before the run), and the validation output |
| `82f4625` | **Grouping is decided by the model**, see §1.1 |
| `c2600ce` | Conversation page "Back" link follows `?from=leads` / `?from=questions`. Missing or unknown goes to leads |
| `79b5345` | `scripts/live-grouping-check.ts` |

### 1.1 Grouping, as built

The 0.75 embedding threshold no longer decides anything. It
under-merged exactly as its own measurement predicted: test-clinic has
three separate lines asking for the steps of the process.

Now the shortening call, which already ran once per captured question,
also picks the group (`shortenAndMatch` in `lib/question-short.ts`):

- **It is shown at most 10 existing groups** (`MATCH_CANDIDATES`). With
  10 or fewer, all are sent and nothing is ranked, which is exactly the
  validated condition. With more than 10, the 10 nearest are sent
  (`nearestGroups`).
- **The ranking embeds the customer's raw words**, not the short line.
  The short line is the output of the very call the candidates are for,
  so it can't be used to choose them. Raw Arabic against English titles
  ranks less well than English against English.
- **Every way it fails ends in a duplicate line, never a hidden
  question.** A group that isn't shown can't be chosen, an unreadable
  reply counts as "new", and a failed ranking embedding sends no
  candidates.
- **Cost:** the call goes from $0.00123 to **$0.0022**, flat however
  many groups a tenant has. That's +$0.00097 per captured question and
  +$0.0039 per conversation at the row cap. It's in README.md, along
  with the call type `question_candidate_embedding`.

**Existing rows are not regrouped.** test-clinic still shows three
"steps" lines and two price lines. New asks join one of them.

---

## 2. What is verified

| What | How | Result |
|---|---|---|
| Grouping, offline | `scripts/measure-question-match.ts`, 41 labelled cases × 3 runs, 10 groups. Labels committed before the run | **0 wrong merges, 0 splits**, all rewritten questions passed their checks. `docs/question-match-2026-10-30.txt`. $0.2647, against ~$0.20 quoted: the per-call cost was $0.0022, not the $0.0015 estimated |
| Grouping, live | `scripts/live-grouping-check.ts` against `c2600ce`. test-clinic had **11** groups, so the over-10 ranking ran | **Both PASS.** English "how does the treatment go, step by step?" and Arabic "ممكن تشرح لي مراحل العلاج خطوة بخطوة؟" each joined "What are the detailed steps of the treatment?". $0.063 total, $0.0022 per shorten-and-match call, as README says |
| Smoke test skips capture | test-clinic since 29 Oct: ~14 smoke sessions across three runs, **0 captured rows, 0 judge calls**. The only two judge calls were the live grouping check | Works in production. The `is_test` restriction is checked by `scripts/test-capture-skip.ts` |
| Smoke CI | GitHub check runs | `6a1e1cc` pass, **`82f4625` fail** (below), `c2600ce` pass |
| Code | `tsc`, `next build`, `test-unanswered-questions`, `test-capture-skip`, `test-test-tenant-guard`, `test-business-facts` | All pass |

**The `82f4625` smoke failure:** Arabic turn 5 answered the hesitation
in 41 words, which was 64% of its longest earlier reply (64 words),
against a 60% maximum. The hesitation reply was normal length; the
calibration run had it at 39 words. What was unusual was the
denominator: that run's earlier replies were short, where the
calibration run's longest was 116. Grouping can't have caused it,
because capture runs after the reply and the smoke test skips capture.
The next deployment passed. Logged as an open item, not fixed.

**Not verified: anything in a browser.** The UI changes in `eb6358e`,
`9296a21` and `c2600ce` have only been typechecked and built. See §5.

---

## 3. Open items

**Measure before changing:**

1. **Grouping recall with more than 10 groups.** How often the right
   group makes the top 10 when ranking a customer's raw words against
   English short lines, across the six failure classes. Embedding calls
   only (a fraction of a cent), but per the standing rule state it and
   wait for a yes. Not urgent: no real tenant has more than 10 groups.
   test-clinic has 11, nearly all from test traffic. Do it before any
   real tenant gets near 10.
2. **The smoke test's hesitation ratio** (`HESITATION_MAX_RATIO = 0.6`,
   `scripts/smoke-test.ts`) is sensitive to how long the earlier
   replies happened to be. One failure in three runs so far. Don't move
   the number by eye; if it recurs, measure across runs and consider a
   different denominator.
3. **`live-capture-check.ts`** (five-key gate plus the settings fix,
   ~50 calls, ~$0.19) and **`SPLIT=heldout`** on the ten Turkish-weighted
   answer-gap cases (132 calls, ~$0.25). Neither has a receipt in
   `docs/`, so treat both as not run. Capture working live (§2) is
   evidence for the five-key gate, not proof of it. Both messages in
   that check also ended in a question mark.

**Known, accepted:**

4. Starter dismissals have no undo. They are our generic suggestions,
   not something a customer asked.
5. The README's deferred-batching table still uses the old $0.00123
   rewrite cost. It says so above the table; the trend is unchanged.

**Carried from 15 October, still open:**

6. `detectScript` misses short CJK (`MIN_CHARS = 8` in
   `lib/visitor-language.ts`). It needs the six-class measurement
   before and after.
7. `judge_note` comes back in the visitor's language. Nothing renders
   it yet.
8. **Launch blocker:** CI holds a service-role key that can read every
   tenant's leads. Scope it to `is_test` tenants before the first
   paying clinic.
9. Title index for the judge once `RAG_RETRIEVAL_ENABLED` goes true.

---

## 4. Next step

The browser checklist in §5. It's the only part of this session's work
nobody has looked at. Then, only if the Arabic hesitation failure
recurs, item 2.

---

## 5. Browser checklist

First, `/api/version` should show `c2600ce` or later.

1. **`/dashboard/settings` on test-clinic:**
   - At most 3 lines, then "Show all N questions". Expanding shows
     "Show fewer".
   - Each row reads "N customers asked · Read the conversation". No
     script labels, small buttons.
2. **Read the conversation** from that list: the back link says
   "Back to the knowledge base" and goes to settings.
3. **`/dashboard` (leads):** "View conversation" next to the date opens
   that lead's transcript. The back link says "Back to leads" and goes
   to `/dashboard`.
4. Open `/dashboard/conversations/<id>` with no `?from=`: the back link
   says "Back to leads".
5. **Starter Dismiss** needs a tenant with **no** captured questions;
   test-clinic has 48.
   - Dismiss one: it goes, and the other three stay.
   - Reload: still gone.
   - Save the Business page's brand settings and come back: still gone.
     This is the round trip the parser change protects.
6. Light and dark theme, and phone width.

---

## 6. Decisions from 15 October that still hold

### 6.1 Sonnet for the judge, not Haiku

Haiku reached 100% recall on the tune split and produced **three false
gaps** — each one telling an owner to rewrite something they had already
written. It would not accept that a customer's everyday word for a part
("screws that go in the jaw") is the business's technical name for it
("Implant Swiss"), even while naming the brand in its own note. A prompt
rule took it from 5 to 3, not to 0.

Sonnet: **zero false gaps, all four languages, both splits.**

Held-out numbers, run once at the end (`docs/answer-gap-heldout.txt`):

- precision **100%** in en/ar/ru/tr
- recall **75%** overall, **60%** Turkish
- partials **4 of 8** — the known weak spot, shipped knowingly

Precision over recall is the standing trade: a missed gap costs a
dashboard row nobody sees; a false gap costs the owner's trust, which is
what killed the previous design.

Ten more cases were added to `scripts/answer-gap-cases.ts` after that
run, weighted to Turkish, labelled before running and **not yet
measured**. Run `SPLIT=heldout` once when credit is back.

### 6.2 The five-key gate

`CONTAINS_QUESTION` was free and caught **nothing**: 0 of 57 visitor
messages on prof-clinic contain a question mark, in any script. People
type fragments — `give me the price`, `dental implants`, `اعطيني السعر`.

A keyword list was not an option: the lists this project's classifier
replaced scored **zero recall** on every signal in five of six scripts.

So the gate became one more key on the Haiku classifier that already
runs every turn (~$0.00005/turn). Validated at 570 calls, 3 runs, 120
cases, paired against the four-key prompt in the same run
(`docs/classifier-five-key-2026-10-11.log`):

| | Precision | Recall |
|---|---|---|
| `asking_for_information` alone | **100%** | 42% |
| `… \|\| direct_request` | **100%** | **97.7%** |

**Zero false positives in 360 calls**, all six classes. The 42% is one
systematic behaviour — the model partitions the keys, so a request to be
shown photos sets `direct_request` and leaves this one false, in every
class and every run. `direct_request` scored 100/100 in the same run and
there is no labelled case where it is true and the new key false, so the
OR adds no false-positive surface.

**Adding a key did not cost the other four**: `accepts_offer` +3/+3,
`direct_request` precision +8, the other two unchanged, nothing worse in
any class. Do not read that as "key changes are safe" — read it as "key
changes move the other keys, in either direction, so measure them". Two
previous experiments lost 45 and 38 points by *removing* keys.

Capture now **fails closed** on the classifier: a timeout returns
NO_SIGNALS and nothing is captured. A degraded classifier means a
quietly empty dashboard as well as a quietly blunted assistant.

### 6.3 `businessFactLines()` as the single source

**A real false gap, found by reading two call sites side by side.**

The reply's system prompt carries the business's location, opening
hours, languages, service area, currency and customer-facing contact
details from `tenants.settings`. The judge was handed `knowledge_base`
rows and nothing else.

So a business that filled in "Opening hours" would be told on its own
dashboard that customers asked about opening hours and it has no answer
— for a question the assistant had just answered correctly from that
field. test-clinic has `opening_hours: "24/7"` and
`service_area: "Istanbul"`, and the live check I had written asked
`what are your opening hours?` and asserted it *should* be captured. It
would have reported a false gap as a pass.

Fixed structurally: `businessFactLines()` is the one source,
`buildIdentityBlock` composes from it, `businessFactsForJudge()` wraps
the same lines as one titled entry. **Anything added to that function
reaches both; anything added to the identity block instead reaches only
the reply** — which is what `scripts/test-business-facts.ts` checks,
field by field, with sentinel values. Verified it fails when the bug is
reintroduced (six fields reported by name).

`contact.owner_phone` reaches neither, deliberately: the judge is a
second route to the same exposure, because its material becomes
`question_short`, which is stored and rendered.

### 6.4 Grouping threshold 0.75, and why it under-merges

**Superseded 30 October** (§1.1): the model now decides grouping, and
the threshold only explains why similarity ranks rather than decides.
Kept for the measurement.

Measured, not picked (`scripts/measure-question-grouping.ts`). The
distributions **overlap** — there is no separating threshold:

```
same-meaning pairs       min 0.501  median 0.732  max 0.941
different-meaning pairs  min 0.151  median 0.460  max 0.685
```

`how much does it cost?` vs `what are your prices?` scores **0.529** —
lower than `is the hotel included?` vs `how many nights?` at 0.685,
which are different questions.

So the bar is set by which error is worse. A wrong **merge** hides a
question forever; a wrong **split** shows one twice and is cleared by
answering it once. 0.75 sits 0.065 above the worst different-meaning
pair: zero wrong merges, 9 of 14 same pairs split.

**This was visible on test-clinic**: "What are the steps of the
entire process?" and "What are the detailed steps of the treatment?" are
two lines that arguably should be one. The measurement predicted it.

If under-merging becomes the complaint, the fix is a model call per
captured question, not a lower number — and a duplicate line does not
justify that cost.

### 6.5 Deferred batching: a ready lever, not built

Recorded in README.md under "Ready lever". **Trigger: build it when any
tenant exceeds ~5 conversations/day.**

It saves nothing at one conversation a day (one cold cache write is
unavoidable) and costs the day-one experience, which is the moment an
owner decides whether the product works. Full cost table and the five
things it breaks — day one, silent cron, cap placement, `asked_at`,
per-tenant daily cap — are in the README.

Vercel, from the docs: Hobby allows 100 cron jobs, minimum once per day,
±59 min precision; Pro allows once per minute. Function duration is 300s
hard max on Hobby, which caps one invocation at roughly 50
conversations/day for a tenant.

### 6.6 Cost per conversation

**7.59¢** on test-clinic, from `usage_events` — 4,998 recorded calls,
405 conversations. Regenerate with
`scripts/report-cost-per-conversation.ts` (**no model calls**).

| Call | Per conv | Subtotal |
|---|---|---|
| reply (Sonnet) | 6.28 | $0.03879 |
| lead extraction (Sonnet) | 4.38 | $0.03435 |
| classifier (Haiku) | 6.28 | $0.00273 |
| **total** | | **$0.07587** |

Capture adds **+26%** at prof-clinic's measured rate of 1.6 requests per
conversation (first judge call cold, rest warm), **+34%** worst case at
the cap, **+7%** on a busy tenant.

Four model calls were **unmetered for months** — the classifier,
coverage, and both halves of capture — which made every cost figure this
project had quoted a floor reported as a total. All now call
`recordUsage`. **Every model call must.**

---

## 7. Standing rules

1. **test-clinic only.** No script holds a conversation with a real
   tenant; `scripts/_chat-client.ts` enforces it before the first
   message and `scripts/test-test-tenant-guard.ts` sweeps for bypasses.
   prof-clinic is read-only, and only for diagnosis.
2. **No script that calls Anthropic or OpenAI runs without first stating
   the number of calls and the estimated cost, and waiting for a yes.**
   Credit running out takes production chat with it: it happened
   12–15 October 2026, three days of degraded replies on a real clinic.
3. **Commit before any `git checkout`/`reset`.** Uncommitted work in two
   lib files was destroyed that way earlier in this project.
4. **A feature that adds a model call states what it adds to the cost
   number in README.md before it is approved.**
5. Code over prompt wording. Measure, don't reason. Never claim a
   limitation we do not have.

---

## 8. Where the receipts are

`docs/` holds every measurement, before and after. If a number appears
in a code comment, the run behind it is in there under a matching name.
If you change a threshold, add the run that justifies it.

This session: `question-match-2026-10-30.txt`.
