# Lead extraction: Sonnet vs gpt-6.1-terra vs gpt-6-luna, 2026-11-17

Offline, stored test-clinic transcripts: 12 conversations (final turn) + the constructed Arabic-Indic turn, team languages English and Turkish, 2 runs. Output limit 1024 tokens on every model.

Conversations (stored after the 2026-11-04 timestamp fix, no tied rows): English `eee97d63-ed4c-4f8d-8150-6a779e02cf8d`, English `9faece88-125b-452a-8d1b-bab71ad31765`, Arabic `06209320-92d7-4df9-a588-6037d4b48690`, Arabic `9e68ff32-a1b5-40b6-9ad6-0431f8d2360c`, Russian `dcb0905e-74fa-4b66-b4cb-63558f478cea`, Russian `2ddbbfde-dd32-45c6-939d-755ae66f6e6b`, Chinese `cce0512c-caf0-44f1-9010-4eedea2021d0`, Chinese `4a7ab5a8-92d9-422c-8cfe-a48678b7e53e`, Turkish `d398a0e1-8ebb-4587-9d60-ca7feba70da7`, Turkish `7eb488d0-fca6-4679-9109-37a2467c0d92`, Spanish `92985564-d415-43ab-9cee-8940d5c02956`, Spanish `dc082d0f-2bfa-4d8c-ac35-73046d46f97e`.

| Model | Visitor language | Calls | Name | Contact digits | ASCII digits | Visitor language | Age null | Summary in team language | Fields in team language | Invented figures | Score within 15 of Sonnet | Fields filled as Sonnet | Cost per call |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sonnet | English | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 13/16 | 0 | — | 27/28 | $0.01113 |
| sonnet | Arabic | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | — | 28/28 | $0.01282 |
| sonnet | Russian | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | — | 26/28 | $0.01230 |
| sonnet | Chinese | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | — | 28/28 | $0.01335 |
| sonnet | Turkish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 14/16 | 0 | — | 28/28 | $0.01203 |
| sonnet | Spanish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 15/16 | 0 | — | 27/28 | $0.01158 |
| sonnet | Arabic-Indic | 4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 7/7 | 0 | — | 13/14 | $0.00779 |
| gpt-6.1-terra | English | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 15/15 | 0 | 6/8 | 45/56 | $0.00175 |
| gpt-6.1-terra | Arabic | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 1/8 | 14/15 | 0 | 8/8 | 47/56 | $0.00177 |
| gpt-6.1-terra | Russian | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 6/8 | 15/15 | 0 | 7/8 | 39/56 | $0.00180 |
| gpt-6.1-terra | Chinese | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 6/8 | 13/13 | 0 | 5/8 | 38/56 | $0.00189 |
| gpt-6.1-terra | Turkish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 13/13 | 0 | 8/8 | 45/56 | $0.00179 |
| gpt-6.1-terra | Spanish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 15/15 | 0 | 8/8 | 41/56 | $0.00175 |
| gpt-6.1-terra | Arabic-Indic | 4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 0 | 2/4 | 26/28 | $0.00157 |
| gpt-6-luna | English | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | 7/8 | 46/56 | $0.00022 |
| gpt-6-luna | Arabic | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 4/8 | 8/16 | 0 | 8/8 | 48/56 | $0.00021 |
| gpt-6-luna | Russian | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 4/8 | 10/16 | 0 | 7/8 | 40/56 | $0.00021 |
| gpt-6-luna | Chinese | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 4/8 | 8/14 | 0 | 8/8 | 40/56 | $0.00022 |
| gpt-6-luna | Turkish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | 8/8 | 49/56 | $0.00021 |
| gpt-6-luna | Spanish | 8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 16/16 | 0 | 8/8 | 42/56 | $0.00022 |
| gpt-6-luna | Arabic-Indic | 4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 4/4 | 8/8 | 0 | 4/4 | 23/28 | $0.00017 |
| **sonnet** | **all** | 52 | 52/52 | 52/52 | 52/52 | 52/52 | 52/52 | 52/52 | 97/103 | 0 | — | 177/182 | $0.01186 |
| **gpt-6.1-terra** | **all** | 52 | 52/52 | 52/52 | 52/52 | 52/52 | 52/52 | 41/52 | 89/90 | 0 | 44/52 | 281/364 | $0.00177 |
| **gpt-6-luna** | **all** | 52 | 52/52 | 52/52 | 52/52 | 52/52 | 52/52 | 40/52 | 82/102 | 0 | 50/52 | 288/364 | $0.00021 |

## Per conversation: every turn replayed, as production extracts

| Model | Conversation | Turns | Cost | Per call | Input read from cache | Per turn |
|---|---|---|---|---|---|---|
| sonnet | English | 7 | $0.0358 | $0.00511 | 71% | miss $0.00805, miss $0.00645, hit $0.00370, hit $0.00158, hit $0.00552, hit $0.00484, hit $0.00564 |
| gpt-6.1-terra | English | 7 | $0.0138 | $0.00198 | 0% | miss $0.00135, miss $0.00153, miss $0.00189, miss $0.00205, miss $0.00223, miss $0.00229, miss $0.00251 |
| gpt-6-luna | English | 7 | $0.0016 | $0.00023 | 0% | miss $0.00014, miss $0.00015, miss $0.00021, miss $0.00025, miss $0.00027, miss $0.00028, miss $0.00028 |
| sonnet | Arabic | 7 | $0.0321 | $0.00459 | 81% | miss $0.00565, hit $0.00337, hit $0.00367, hit $0.00458, hit $0.00495, hit $0.00462, hit $0.00524 |
| gpt-6.1-terra | Arabic | 7 | $0.0140 | $0.00201 | 0% | miss $0.00133, miss $0.00148, miss $0.00189, miss $0.00208, miss $0.00230, miss $0.00239, miss $0.00256 |
| gpt-6-luna | Arabic | 7 | $0.0016 | $0.00022 | 0% | miss $0.00014, miss $0.00015, miss $0.00021, miss $0.00024, miss $0.00025, miss $0.00028, miss $0.00029 |

## Parse failures (hard: a lost lead)

| Model | Calls | No usable JSON or a missing field | API errors |
|---|---|---|---|
| sonnet | 66 | **2** | 0 |
| gpt-6.1-terra | 66 | **0** | 0 |
| gpt-6-luna | 66 | **0** | 0 |

- sonnet · replay English eee97d63 turn 1 · no usable JSON: "Can you share a little more about your situation? For example:\n\nDo you need a full arch replacement (All-on-4 or similar), or are we talking about multiple indi"
- sonnet · replay English eee97d63 turn 4 · no usable JSON: "I'll wait here if you have any questions about the steps — or whenever you're ready, share your name and WhatsApp number and a photo of your upper arch so the t"

## Why each response stopped

| Model | Stop reasons |
|---|---|
| sonnet | end_turn: 66 |
| gpt-6.1-terra | completed: 66 |
| gpt-6-luna | completed: 66 |

## Read by hand: the 23 summaries the language check flagged

**gpt-6.1-terra, 11 flagged, all in the team language.** Every one is
written in English or Turkish as asked. Each, though, leaves the
visitor's own words for the duration untranslated: "after losing most
of his upper teeth خمس سنوات ago", "about пяти лет ago", "大约五年前 üst
dişlerinin...". That is the prompt's rule to carry durations "exactly as
written" applied too literally, and a reader of the team language cannot
read those words. Names in their own script (خالد, Иван, 王伟) are
intended. Real count: summary in the team language 52/52, of which 11
contain an untranslated duration (Arabic 7, Russian 2, Chinese 2).

**gpt-6-luna, 12 flagged, 11 really in the wrong language.** All 11 are
for a Turkish team: the summary is written entirely in the visitor's
language (Arabic 4/4, Russian 3/4, Chinese 4/4 of those
conversations). The twelfth ("İван, üst dişlerinin çoğunu...") is
Turkish; the name threw the check. Real count: 41/52. This is the
failure that moved extraction off Haiku.

**Sonnet: none flagged.** 52/52.

## Other findings

- **Truncation is gone at 1024.** Every Sonnet response stopped at
  end_turn (66/66), including every Turkish-team extraction. At 512 the
  same kind of extraction was cut off
  (docs/extraction-truncation-2026-11-17.md).
- **Sonnet answered as the chat assistant twice** (2/66, both in the
  turn-by-turn replay): "Can you share a little more about your
  situation?...", and "I'll wait here... share your name and WhatsApp
  number...". That is no JSON, so the route saves nothing. Production
  runs the same call every turn, and the next turn re-reads the whole
  transcript, so the lead is only lost if it happens on the last turn.
  Terra and Luna: 0/66.
- **OpenAI's cache never hit in the replay** (0% for both, against 71-81%
  for Sonnet). The reply experiment, which had no explicit breakpoint,
  read the cache on 70/84 Terra calls. The likely cause is the
  prompt_cache_breakpoint on the last part, which moves every turn.
  Unconfirmed.

Total cost of this run: $0.8189 (Sonnet $0.6847, gpt-6.1-terra $0.1202,
gpt-6-luna $0.0140).

## Every miss, for reading

- sonnet English eee97d63 English r1: main_concern not in English: Full upper arch dental implants — lost most upper teeth about five years ago
- sonnet English eee97d63 English r2: main_concern not in English: Full upper arch dental implants — lost most upper teeth about five years ago
- sonnet English 9faece88 English r2: main_concern not in English: Full upper arch dental implants — lost most upper teeth
- sonnet Turkish d398a0e1 English r1: main_concern not in English: Lost most upper teeth approximately 5 years ago, considering implant treatment
- sonnet Turkish d398a0e1 English r2: main_concern not in English: Lost most upper teeth approximately 5 years ago, considering implant treatment
- sonnet Spanish dc082d0f English r1: main_concern not in English: Lost most upper teeth 5 years ago, considering dental implants
- gpt-6.1-terra Arabic 06209320 English r1: summary not in English: خالد is considering dental implants after losing most of his upper teeth خمس سنوات ago. He asked about cost and treatment steps, but wants t
- gpt-6.1-terra Arabic 06209320 English r2: summary not in English: خالد is considering dental implants after losing most of his upper teeth خمس سنوات ago. He asked about the cost and treatment steps, but wan
- gpt-6.1-terra Arabic 06209320 Turkish r1: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybetmiş ve diş implantı tedavisini değerlendiriyor. Maliyeti ve tedavi aşamalarını sordu; karar
- gpt-6.1-terra Arabic 06209320 Turkish r2: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybetmiş ve diş implantı yaptırmayı düşünüyor. Maliyeti ve tedavi adımlarını sordu; karar vermed
- gpt-6.1-terra Arabic 9e68ff32 English r2: summary not in English: Khaled is considering dental implants after losing most of his upper teeth خمس سنوات ago. He asked about cost and treatment steps, and wants
- gpt-6.1-terra Arabic 9e68ff32 Turkish r1: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybetmiş ve diş implantı yaptırmayı düşünüyor. Maliyeti sordu ve tedavi aşamaları hakkında bilgi
- gpt-6.1-terra Arabic 9e68ff32 Turkish r2: summary not in Turkish: خالد, üst dişlerinin çoğunu خمس سنوات önce kaybetmiş ve diş implantı tedavisinin maliyetini ve adımlarını öğrenmek istiyor. İletişim numaras
- gpt-6.1-terra Arabic 9e68ff32 Turkish r2: notes not in Turkish: Tedavi adımlarının ayrıntılı olarak açıklanmasını istedi. Kliniğin verdiği bilgiye göre tedavi 5 أيا
- gpt-6.1-terra Russian dcb0905e English r1: summary not in English: Иван is interested in dental implants after losing most of his upper teeth about пяти лет ago. He asked about cost and the treatment process
- gpt-6.1-terra Russian dcb0905e Turkish r1: summary not in Turkish: Иван, üst dişlerinin çoğunu около пяти лет önce kaybetmiş ve diş implantı tedavisiyle ilgileniyor. Maliyet ve tedavi sürecini sordu; karar v
- gpt-6.1-terra Chinese cce0512c English r2: summary not in English: 王伟 is interested in dental implants after losing most of his upper teeth about 五年前. He asked about cost and treatment steps and is still con
- gpt-6.1-terra Chinese cce0512c Turkish r2: summary not in Turkish: 王伟, 大约五年前 üst dişlerinin çoğunu kaybetmiş ve diş implantı tedavisiyle ilgileniyor. Maliyeti ve tedavi aşamalarını sordu; karar vermeden önce
- gpt-6-luna Arabic 06209320 Turkish r1: summary not in Turkish: خالد مهتم بزراعة الأسنان، وقد فقد معظم أسنانه العلوية منذ 5 سنوات، وسأل عن التكلفة وعن خطوات العلاج بالتفصيل. لم يحدد موعداً للبدء أو السفر،
- gpt-6-luna Arabic 06209320 Turkish r1: main_concern not in Turkish: يريد معرفة تكلفة وخطوات زراعة الأسنان بعد فقدان معظم أسنانه العلوية.
- gpt-6-luna Arabic 06209320 Turkish r1: notes not in Turkish: فقد معظم أسنانه العلوية. شرح المساعد أن العلاج يتضمن زيارتين: 5 أيام للغرسات والأسنان المؤقتة، ثم فت
- gpt-6-luna Arabic 06209320 Turkish r2: summary not in Turkish: خالد فقد معظم أسنانه العلوية منذ 5 سنوات ويرغب في معرفة خيارات زراعة الأسنان، وسأل عن التكلفة وخطوات العلاج. يحتاج إلى التفكير في القرار ومن
- gpt-6-luna Arabic 06209320 Turkish r2: main_concern not in Turkish: يرغب في زراعة الأسنان بعد فقدان معظم أسنانه العلوية.
- gpt-6-luna Arabic 06209320 Turkish r2: notes not in Turkish: سأل عن التكلفة وطلب شرح خطوات العلاج بالتفصيل. العلاج الموصوف يشمل زيارتين: 5 أيام ثم فترة التئام 4 
- gpt-6-luna Arabic 9e68ff32 Turkish r1: summary not in Turkish: خالد مهتم بزراعة الأسنان بعد فقدان معظم أسنانه العلوية منذ خمس سنوات، وسأل عن التكلفة وخطوات العلاج. يريد التفكير في الأمر والتحدث مع زوجته 
- gpt-6-luna Arabic 9e68ff32 Turkish r1: main_concern not in Turkish: زراعة الأسنان بعد فقدان معظم أسنانه العلوية
- gpt-6-luna Arabic 9e68ff32 Turkish r1: notes not in Turkish: سأل عن التكلفة وخطوات العلاج بالتفصيل. العلاج المقترح يتضمن زيارتين إلى إسطنبول: الأولى 5 أيام، ثم ف
- gpt-6-luna Arabic 9e68ff32 Turkish r2: summary not in Turkish: خالد يفكر في زراعة الأسنان بعد فقدان معظم أسنانه العلوية منذ خمس سنوات، وسأل عن التكلفة وخطوات العلاج. لم يحدد موعداً للسفر، ويريد التفكير و
- gpt-6-luna Arabic 9e68ff32 Turkish r2: main_concern not in Turkish: يفكر في زراعة الأسنان بعد فقدان معظم أسنانه العلوية.
- gpt-6-luna Arabic 9e68ff32 Turkish r2: notes not in Turkish: سأل عن تكلفة العلاج وخطواته بالتفصيل. العلاج الموضح يتم على زيارتين: 5 أيام للزيارة الأولى، ثم فترة 
- gpt-6-luna Russian dcb0905e Turkish r1: summary not in Turkish: Иван потерял большинство верхних зубов около пяти лет назад и интересуется имплантацией, в том числе стоимостью и этапами лечения. Пока не г
- gpt-6-luna Russian dcb0905e Turkish r1: main_concern not in Turkish: Восстановление большинства верхних зубов с помощью имплантации зубов; хочет узнать стоимость и поэта
- gpt-6-luna Russian dcb0905e Turkish r1: notes not in Turkish: Запросил стоимость и подробное описание этапов лечения. Для предварительной оценки клиника попросила
- gpt-6-luna Russian dcb0905e Turkish r2: summary not in Turkish: Иван потерял большинство верхних зубов около пяти лет назад и интересуется имплантацией, её стоимостью и этапами лечения. Пока хочет подумат
- gpt-6-luna Russian dcb0905e Turkish r2: main_concern not in Turkish: Большинство верхних зубов отсутствует; интересуется имплантацией зубов и процессом лечения.
- gpt-6-luna Russian dcb0905e Turkish r2: notes not in Turkish: Спросил о стоимости и пошаговом процессе. Ему объяснили, что лечение включает два визита: первый — 5
- gpt-6-luna Russian 2ddbbfde Turkish r1: summary not in Turkish: Иван интересуется имплантацией для восстановления большинства верхних зубов, отсутствующих около пяти лет. Спрашивал о стоимости и процессе 
- gpt-6-luna Russian 2ddbbfde Turkish r1: main_concern not in Turkish: Интересуется имплантацией зубов: потерял большинство верхних зубов и хочет узнать стоимость и этапы 
- gpt-6-luna Russian 2ddbbfde Turkish r1: notes not in Turkish: Обсуждались два визита: 5 дней в Стамбуле, затем период заживления 4 месяца и второй визит на 7 дней
- gpt-6-luna Russian 2ddbbfde Turkish r2: summary not in Turkish: İван, üst dişlerinin çoğunu yaklaşık beş yıl önce kaybettiği için implantasyon hakkında bilgi ve fiyat istiyor; süreçte iki ayrı ziyaret ola
- gpt-6-luna Chinese cce0512c Turkish r1: summary not in Turkish: 王伟想了解上排大部分牙齿缺失后的种植牙治疗方案和费用，牙齿缺失已有大约五年。他咨询了治疗步骤，但表示还需要考虑并与太太商量；目前没有提供出行计划。
- gpt-6-luna Chinese cce0512c Turkish r1: notes not in Turkish: 咨询了完整治疗步骤。治疗分两次在伊斯坦布尔进行：第一次约5天植入种植体并配戴临时假牙，等待期约4个月，第二次约7天安装永久牙冠。可能需要植骨，需评估后确认。
- gpt-6-luna Chinese cce0512c Turkish r2: summary not in Turkish: 王伟想了解上排大部分牙齿缺失后的种植牙治疗流程和费用，缺牙情况已有大约五年。他需要先与太太商量，目前仍在考虑，尚未提供出行计划；治疗需求和报价还需进一步评估。
- gpt-6-luna Chinese cce0512c Turkish r2: main_concern not in Turkish: 了解上排大部分牙齿缺失后的种植牙治疗及费用，并希望了解完整治疗步骤。
- gpt-6-luna Chinese cce0512c Turkish r2: notes not in Turkish: 需要治疗的具体牙齿数量、骨质情况及是否需要植骨尚未评估。治疗安排为前往伊斯坦布尔两次：第一次约5天，之后等待约4个月，再进行约7天的第二次治疗。
- gpt-6-luna Chinese 4a7ab5a8 Turkish r1: summary not in Turkish: 王伟想了解种植牙的费用和完整治疗流程，他大约五年前失去了大部分上排牙齿。尚需考虑并与太太商量，目前未确定出行时间；已留下 WhatsApp 号码。
- gpt-6-luna Chinese 4a7ab5a8 Turkish r1: main_concern not in Turkish: 了解种植牙的治疗步骤和费用；大约五年前失去了大部分上排牙齿。
- gpt-6-luna Chinese 4a7ab5a8 Turkish r1: notes not in Turkish: 已询问详细治疗步骤和费用。治疗需两次前往伊斯坦布尔：第一次约5天，等待约4个月，第二次约7天。
- gpt-6-luna Chinese 4a7ab5a8 Turkish r2: summary not in Turkish: 王伟想了解种植牙的费用和完整治疗流程，并提供了 WhatsApp 联系方式。大约五年前失去了大部分上排牙齿；目前还需要考虑并与太太商量，尚未确定何时出行。
- gpt-6-luna Chinese 4a7ab5a8 Turkish r2: notes not in Turkish: 治疗需两次前往伊斯坦布尔：第一次约5天，等待约4个月后第二次约7天。
