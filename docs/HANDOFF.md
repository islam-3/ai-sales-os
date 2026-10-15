# Handoff — 15 October 2026

Written at the end of a long session, for whoever picks this up next
(including me). README.md is the durable reference; this file is the
state of play and the reasons behind the recent decisions.

---

## 0. READ THIS FIRST: production chat is degraded

**No Anthropic call has succeeded since 2026-10-12 08:17 UTC — three
days.** Confirmed against production:

```
POST /api/chat {"slug":"test-clinic", ...}
  -> {"reply":"عذراً، هل يمكنك أن تعيد ما قلته...","degraded":true}
```

Every visitor to **prof-clinic, the real clinic**, is getting the safe
fallback in their own language instead of an answer. The graceful
degradation is working as designed — nobody sees a 500 — which is also
why it is invisible unless someone checks.

Almost certainly the Anthropic account is out of credit; it has happened
twice before in this project. Confirm in the Anthropic console, top up,
then re-check with the one-line curl above and look for `degraded` to be
absent.

Nothing else in this document can be verified live until that is fixed.

---

## 1. The feature: "Customers asked — no answer yet"

Replaced a twelve-question guided-entry card that was built, used by the
owner, and removed (−1,845 lines). It was not buggy; it was the wrong
shape — it asked the business our questions and counted their answers,
reading "0 of 12" while the warranty, the brands and the durations all
sat in the list below it.

What replaced it asks the business nothing. It records what real
customers asked that the business has no answer for, and offers those
back through the add-entry form that already exists.

### Built and pushed

| Piece | Where |
|---|---|
| Table + RLS | `supabase/migrations/20261013000000_unanswered_questions.sql` — **applied** |
| The judge | `lib/answer-gap.ts` |
| PII-free rewrite | `lib/question-short.ts` |
| Grouping + dismissal rules | `lib/unanswered-questions.ts` |
| Orchestration | `lib/capture-unanswered.ts` |
| Shared business facts | `lib/business-prompt.ts` → `businessFactLines()` |
| Starter suggestions | `lib/starter-questions.ts` |
| Dashboard list | `components/dashboard/settings/UnansweredQuestions.tsx` |
| Dismiss / restore | `app/dashboard/settings/unanswered-actions.ts` |
| Conversation view | `app/dashboard/conversations/[sessionId]/page.tsx` |
| Deployment marker | `app/api/version/route.ts` |

### Verified live, on test-clinic

Ten rows were captured through production by the Oct 12 smoke test and
are still there. They prove the end-to-end path:

```
7x  How much does it cost?                      [arabic, cyrillic, latin]
2x  What are the steps of the entire process?   [latin]
1x  What are the detailed steps of the treatment? [arabic]
```

The 7× group is `how much does it cost?`, `كم التكلفة؟`,
`Сколько это стоит?`, `费用是多少？`, `Fiyat ne kadar?` and
`¿Cuánto cuesta?` **grouped into one line across five languages** —
which is the whole reason grouping runs on the short version rather than
the raw text. Every short version came back in English, the team's
language, with no personal detail.

### NOT verified live

Two changes landed after the last successful call and have never run
against a real deployment:

1. **The five-key gate** (`asking_for_information || direct_request`).
   The ten rows above were captured by the OLD question-mark gate — note
   every one of them ends in a question mark.
2. **The settings fix** (`businessFactsForJudge`). See §2.3.

`scripts/live-capture-check.ts` exists to verify both. It is written,
committed, and was stopped after two turns when the replies came back
degraded. **~50 Anthropic calls, ~$0.19. Ask before running it.**

---

## 2. Decisions this session, and why

### 2.1 Sonnet for the judge, not Haiku

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

### 2.2 The five-key gate

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

### 2.3 `businessFactLines()` as the single source

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

### 2.4 Grouping threshold 0.75, and why it under-merges

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

**This is visible in the live rows above**: "What are the steps of the
entire process?" and "What are the detailed steps of the treatment?" are
two lines that arguably should be one. The measurement predicted it.

If under-merging becomes the complaint, the fix is a model call per
captured question, not a lower number — and a duplicate line does not
justify that cost.

### 2.5 Deferred batching: a ready lever, not built

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

### 2.6 Cost per conversation

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

## 3. Standing rules

1. **test-clinic only.** No script holds a conversation with a real
   tenant; `scripts/_chat-client.ts` enforces it before the first
   message and `scripts/test-test-tenant-guard.ts` sweeps for bypasses.
   prof-clinic is read-only, and only for diagnosis.
2. **No script that calls Anthropic or OpenAI runs without first stating
   the number of calls and the estimated cost, and waiting for a yes.**
   Credit running out takes production chat with it — see §0.
3. **Commit before any `git checkout`/`reset`.** Uncommitted work in two
   lib files was destroyed that way earlier in this project.
4. **A feature that adds a model call states what it adds to the cost
   number in README.md before it is approved.**
5. Code over prompt wording. Measure, don't reason. Never claim a
   limitation we do not have.

---

## 4. Open items

**Blocking:**

- Top up Anthropic credit. Nothing below can be verified until then.

**Then, in order:**

1. Run `scripts/live-capture-check.ts` (~50 calls, ~$0.19) against
   production with `BASE_URL` set. It verifies the five-key gate and the
   settings fix — the two things not yet proven live. Check
   `/api/version` returns the expected commit first.
2. Browser check on test-clinic — see §5.
3. Run `SPLIT=heldout` on `scripts/measure-answer-gap.ts` once, to score
   the ten new Turkish-weighted cases (33 cases × 4 languages = 132
   calls, ~$0.25 at the warm rate).

**Found, not fixed:**

- **`detectScript` misses short CJK.** `MIN_CHARS = 8` in
  `lib/visitor-language.ts` is a length floor tuned for alphabetic
  scripts. `费用是多少？` is 6 characters, so it qualifies as no script
  at all — visible in the live rows above as a null `script` on the
  Chinese row while Arabic, Cyrillic and Latin all resolved. It also
  weakens the lead-routing veto for CJK visitors, which matters more
  than the dashboard label. Fixing it means changing a threshold, so it
  needs the six-class measurement before and after, not a guess.
- **`judge_note` comes back in the visitor's language**, not the team's
  — Arabic, Turkish and Spanish notes are in the live rows. Nothing
  renders it today, so it is cosmetic until something does.

**Longer term:**

- **Launch blocker:** CI holds a service-role key that can read every
  tenant's leads. Replace it with a narrow read-only endpoint scoped to
  `is_test` tenants before the first paying clinic.
- Title index for the judge when `RAG_RETRIEVAL_ENABLED` goes true, so a
  gap can be told from a retrieval miss. Noted in README; not built.

---

## 5. Browser checklist (test-clinic)

The ten captured rows are already there, so most of this works **without
credit**. Only steps 5–6 need a working chat.

1. `/dashboard/settings` → **"Customers asked — no answer yet"** at the
   top, above the search box, with three lines. The first reads
   **"7 customers asked"** and lists `arabic, cyrillic, latin`.
2. Click **[Add answer]** on the 7× line → the ordinary add-entry form
   opens with the title prefilled and the page scrolls to it. It must be
   the *same* form used by "Add entry", not a second one.
3. Click **Read the conversation** → `/dashboard/conversations/<id>`,
   read-only, visitor's words untranslated. Check an Arabic conversation
   renders right-aligned and an English one left-aligned **on the same
   page** — `dir="auto"` is per message, not per page.
4. **Dismiss** a line → it disappears; "1 dismissed question" appears at
   the foot of the page, expands, and **Bring back** restores it.
   Dismissing writes to the canonical row only.
5. *(needs credit)* Open `/chat/test-clinic`, send `اعطيني السعر` — no
   question mark — and confirm a row appears. The old gate would have
   missed it entirely.
6. *(needs credit)* Send `what are your opening hours?` and confirm **no
   row appears**: it is answered from settings, and this is the §2.3
   fix.
7. Both light and dark theme, and at phone width.

---

## 6. Where the receipts are

`docs/` holds every measurement, before and after. If a number appears
in a code comment, the run behind it is in there under a matching name.
If you change a threshold, add the run that justifies it.

Relevant to this session: `answer-gap-heldout.txt`,
`answer-gap-tune-*.txt`, `answerability-detection.txt` (the rejected
similarity detector, kept as evidence), `classifier-five-key-2026-10-11.log`.
