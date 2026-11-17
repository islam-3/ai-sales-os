# Lead extraction: Sonnet vs gpt-6.1-terra vs gpt-6-luna, 2026-11-17

Offline, stored test-clinic transcripts: 12 conversations (final turn) + the constructed Arabic-Indic turn, team languages English and Turkish, 2 runs.

| Model | Visitor language | Calls | Name | Contact digits | ASCII digits | Visitor language | Age null | Summary in team language | Fields in team language | Invented figures | Score within 15 of Sonnet | Fields filled as Sonnet | Cost per call |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | English | 8 (2 failed) | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 11/12 | 0 | — | 21/21 | $0.01157 |
| sonnet | Arabic | 8 (2 failed) | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | 12/12 | 0 | — | 13/14 | $0.01390 |
| sonnet | Russian | 8 (1 failed) | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 14/14 | 0 | — | 18/21 | $0.01248 |
| sonnet | Chinese | 8 (3 failed) | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 5/5 | 7/10 | 0 | — | 14/14 | $0.01202 |
| sonnet | Turkish | 8 (4 failed) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 3/4 | 6/8 | 0 | — | — | $0.00656 |
| sonnet | Spanish | 8 (4 failed) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 7/8 | 0 | — | — | $0.00628 |
| sonnet | Arabic-Indic | 4 (2 failed) | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 4/4 | 0 | — | — | $0.00395 |
| gpt-6.1-terra | English | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 15/15 | 0 | 6/6 | 35/42 | $0.00175 |
| gpt-6.1-terra | Arabic | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 0/8 | 11/11 | 0 | 7/8 | 34/42 | $0.00178 |
| gpt-6.1-terra | Russian | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 7/8 | 13/13 | 0 | 8/8 | 35/42 | $0.00180 |
| gpt-6.1-terra | Chinese | 8 (1 failed) | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 4/7 | 11/12 | 0 | 3/5 | 25/35 | $0.00185 |
| gpt-6.1-terra | Turkish | 8 (4 failed) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 5/5 | 0 | 1/4 | 23/28 | $0.00139 |
| gpt-6.1-terra | Spanish | 8 (4 failed) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 7/7 | 0 | 3/4 | 21/28 | $0.00135 |
| gpt-6.1-terra | Arabic-Indic | 4 (2 failed) | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0 | 2/2 | 12/14 | $0.00079 |
| gpt-6-luna | English | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | 2/6 | 36/42 | $0.00020 |
| gpt-6-luna | Arabic | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 4/8 | 9/16 | 0 | 6/8 | 38/42 | $0.00020 |
| gpt-6-luna | Russian | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 3/8 | 8/16 | 0 | 8/8 | 38/42 | $0.00021 |
| gpt-6-luna | Chinese | 8 (1 failed) | 7/7 | 7/7 | 7/7 | 7/7 | 7/7 | 4/7 | 8/14 | 0 | 4/5 | 27/35 | $0.00022 |
| gpt-6-luna | Turkish | 8 (4 failed) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 8/8 | 0 | 4/4 | 26/28 | $0.00016 |
| gpt-6-luna | Spanish | 8 (4 failed) | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 7/8 | 0 | 3/4 | 22/28 | $0.00015 |
| gpt-6-luna | Arabic-Indic | 4 (2 failed) | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 3/3 | 0 | 0/2 | 13/14 | $0.00008 |
| **sonnet** | **all** | 52 | 34/34 | 34/34 | 34/34 | 34/34 | 34/34 | 33/34 | 61/68 | 0 | — | 66/70 | $0.00997 |
| **gpt-6.1-terra** | **all** | 52 | 41/41 | 41/41 | 41/41 | 41/41 | 41/41 | 29/41 | 64/65 | 0 | 30/37 | 185/231 | $0.00159 |
| **gpt-6-luna** | **all** | 52 | 41/41 | 41/41 | 41/41 | 41/41 | 41/41 | 29/41 | 59/81 | 0 | 27/37 | 200/231 | $0.00018 |

## Per conversation: every turn replayed, as production extracts

| Model | Conversation | Turns | Cost | Per call | Input read from cache | Per turn |
|---|---|---|---|---|---|---|
| sonnet | English | 7 | $0.0000 | $0.00000 | 0% | miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000 |
| gpt-6.1-terra | English | 7 | $0.0000 | $0.00000 | 0% | miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000 |
| gpt-6-luna | English | 7 | $0.0000 | $0.00000 | 0% | miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000 |
| sonnet | Arabic | 7 | $0.0000 | $0.00000 | 0% | miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000 |
| gpt-6.1-terra | Arabic | 7 | $0.0000 | $0.00000 | 0% | miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000 |
| gpt-6-luna | Arabic | 7 | $0.0000 | $0.00000 | 0% | miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000, miss $0.00000 |

## Parse failures (hard: a lost lead)

| Model | Calls | No usable JSON or a missing field | API errors |
|---|---|---|---|
| sonnet | 66 | **7** | 25 |
| gpt-6.1-terra | 66 | **0** | 25 |
| gpt-6-luna | 66 | **0** | 25 |

- sonnet · English aee44d4d Turkish r1 · no usable JSON: "{\"name\": \"David\", \"contact_info\": \"+44 7700 900123\", \"age\": null, \"main_concern\": \"Üst çenedeki dişlerin büyük çoğunluğunu kaybetmiş, tam implant yaptırmak isti"
- sonnet · Arabic 19a0468f Turkish r1 · no usable JSON: "{\"name\": \"خالد\", \"contact_info\": \"+90 532 111 2233\", \"age\": null, \"main_concern\": \"Üst dişlerinin büyük kısmını kaybetmiş; implant tedavisi istiyor\", \"priority\""
- sonnet · Russian e7835e0f Turkish r1 · no usable JSON: "{\"name\": \"Иван\", \"contact_info\": \"+7 900 123 4567\", \"age\": null, \"main_concern\": \"Üst dişlerin büyük çoğunluğunu kaybetmiş, implant tedavisi istiyor\", \"priority"
- sonnet · Chinese 4c57c08c Turkish r1 · no usable JSON: "{\"name\": \"王伟\", \"contact_info\": \"+86 138 0013 8000\", \"age\": null, \"main_concern\": \"Üst sıra dişlerin büyük çoğunluğunu yaklaşık 5 yıl önce kaybetmiş; implant ted"
- sonnet · English aee44d4d Turkish r2 · no usable JSON: "{\"name\": \"David\", \"contact_info\": \"+44 7700 900123\", \"age\": null, \"main_concern\": \"Üst dişlerin büyük çoğunluğunu kaybetmiş, tam diş implantı yaptırmak istiyor\""
- sonnet · Arabic 5f888751 Turkish r2 · no usable JSON: "{\"name\": \"خالد\", \"contact_info\": \"+90 532 111 2233\", \"age\": null, \"main_concern\": \"Üst çenedeki dişlerin büyük çoğunluğunu kaybetmiş, implant tedavisi düşünüyor"
- sonnet · Chinese 4c57c08c Turkish r2 · no usable JSON: "{\"name\": \"王伟\", \"contact_info\": \"+86 138 0013 8000\", \"age\": null, \"main_concern\": \"Yaklaşık 5 yıl önce üst çenedeki dişlerin büyük çoğunluğunu kaybetmiş; implant"

API errors (the call failed; not counted as parse failures):

- sonnet · Chinese b1c851c2 Turkish r2 · Connection error.
- gpt-6.1-terra · Chinese b1c851c2 Turkish r2 · Connection error.
- gpt-6-luna · Chinese b1c851c2 Turkish r2 · Connection error.
- sonnet · Turkish 2805ea13 English r2 · Connection error.
- gpt-6.1-terra · Turkish 2805ea13 English r2 · Connection error.
- gpt-6-luna · Turkish 2805ea13 English r2 · Connection error.
- sonnet · Turkish 2805ea13 Turkish r2 · Connection error.
- gpt-6.1-terra · Turkish 2805ea13 Turkish r2 · Connection error.
- gpt-6-luna · Turkish 2805ea13 Turkish r2 · Connection error.
- sonnet · Turkish 4d96d174 English r2 · Connection error.
- gpt-6.1-terra · Turkish 4d96d174 English r2 · Connection error.
- gpt-6-luna · Turkish 4d96d174 English r2 · Connection error.
- sonnet · Turkish 4d96d174 Turkish r2 · Connection error.
- gpt-6.1-terra · Turkish 4d96d174 Turkish r2 · Connection error.
- gpt-6-luna · Turkish 4d96d174 Turkish r2 · Connection error.
- sonnet · Spanish 76bec7ce English r2 · Connection error.
- gpt-6.1-terra · Spanish 76bec7ce English r2 · Connection error.
- gpt-6-luna · Spanish 76bec7ce English r2 · Connection error.
- sonnet · Spanish 76bec7ce Turkish r2 · Connection error.
- gpt-6.1-terra · Spanish 76bec7ce Turkish r2 · Connection error.
- gpt-6-luna · Spanish 76bec7ce Turkish r2 · Connection error.
- sonnet · Spanish 2f3a3cd9 English r2 · Connection error.
- gpt-6.1-terra · Spanish 2f3a3cd9 English r2 · Connection error.
- gpt-6-luna · Spanish 2f3a3cd9 English r2 · Connection error.
- sonnet · Spanish 2f3a3cd9 Turkish r2 · Connection error.
- gpt-6.1-terra · Spanish 2f3a3cd9 Turkish r2 · Connection error.
- gpt-6-luna · Spanish 2f3a3cd9 Turkish r2 · Connection error.
- sonnet · Arabic constructed English r2 · Connection error.
- gpt-6.1-terra · Arabic constructed English r2 · Connection error.
- gpt-6-luna · Arabic constructed English r2 · Connection error.
- sonnet · Arabic constructed Turkish r2 · Connection error.
- gpt-6.1-terra · Arabic constructed Turkish r2 · Connection error.
- gpt-6-luna · Arabic constructed Turkish r2 · Connection error.
- sonnet · replay English aee44d4d turn 1 · Connection error.
- sonnet · replay English aee44d4d turn 2 · Connection error.
- sonnet · replay English aee44d4d turn 3 · Connection error.
- sonnet · replay English aee44d4d turn 4 · Connection error.
- sonnet · replay English aee44d4d turn 5 · Connection error.
- sonnet · replay English aee44d4d turn 6 · Connection error.
- sonnet · replay English aee44d4d turn 7 · Connection error.
- gpt-6.1-terra · replay English aee44d4d turn 1 · Connection error.
- gpt-6.1-terra · replay English aee44d4d turn 2 · Connection error.
- gpt-6.1-terra · replay English aee44d4d turn 3 · Connection error.
- gpt-6.1-terra · replay English aee44d4d turn 4 · Connection error.
- gpt-6.1-terra · replay English aee44d4d turn 5 · Connection error.
- gpt-6.1-terra · replay English aee44d4d turn 6 · Connection error.
- gpt-6.1-terra · replay English aee44d4d turn 7 · Connection error.
- gpt-6-luna · replay English aee44d4d turn 1 · Connection error.
- gpt-6-luna · replay English aee44d4d turn 2 · Connection error.
- gpt-6-luna · replay English aee44d4d turn 3 · Connection error.
- gpt-6-luna · replay English aee44d4d turn 4 · Connection error.
- gpt-6-luna · replay English aee44d4d turn 5 · Connection error.
- gpt-6-luna · replay English aee44d4d turn 6 · Connection error.
- gpt-6-luna · replay English aee44d4d turn 7 · Connection error.
- sonnet · replay Arabic 19a0468f turn 1 · Connection error.
- sonnet · replay Arabic 19a0468f turn 2 · Connection error.
- sonnet · replay Arabic 19a0468f turn 3 · Connection error.
- sonnet · replay Arabic 19a0468f turn 4 · Connection error.
- sonnet · replay Arabic 19a0468f turn 5 · Connection error.
- sonnet · replay Arabic 19a0468f turn 6 · Connection error.
- sonnet · replay Arabic 19a0468f turn 7 · Connection error.
- gpt-6.1-terra · replay Arabic 19a0468f turn 1 · Connection error.
- gpt-6.1-terra · replay Arabic 19a0468f turn 2 · Connection error.
- gpt-6.1-terra · replay Arabic 19a0468f turn 3 · Connection error.
- gpt-6.1-terra · replay Arabic 19a0468f turn 4 · Connection error.
- gpt-6.1-terra · replay Arabic 19a0468f turn 5 · Connection error.
- gpt-6.1-terra · replay Arabic 19a0468f turn 6 · Connection error.
- gpt-6.1-terra · replay Arabic 19a0468f turn 7 · Connection error.
- gpt-6-luna · replay Arabic 19a0468f turn 1 · Connection error.
- gpt-6-luna · replay Arabic 19a0468f turn 2 · Connection error.
- gpt-6-luna · replay Arabic 19a0468f turn 3 · Connection error.
- gpt-6-luna · replay Arabic 19a0468f turn 4 · Connection error.
- gpt-6-luna · replay Arabic 19a0468f turn 5 · Connection error.
- gpt-6-luna · replay Arabic 19a0468f turn 6 · Connection error.
- gpt-6-luna · replay Arabic 19a0468f turn 7 · Connection error.

## Every miss, for reading

- sonnet English aee44d4d Turkish r1: no result (unparseable JSON)
- sonnet English aee44d4d Turkish r2: no result (unparseable JSON)
- sonnet English 90e64c08 English r1: main_concern not in English: Full upper arch dental implants — lost most upper teeth about five years ago
- sonnet Arabic 19a0468f Turkish r1: no result (unparseable JSON)
- sonnet Arabic 5f888751 Turkish r2: no result (unparseable JSON)
- sonnet Russian e7835e0f Turkish r1: no result (unparseable JSON)
- sonnet Chinese 4c57c08c English r2: main_concern not in English: Lost most upper teeth about 5 years ago, interested in full upper arch dental implants
- sonnet Chinese 4c57c08c Turkish r1: no result (unparseable JSON)
- sonnet Chinese 4c57c08c Turkish r2: no result (unparseable JSON)
- sonnet Chinese b1c851c2 English r1: main_concern not in English: Lost most upper teeth about 5 years ago, interested in dental implants
- sonnet Chinese b1c851c2 English r2: main_concern not in English: Lost most upper teeth about 5 years ago, interested in dental implants
- sonnet Chinese b1c851c2 Turkish r2: no result (Connection error.)
- sonnet Turkish 2805ea13 English r2: no result (Connection error.)
- sonnet Turkish 2805ea13 Turkish r2: no result (Connection error.)
- sonnet Turkish 4d96d174 English r1: summary not in English: Mehmet, yaklaşık 5 yıl önce üst çenedeki dişlerinin büyük çoğunluğunu kaybetmiş ve implant tedavisi araştırmaktadır. Fiyat bilgisi ve tedavi
- sonnet Turkish 4d96d174 English r1: main_concern not in English: Implant tedavisi — üst çenedeki dişlerin büyük çoğunluğunu yaklaşık 5 yıl önce kaybetmiş, implant ve
- sonnet Turkish 4d96d174 English r1: notes not in English: Karar aşamasında, eşiyle görüşmesi gerekiyor. Üst çenede çok sayıda diş eksik. WhatsApp üzerinden üc
- sonnet Turkish 4d96d174 English r2: no result (Connection error.)
- sonnet Turkish 4d96d174 Turkish r2: no result (Connection error.)
- sonnet Spanish 76bec7ce English r2: no result (Connection error.)
- sonnet Spanish 76bec7ce Turkish r2: no result (Connection error.)
- sonnet Spanish 2f3a3cd9 English r1: main_concern not in English: Restaurar la mayoría de los dientes superiores perdidos mediante implantes dentales
- sonnet Spanish 2f3a3cd9 English r2: no result (Connection error.)
- sonnet Spanish 2f3a3cd9 Turkish r2: no result (Connection error.)
- sonnet Arabic constructed English r2: no result (Connection error.)
- sonnet Arabic constructed Turkish r2: no result (Connection error.)
- gpt-6.1-terra Arabic 19a0468f English r1: summary not in English: خالد is considering dental implants after losing most of his upper teeth خمس سنوات ago. He asked about the cost and treatment process, and w
- gpt-6.1-terra Arabic 19a0468f English r2: summary not in English: خالد is considering dental implants after losing most of his upper teeth خمس سنوات ago. He asked about the cost and treatment process, but w
- gpt-6.1-terra Arabic 19a0468f Turkish r1: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybetmiş ve diş implantı yaptırmayı düşünüyor. Maliyeti ve tedavi aşamalarını sordu; karar verme
- gpt-6.1-terra Arabic 19a0468f Turkish r2: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybettiğini ve diş implantı düşündüğünü belirtti. Maliyeti ve tedavi aşamalarını sordu; karar ve
- gpt-6.1-terra Arabic 5f888751 English r1: summary not in English: خالد is considering dental implants after losing most of his upper teeth خمس سنوات ago. He asked about the cost and treatment steps, and wan
- gpt-6.1-terra Arabic 5f888751 English r2: summary not in English: خالد is considering dental implants after losing most of his upper teeth خمس سنوات ago. He asked about cost and treatment steps, and wants t
- gpt-6.1-terra Arabic 5f888751 Turkish r1: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybetmiş ve diş implantı tedavisiyle ilgileniyor. Maliyeti ve tedavi adımlarını sordu; karar ver
- gpt-6.1-terra Arabic 5f888751 Turkish r2: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybetmiş ve diş implantı tedavisiyle ilgileniyor. Maliyeti ve tedavi adımlarını sordu; karar ver
- gpt-6.1-terra Russian e7835e0f Turkish r1: summary not in Turkish: Иван, üst dişlerinin çoğunu около пяти лет назад kaybetmiş ve diş implantasyonu hakkında bilgi alıyor. Fiyatı ve tedavi sürecini sordu; kara
- gpt-6.1-terra Chinese 4c57c08c English r1: summary not in English: 王伟 is interested in dental implants after losing most of his upper teeth approximately 五年前. He asked about cost and treatment steps, but nee
- gpt-6.1-terra Chinese 4c57c08c English r1: main_concern not in English: Interested in dental implants to replace most of his upper teeth, which he lost approximately 五年前.
- gpt-6.1-terra Chinese 4c57c08c Turkish r2: summary not in Turkish: 王伟, yaklaşık 五年前 kaybettiği üst dişlerinin çoğu için diş implantı hakkında bilgi almak istiyor. Maliyet ve tedavi aşamalarını sordu; karar v
- gpt-6.1-terra Chinese b1c851c2 Turkish r1: summary not in Turkish: 王伟, yaklaşık 五年前 üst sıra dişlerinin çoğunu kaybetmiş ve diş implantı tedavisiyle ilgileniyor. Maliyeti sordu ve tedavi sürecinin ayrıntılar
- gpt-6.1-terra Chinese b1c851c2 Turkish r2: no result (Connection error.)
- gpt-6.1-terra Turkish 2805ea13 English r2: no result (Connection error.)
- gpt-6.1-terra Turkish 2805ea13 Turkish r2: no result (Connection error.)
- gpt-6.1-terra Turkish 4d96d174 English r2: no result (Connection error.)
- gpt-6.1-terra Turkish 4d96d174 Turkish r2: no result (Connection error.)
- gpt-6.1-terra Spanish 76bec7ce English r2: no result (Connection error.)
- gpt-6.1-terra Spanish 76bec7ce Turkish r2: no result (Connection error.)
- gpt-6.1-terra Spanish 2f3a3cd9 English r2: no result (Connection error.)
- gpt-6.1-terra Spanish 2f3a3cd9 Turkish r2: no result (Connection error.)
- gpt-6.1-terra Arabic constructed English r2: no result (Connection error.)
- gpt-6.1-terra Arabic constructed Turkish r2: no result (Connection error.)
- gpt-6-luna Arabic 19a0468f Turkish r1: summary not in Turkish: خالد يفكر في زراعة الأسنان بعد فقدان معظم أسنانه العلوية منذ خمس سنوات، وسأل عن التكلفة وخطوات العلاج. يريد التفكير في القرار والتحدث مع زوج
- gpt-6-luna Arabic 19a0468f Turkish r1: main_concern not in Turkish: يفكر في زراعة الأسنان بعد فقدان معظم أسنانه العلوية.
- gpt-6-luna Arabic 19a0468f Turkish r1: notes not in Turkish: سأل عن تكلفة العلاج وخطواته بالتفصيل. قُدمت له معلومات عن زيارتين: الأولى 5 أيام، ثم انتظار 4 أشهر، 
- gpt-6-luna Arabic 19a0468f Turkish r2: summary not in Turkish: خالد، منذ خمس سنوات فقد معظم أسنانه العلوية ويفكر في زراعة الأسنان. سأل عن التكلفة وخطوات العلاج بالتفصيل، لكنه يحتاج إلى التفكير والتحدث مع
- gpt-6-luna Arabic 19a0468f Turkish r2: main_concern not in Turkish: Zahnimplantate für die meisten fehlenden oberen Zähne
- gpt-6-luna Arabic 5f888751 Turkish r1: summary not in Turkish: خالد فقد معظم أسنانه العلوية منذ خمس سنوات ويفكر في زراعة الأسنان. سأل عن التكلفة وتفاصيل العلاج، لكنه يريد التفكير والتحدث مع زوجته قبل اتخ
- gpt-6-luna Arabic 5f888751 Turkish r1: main_concern not in Turkish: يفكر في زراعة الأسنان بعد فقدان معظم أسنانه العلوية.
- gpt-6-luna Arabic 5f888751 Turkish r1: notes not in Turkish: سأل عن التكلفة وطلب شرح خطوات العلاج بالتفصيل. ذُكر أن العلاج يتضمن زيارتين، مع فترة تعافٍ بينهما، و
- gpt-6-luna Arabic 5f888751 Turkish r2: summary not in Turkish: خالد فقد معظم أسنانه العلوية منذ خمس سنوات ويرغب في معرفة المزيد عن زراعة الأسنان. سأل عن التكلفة وتفاصيل العلاج، لكنه يحتاج إلى التفكير وال
- gpt-6-luna Arabic 5f888751 Turkish r2: main_concern not in Turkish: يفكر في زراعة الأسنان بعد فقدان معظم أسنانه العلوية.
- gpt-6-luna Arabic 5f888751 Turkish r2: notes not in Turkish: سأل عن تكلفة العلاج وخطواته بالتفصيل. يحتاج العلاج إلى زيارتين، لكنه لم يرسل صوراً أو أشعة للتقييم ا
- gpt-6-luna Russian e7835e0f Turkish r1: summary not in Turkish: Иван интересуется имплантацией зубов и сообщил, что большинство верхних зубов отсутствуют около пяти лет. Он запросил стоимость и подробное 
- gpt-6-luna Russian e7835e0f Turkish r1: main_concern not in Turkish: Имплантация зубов: потерял большинство верхних зубов около пяти лет назад и хочет узнать стоимость и
- gpt-6-luna Russian e7835e0f Turkish r1: notes not in Turkish: Интересовался стоимостью и пошаговым процессом лечения. Ему описали лечение за два визита в Стамбул:
- gpt-6-luna Russian e7835e0f Turkish r2: summary not in Turkish: Иван интересуется имплантацией зубов после потери большинства верхних зубов около пяти лет назад. Спрашивал о стоимости и этапах лечения; по
- gpt-6-luna Russian e7835e0f Turkish r2: main_concern not in Turkish: Имплантация зубов: потерял большинство верхних зубов около пяти лет назад.
- gpt-6-luna Russian e7835e0f Turkish r2: notes not in Turkish: Интересовался стоимостью и попросил объяснить процесс лечения по шагам. Предложено отправить фото ул
- gpt-6-luna Russian 21b0fa71 English r1: summary not in English: Иван is interested in dental implants after losing most of his upper teeth about пяти лет ago. He asked about cost and the treatment steps, 
- gpt-6-luna Russian 21b0fa71 Turkish r1: summary not in Turkish: Иван интересуется имплантацией зубов: около пяти лет назад он потерял большинство верхних зубов. Он спрашивал о стоимости и хотел узнать вес
- gpt-6-luna Russian 21b0fa71 Turkish r1: main_concern not in Turkish: Хочет узнать о процессе имплантации зубов и её стоимости; потерял большинство верхних зубов.
- gpt-6-luna Russian 21b0fa71 Turkish r1: notes not in Turkish: Спрашивал стоимость и просил объяснить процесс по шагам. Ему предложили отправить фото улыбки на Wha
- gpt-6-luna Russian 21b0fa71 Turkish r2: summary not in Turkish: Иван интересуется имплантацией зубов, так как около пяти лет назад потерял большинство верхних зубов. Он спросил о стоимости и ходе лечения,
- gpt-6-luna Russian 21b0fa71 Turkish r2: main_concern not in Turkish: Имплантация зубов: потерял большинство верхних зубов около пяти лет назад.
- gpt-6-luna Russian 21b0fa71 Turkish r2: notes not in Turkish: Спросил стоимость и попросил объяснить весь процесс по шагам. Рассматривает поездку в Стамбул. Ему п
- gpt-6-luna Chinese 4c57c08c Turkish r1: summary not in Turkish: 王伟想了解种植牙治疗，约五年前失去了大部分上排牙齿，并询问了费用和完整治疗步骤。 他表示还需要考虑并与太太商量，目前没有确定前往伊斯坦布尔的时间。
- gpt-6-luna Chinese 4c57c08c Turkish r1: main_concern not in Turkish: 了解种植牙治疗，缺失大部分上排牙齿，想了解完整治疗步骤和费用。
- gpt-6-luna Chinese 4c57c08c Turkish r1: notes not in Turkish: 尚未说明目前上排还剩几颗牙，也未提供口腔照片；治疗通常分两次就诊，中间间隔约4个月。
- gpt-6-luna Chinese 4c57c08c Turkish r2: summary not in Turkish: 王伟希望了解上排缺牙的种植牙治疗步骤和费用，称自己大约五年前失去了大部分上排牙齿。他表示需要考虑并与太太商量，目前没有确定赴伊斯坦布尔的时间；已留下联系方式。
- gpt-6-luna Chinese 4c57c08c Turkish r2: main_concern not in Turkish: 了解上排缺牙的种植牙治疗方案和费用；约五年前失去了大部分上排牙齿。
- gpt-6-luna Chinese 4c57c08c Turkish r2: notes not in Turkish: 询问过费用和整个治疗的详细步骤。助手介绍了通常分两次就诊：第一次约5天，愈合约4个月后第二次约7天；但具体方案和费用需根据口腔情况评估。
- gpt-6-luna Chinese b1c851c2 Turkish r1: summary not in Turkish: 王伟想了解上排大部分牙齿缺失后的种植牙治疗方案、详细步骤和费用；他大约五年前失去了大部分上排牙齿。他表示需要考虑并与太太商量，尚未确定何时前往伊斯坦布尔，也还没有提供口腔照片以便医生评估。
- gpt-6-luna Chinese b1c851c2 Turkish r1: main_concern not in Turkish: 了解种植牙治疗，尤其是上排大部分牙齿缺失后的治疗方案和费用。
- gpt-6-luna Chinese b1c851c2 Turkish r1: notes not in Turkish: 询问了治疗详细步骤和费用。已获知流程包括两次前往伊斯坦布尔：第一次5天植入种植体并配戴临时假牙，等待4个月愈合后，第二次7天安装永久牙冠。尚未提供口腔照片，也未说明是否戴过活动假牙。
- gpt-6-luna Chinese b1c851c2 Turkish r2: no result (Connection error.)
- gpt-6-luna Turkish 2805ea13 English r2: no result (Connection error.)
- gpt-6-luna Turkish 2805ea13 Turkish r2: no result (Connection error.)
- gpt-6-luna Turkish 4d96d174 English r2: no result (Connection error.)
- gpt-6-luna Turkish 4d96d174 Turkish r2: no result (Connection error.)
- gpt-6-luna Spanish 76bec7ce English r2: no result (Connection error.)
- gpt-6-luna Spanish 76bec7ce Turkish r1: notes not in Turkish: Preguntó el precio y pidió una explicación paso a paso del proceso. No se especificó si tiene una pr
- gpt-6-luna Spanish 76bec7ce Turkish r2: no result (Connection error.)
- gpt-6-luna Spanish 2f3a3cd9 English r2: no result (Connection error.)
- gpt-6-luna Spanish 2f3a3cd9 Turkish r2: no result (Connection error.)
- gpt-6-luna Arabic constructed English r2: no result (Connection error.)
- gpt-6-luna Arabic constructed Turkish r2: no result (Connection error.)
