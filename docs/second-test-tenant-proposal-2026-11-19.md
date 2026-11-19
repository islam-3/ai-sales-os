# Proposal: a second, non-clinic test tenant (step 8)

For review before anything is created or anything paid runs. Nothing
here exists yet.

## Why this business

The final check of the OpenAI-only migration should run somewhere no
prompt, test or habit was ever tuned on. A real estate agency in
Istanbul shares the city and the international visitors with the clinic,
so the six failure classes still apply, but everything else is
different: no treatment, no patient, no photo of the visitor's own case,
long decisions, money in hundreds of thousands, legal paperwork, and
renters as well as buyers. Anything dental that leaks into a reply here
is a bug that is visible at once.

## 1. The tenant

| Field | Value |
|---|---|
| slug | `test-realty` |
| business_name | `TEST — Bosphorus Key Realty (automated runs)` (same pattern as test-clinic) |
| industry | Real estate agency |
| description | We help international buyers and renters find apartments and villas in Istanbul, from Beşiktaş and Sarıyer on the European side to Kadıköy on the Asian side. Our team speaks English, Arabic, Russian and Turkish, arranges viewings in person or by video, and handles the title deed (tapu) process and residence permit paperwork for buyers. |
| settings.is_test | `true` (every test-only switch, and nothing else, depends on this) |
| settings.location | address "Büyükdere Cad. 185, Levent", city Istanbul, country Turkey |
| settings.chat_language | English |
| settings.lead_language | **Turkish**: the team-language rule is tested with a non-English team on a tenant it was never tuned on |
| settings.languages | English, Arabic, Russian, Turkish |
| settings.opening_hours | Mon–Sat 09:00–19:00 |
| settings.contact.whatsapp | `+90 212 555 01 47` (fictional; 555 is not a real Istanbul line prefix) |
| settings.contact.owner_phone | none |
| Greeting | Terra's English suggestion from step 5: "Welcome to Bosphorus Key Realty in Istanbul. We help international buyers and renters find apartments and villas, with viewings in person or by video. How can we help?" |

## 2. Knowledge entries (12)

Specific facts, numbers and names on purpose: the reply measurement
(measure-reply-specifics) scores whether replies surface them.
**Legal and tax figures are illustrative for a test tenant**, close to
Turkish practice as I understand it but not checked against current law;
please correct anything you know to be off, since a wrong figure here
would be repeated by the assistant to a test visitor.

1. **About us** (About the business): Founded in 2012. 14 consultants, offices in Levent. More than 1,200 homes sold to buyers from 40 countries. Members of the Istanbul real estate association (İSTEMDER, illustrative).
2. **Areas we cover** (Areas): Beşiktaş and Şişli (central, from about USD 4,500 per m²), Sarıyer (Bosphorus views, from about USD 6,000 per m²), Kadıköy (Asian side, from about USD 3,500 per m²), Başakşehir and Beylikdüzü (new-build family compounds, from about USD 1,800 per m²).
3. **Buying as a foreigner, step by step** (Buying): choose the home; sign a reservation agreement with a 5% deposit; get a Turkish tax number and a bank account (we take you to both); a government appraisal report (ekspertiz), required for foreign buyers; the title deed (tapu) transfer at the Land Registry, usually 2–4 weeks from reservation; DASK earthquake insurance before transfer.
4. **Costs on top of the price** (Buying): title deed fee 4% of the declared value; our commission 2% plus VAT; appraisal report about USD 300; sworn translator at the Land Registry about USD 150.
5. **Citizenship by investment** (Citizenship by investment): property worth at least USD 400,000, kept for 3 years; the application takes about 6–9 months after the title deed; we work with a partner law firm, Aydın & Partners, for the application.
6. **Residence permit through property** (Residence permit): a home worth at least USD 200,000 in Istanbul qualifies the buyer for a short-term residence permit, renewed every 1–2 years.
7. **Renting** (Rentals): contracts of at least 12 months; a deposit of one to two months' rent; our fee is one month's rent; we do not handle short-term or holiday lets.
8. **Viewings and viewing trips** (Viewings): in person Monday to Saturday, or live by video on WhatsApp. For buyers flying in, we plan a 2–3 day viewing trip with airport pickup and up to 10 viewings.
9. **New-build and off-plan** (New-build): developer payment plans of up to 36 months without interest on off-plan homes; handover dates are in the contract.
10. **Earthquake safety** (Buying): we recommend buildings permitted after the 2000 building regulations and give every buyer the building's permit year and an engineer's report before reservation.
11. **After the purchase** (After-sales): furnishing packages from USD 8,000 for a two-bedroom flat; property management for owners who rent out, at 8% of the rent.
12. **Mortgages** (Buying): Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full.

**Deliberately NOT covered**, so the capture path has real gaps to find:
pets, parking, international schools nearby, a specific listing's
current price, payment in cryptocurrency, and the visitor's tax at home.

Expected coverage relevance, derived from these entries by the existing
code (to verify, not assume): travel dates and origin relevant (viewing
trips); health and a photo of the visitor's own case NOT relevant. The
assistant should never ask a buyer for a photo.

## 3. Smoke conversations (6 failure classes, 7 turns, same slots as the clinic's)

Turn order as scripts/_smoke-cases.ts: opener, situation, price
question, process question, hesitation (turn 5, index 4), name, number.
Numbers in each visitor's own country format with the code, as the
clinic set does.

| Class | Turns |
|---|---|
| **English** (Latin) | "hi, we're looking to buy an apartment in Istanbul" · "we're relocating from London next year with two kids, so probably 3 bedrooms" · "what would something like that cost?" · "how does buying work for a foreigner, step by step?" · "honestly we need to think about it and talk it over as a family first" · "Emma" · "+44 7700 900456" |
| **Arabic** (RTL, ؟) | "مرحبا، أبحث عن شقة للشراء في إسطنبول" · "أريد شقة ثلاث غرف قريبة من البحر، للسكن مع عائلتي" · "كم الأسعار تقريباً؟" · "ممكن تشرح لي خطوات الشراء للأجانب؟" · "بصراحة أحتاج أفكر وأتكلم مع زوجتي أولاً" · "عمر" · "+966 55 123 4567" |
| **Russian** (Cyrillic) | "Здравствуйте, хочу купить квартиру в Стамбуле" · "Ищу двухкомнатную с видом на Босфор, для себя и как инвестицию" · "Сколько это примерно стоит?" · "Объясните, пожалуйста, как проходит покупка для иностранца?" · "Честно говоря, мне нужно подумать и посоветоваться с мужем" · "Анна" · "+7 916 123 4567" |
| **Chinese** (no spaces) | "你好，我想在伊斯坦布尔买房" · "想买一套两居室，主要是投资，也在考虑入籍" · "大概多少钱？" · "外国人买房的流程是怎样的？" · "说实话我需要考虑一下，还要和太太商量" · "李明" · "+86 139 1234 5678" |
| **Turkish** (dotted/dotless i) | "merhaba, İstanbul'da daire bakıyorum" · "Almanya'da yaşıyorum, emeklilik için deniz manzaralı bir yer istiyorum" · "fiyatlar ne kadar?" · "satın alma süreci nasıl işliyor, adım adım anlatır mısınız?" · "açıkçası biraz düşünmem ve eşimle konuşmam lazım" · "Ayşe" · "+49 151 2345 6789" |
| **Spanish** (¿ ¡) | "hola, estoy buscando un piso en Estambul" · "me mudo por trabajo y busco alquilar algo de dos habitaciones cerca de Levent" · "¿cuánto cuesta el alquiler?" · "¿cómo funciona el proceso para alquilar siendo extranjero?" · "sinceramente necesito pensarlo y hablarlo con mi pareja" · "Lucía" · "+34 612 345 678" |

The Spanish visitor rents rather than buys, so one conversation tests a
different path through the same material.

## 4. What step 8 would check, with bars to set before it runs

1. **The smoke hard checks**, unchanged: no safe fallback, reply in the
   visitor's script, hesitation detected, lead with name and number.
2. **Classifier latency on Vercel: Luna p95 under 2,000 ms** (your hard
   bar). Needs one free code change first: the classifier's elapsed time
   in the test-only response fields, so it is measured on the deployed
   route and never shown to a real tenant.
3. **No clinic leakage**: no reply mentions teeth, implants, a clinic,
   a patient, treatment or a photo of the visitor's case, in any
   language. Generic check: words from test-clinic's material that are
   absent from this tenant's.
4. **Specifics and handoff** (measure-reply-specifics on this tenant's
   own material): first replies carry its facts; no early handoff.
5. **Lead in the team's language (Turkish)**, visitor's own words
   verbatim, no invented figures.
6. **Capture**: the gate and judge record a question about something not
   covered (parking, pets) and do not record an acceptance or a covered
   question. Two extra visitor turns, test tenant only.
7. **OpenAI only, proved**: every usage_events row for these sessions
   has provider `openai`. Zero Anthropic rows.

## 5. What it needs first (free code, then your review)

- A test-tenant switch that puts EVERY call on OpenAI at once
  (classifier and coverage on Luna, reply, extraction, judge and
  shortener on Terra), honoured only when `is_test` is true, with free
  tests that a real tenant can never get it. Today each experiment has
  its own switch.
- The classifier latency field above.
- A creation script for the tenant and its 12 entries, dry-run first,
  writing nothing without `APPLY=1`. Embeddings for the entries are
  OpenAI, about $0.001.
- The six conversations as a second case set the smoke harness can
  target by slug.

## Cost, to measure before quoting

Deploying the code above means a push, so the production smoke run on
test-clinic (about $0.49 at today's Sonnet mix). Then 6 conversations
x 2 runs on test-realty, all OpenAI. Measured on test-clinic on
2026-11-19: $0.0248 a conversation with the reply and extraction on
Terra and the classifier still on Haiku; with Luna as the classifier,
about $0.02. So about $0.25 for 12 conversations with the extra capture
turns and the checks. One measured conversation first, as always.
