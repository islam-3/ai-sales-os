# Lead extraction: sonnet vs gpt-6.1-terra, 2026-11-18

Offline, stored test-clinic transcripts: 12 conversations (final turn) + the constructed Arabic-Indic turn, team languages English and Turkish, 2 runs; 3 constructed stated-facts transcripts, once. Output limit 1024 tokens on every model.

Conversations (stored after the 2026-11-04 timestamp fix, no tied rows): English `eee97d63-ed4c-4f8d-8150-6a779e02cf8d`, English `9faece88-125b-452a-8d1b-bab71ad31765`, Arabic `06209320-92d7-4df9-a588-6037d4b48690`, Arabic `9e68ff32-a1b5-40b6-9ad6-0431f8d2360c`, Russian `dcb0905e-74fa-4b66-b4cb-63558f478cea`, Russian `2ddbbfde-dd32-45c6-939d-755ae66f6e6b`, Chinese `cce0512c-caf0-44f1-9010-4eedea2021d0`, Chinese `4a7ab5a8-92d9-422c-8cfe-a48678b7e53e`, Turkish `d398a0e1-8ebb-4587-9d60-ca7feba70da7`, Turkish `7eb488d0-fca6-4679-9109-37a2467c0d92`, Spanish `92985564-d415-43ab-9cee-8940d5c02956`, Spanish `dc082d0f-2bfa-4d8c-ac35-73046d46f97e`.

| Model | Visitor language | Calls | Name | Contact digits | ASCII digits | Visitor language | Age null | Summary in team language | Fields in team language | Invented figures | Score within 15 of Sonnet | Fields filled as Sonnet | Cost per call |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | English | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 14/16 | 0 | — | 26/28 | $0.01253 |
| sonnet | Arabic | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | — | 28/28 | $0.01517 |
| sonnet | Russian | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | — | 26/28 | $0.01533 |
| sonnet | Chinese | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 15/16 | 0 | — | 28/28 | $0.01540 |
| sonnet | Turkish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 15/16 | 0 | — | 27/28 | $0.01432 |
| sonnet | Spanish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 14/16 | 0 | — | 28/28 | $0.01384 |
| sonnet | Arabic-Indic | 4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 8/8 | 0 | — | 14/14 | $0.01009 |
| sonnet | Stated-facts | 6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 11/12 | 0 | — | — | $0.01024 |
| gpt-6.1-terra | English | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 11/11 | 0 | 8/8 | 41/56 | $0.00193 |
| gpt-6.1-terra | Arabic | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 11/11 | 0 | 8/8 | 43/56 | $0.00191 |
| gpt-6.1-terra | Russian | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 12/12 | 0 | 8/8 | 40/56 | $0.00199 |
| gpt-6.1-terra | Chinese | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 12/12 | 0 | 7/8 | 36/56 | $0.00211 |
| gpt-6.1-terra | Turkish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 11/11 | 0 | 7/8 | 41/56 | $0.00195 |
| gpt-6.1-terra | Spanish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 13/13 | 0 | 8/8 | 37/56 | $0.00197 |
| gpt-6.1-terra | Arabic-Indic | 4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 0 | 3/4 | 24/28 | $0.00140 |
| gpt-6.1-terra | Stated-facts | 6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 7/8 | 0 | 5/6 | 39/42 | $0.00223 |
| **sonnet** | **all** | 58 | 58/58 | 58/58 | 58/58 | 58/58 | 58/58 | 58/58 | 109/116 | 0 | — | 177/182 | $0.01370 |
| **gpt-6.1-terra** | **all** | 58 | 58/58 | 58/58 | 58/58 | 58/58 | 58/58 | 58/58 | 81/82 | 0 | 54/58 | 301/406 | $0.00196 |

## Stated facts: does the country and the priority the visitor said come through?

| Model | Transcript | Team | Country | Priority |
|---|---|---|---|---|
| sonnet | English stated-en | English | yes: "Germany" | yes: "Quality of the result, not looking for the cheapest option" |
| sonnet | English stated-en | Turkish | yes: "Almanya" | yes: "Sonucun kalitesi — en ucuz seçenek peşinde değil" |
| sonnet | Arabic stated-ar | English | yes: "Saudi Arabia" | yes: "Natural-looking results" |
| sonnet | Arabic stated-ar | Turkish | yes: "Suudi Arabistan (Riyad)" | yes: "Doğal görünüm" |
| sonnet | Russian stated-ru | English | yes: "Kazakhstan" | yes: "Speed — wants everything done within 10 days" |
| sonnet | Russian stated-ru | Turkish | yes: "Kazakistan (Almatı)" | yes: "Hız — tatili yalnızca 10 gün sürdüğü için işlemlerin hızlı tamamlanması en önemli önceliği" |
| gpt-6.1-terra | English stated-en | English | yes: "Germany" | yes: "Quality of the result rather than the lowest price." |
| gpt-6.1-terra | English stated-en | Turkish | yes: "Almanya" | yes: "Sonucun kalitesi; en ucuz seçeneği aramıyor." |
| gpt-6.1-terra | Arabic stated-ar | English | yes: "Saudi Arabia" | yes: "A natural appearance that others will not notice." |
| gpt-6.1-terra | Arabic stated-ar | Turkish | yes: "Suudi Arabistan" | yes: "Dişlerin doğal görünmesi ve kimsenin fark etmemesi." |
| gpt-6.1-terra | Russian stated-ru | English | yes: "Kazakhstan" | yes: "Speed; she has only ten days of leave." |
| gpt-6.1-terra | Russian stated-ru | Turkish | yes: "Kazakistan" | yes: "Tedavinin hızlı tamamlanması." |

## Per conversation: every turn replayed, as production extracts

| Model | Conversation | Turns | Cost | Per call | Input read from cache | Per turn |
|---|---|---|---|---|---|---|
| sonnet | English | 7 | $0.0362 | $0.00517 | 84% | miss $0.00824, hit $0.00291, hit $0.00381, hit $0.00474, hit $0.00520, hit $0.00525, hit $0.00604 |
| gpt-6.1-terra | English | 7 | $0.0067 | $0.00096 | 83% | miss $0.00188, hit $0.00066, hit $0.00079, hit $0.00082, hit $0.00086, hit $0.00079, hit $0.00093 |
| sonnet | Arabic | 7 | $0.0372 | $0.00532 | 83% | miss $0.00787, hit $0.00343, hit $0.00370, hit $0.00582, hit $0.00563, hit $0.00519, hit $0.00559 |
| gpt-6.1-terra | Arabic | 7 | $0.0067 | $0.00095 | 83% | miss $0.00185, hit $0.00064, hit $0.00076, hit $0.00085, hit $0.00085, hit $0.00080, hit $0.00091 |

## Parse failures (hard: a lost lead)

| Model | Calls | No usable JSON or a missing field | API errors |
|---|---|---|---|
| sonnet | 72 | **0** | 0 |
| gpt-6.1-terra | 72 | **0** | 0 |

## Why each response stopped

| Model | Stop reasons |
|---|---|
| sonnet | end_turn: 72 |
| gpt-6.1-terra | completed: 72 |

## Read by hand

- **The 8 flagged misses are all false.** Six are English fields with
  none of the check's function words ("Full upper arch dental implants
  — lost most upper teeth"), and two are Turkish notes with none of
  its Turkish words ("Riyad'dan seyahat edecek."). Real count: every
  written field is in the team's language on both models.
- **Durations: fixed.** No written field has text in Arabic, Cyrillic or
  Chinese script except the visitor's name: 0 of 144, against 11 of 52
  Terra summaries in the 2026-11-17 rerun. Terra now writes "beş yıl
  önce", "about five years ago". Invented figures: 0, so none was
  turned into digits.
- **Forced JSON: no parse failures** on 72 calls a model, including the
  replay where Sonnet answered as the chat twice yesterday.
- **Stated facts: both models captured all six** country and priority
  values. Ольга's +7 number reads as Russia from its prefix; both wrote
  Kazakhstan, as she said.
- **Sonnet still infers what was not said.** On the stored transcripts
  it fills priority where Terra leaves it empty (44 times), and the
  travel country (27): "Ivan is a Russian-speaking patient", "王伟,
  Çin'li bir hasta" ("a Chinese patient"), from the language the
  visitor writes in.

Cost of this run: $0.9950 (Sonnet $0.8679, gpt-6.1-terra $0.1271).

## Every miss, for reading

- sonnet English eee97d63 English r1: main_concern not in English: Full upper arch dental implants — lost most upper teeth
- sonnet English eee97d63 English r2: main_concern not in English: Full upper arch dental implants — lost most upper teeth
- sonnet Chinese 4a7ab5a8 English r1: main_concern not in English: Lost most upper teeth about five years ago, interested in dental implants
- sonnet Turkish d398a0e1 English r1: main_concern not in English: Lost most upper teeth approximately five years ago, interested in implant treatment
- sonnet Spanish dc082d0f English r1: main_concern not in English: Missing most upper teeth, interested in dental implants
- sonnet Spanish dc082d0f English r2: main_concern not in English: Missing most upper teeth, interested in dental implants
- sonnet Arabic stated-ar Turkish r1: notes not in Turkish: Suudi Arabistan'dan (Riyad) seyahat edecek
- gpt-6.1-terra Arabic stated-ar Turkish r1: notes not in Turkish: Riyad'dan seyahat edecek.
