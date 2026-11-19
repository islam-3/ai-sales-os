# Reply specifics and early handoff, 2026-11-19

Sonnet: the 12 production smoke conversations of 2026-11-17 and 2026-11-18. gpt-6.1-terra: docs/reply-provider-2026-11-19.sessions.json.

Fact vocabulary from test-clinic's own material: 5 numbers (15, 20, 50, 45, 55), 27 names (Meets, Beautiful, FUE, DHI, Does, Straumann, Swiss, VIP, Exactly, Discover, Afro, Sapphire, Overweight, Power, Profclinic, Zoom, Consider, Hollywood, Celebrity, Heart, Shine, Definition, Personalization, Brazilian, BBL, Testing, FUT).

| Arm | Visitor language | Conversations | First reply carries a fact | Distinct facts per conversation | Early handoffs (replies 1-2) |
|---|---|---|---|---|---|
| sonnet | English | 2 | 0/2 (0%) | 3.0 | 0 |
| sonnet | Arabic | 2 | 0/2 (0%) | 2.0 | 0 |
| sonnet | Russian | 2 | 2/2 (100%) | 5.0 | 0 |
| sonnet | Chinese | 2 | 2/2 (100%) | 3.0 | 0 |
| sonnet | Turkish | 2 | 2/2 (100%) | 5.0 | 0 |
| sonnet | Spanish | 2 | 2/2 (100%) | 3.0 | 0 |
| **sonnet** | **all** | 12 | 8/12 (67%) | 3.5 | 0 |
| gpt-6.1-terra | English | 2 | 2/2 (100%) | 1.0 | 0 |
| gpt-6.1-terra | Arabic | 2 | 1/2 (50%) | 0.5 | 2 |
| gpt-6.1-terra | Russian | 2 | 2/2 (100%) | 1.0 | 0 |
| gpt-6.1-terra | Chinese | 2 | 1/2 (50%) | 0.5 | 0 |
| gpt-6.1-terra | Turkish | 2 | 1/2 (50%) | 0.5 | 1 |
| gpt-6.1-terra | Spanish | 2 | 0/2 (0%) | 0.0 | 2 |
| **gpt-6.1-terra** | **all** | 12 | 7/12 (58%) | 0.6 | 5 |

## Against the bars

- gpt-6.1-terra, all: first reply with a fact 58% vs Sonnet 67% → ok; early handoffs 5/12 conv. vs Sonnet 0/12 → **FAIL**
- gpt-6.1-terra, English: first reply with a fact 100% vs Sonnet 0% → ok; early handoffs 0/2 conv. vs Sonnet 0/2 → ok
- gpt-6.1-terra: distinct facts per conversation 0.6 vs Sonnet 3.5 (bar 2.8) → **FAIL**
- **gpt-6.1-terra: FAIL**

## Early handoffs, quoted

- **gpt-6.1-terra** · Arabic · reply 1 · [number] مرحباً، يسعدنا مساعدتك في استكشاف زراعة الأسنان على راحتك، من دون أي التزام. إذا أحببت، يمكنك مشاركة صورتك لأسنانك ورقم واتسابك بالصيغة الدولية مع رمز البلد، حتى يتمكن فريقنا من إعداد تقييم مبدئي وإرساله إليك عندما تكون مستعداً.
- **gpt-6.1-terra** · Spanish · reply 1 · [number, photo] Hola, claro. Si te parece, puedes enviarnos una foto de tu sonrisa y tu número de WhatsApp con el código de país para que nuestro equipo prepare una valoración sin compromiso y te la envíe cuando estés listo o lista.
- **gpt-6.1-terra** · Arabic · reply 1 · [photo, whatsapp number] مرحباً! في TEST — Prof Clinic (automated runs)، نستخدم غرسات Implant Swiss لتعويض الأسنان المفقودة. وإذا أحببت، يمكنك مراسلتنا بصورة لأسنانك عبر واتساب على ‎+90 542 150 2222، ليتمكن فريقنا من مساعدتك في تقييم حالتك، دون أي التزام.
- **gpt-6.1-terra** · Turkish · reply 1 · [photo, whatsapp number] Merhaba, TEST — Prof Clinic (automated runs) olarak implant tedavisi konusunda size yardımcı olabiliriz. Ekibimizin, hazır olduğunuzda size ulaştırmak üzere herhangi bir yükümlülük içermeyen bir ön değerlendirme hazırlaması için WhatsApp’tan bir ağız fotoğrafı
- **gpt-6.1-terra** · Spanish · reply 1 · [whatsapp number] Hola, entendemos que quieras valorar tus opciones con calma. Si te parece, puedes escribirnos por WhatsApp al +90 542 150 2222 y nuestro equipo podrá orientarte sin compromiso cuando estés preparado.

## First replies: every English one, and every one with no fact

- **sonnet** · Arabic · facts [none] · مرحباً! زراعة الأسنان من أكثر الحلول اللي بتفرق فعلاً في حياة الناس — لأنها بترجعلك الراحة والثقة مع بعض، مش بس المظهر. كم سن ناقصك تقريباً؟
- **sonnet** · English · facts [none] · We've helped a lot of patients with exactly that, and it's one of the areas where the results really do change how people feel day to day — not just how they look. A full arch, both arches, or something in between?
- **sonnet** · Arabic · facts [none] · مرحباً! سؤال سريع قبل أي شيء — كم عدد الأسنان اللي تفكر في زراعتها تقريباً، وهل المشكلة في مناطق معينة أو أكثر من منطقة؟
- **sonnet** · English · facts [none] · We've helped a lot of patients with exactly that, and it's one of the areas where the results really do change how people feel day to day — not just how they look. Can I ask how long you've been without your natural teeth, or are you still at the stage of losing them?
- **gpt-6.1-terra** · English · facts [15] · Hi! At TEST — Prof Clinic (automated runs), we offer dental implants in Istanbul and have 15 years of specialized medical knowledge. What’s your situation with your teeth at the moment?
- **gpt-6.1-terra** · Arabic · facts [none] · مرحباً، يسعدنا مساعدتك في استكشاف زراعة الأسنان على راحتك، من دون أي التزام. إذا أحببت، يمكنك مشاركة صورتك لأسنانك ورقم واتسابك بالصيغة الدولية مع رمز البلد، حتى يتمكن فريقنا من إعداد تقييم مبدئي وإرساله إليك عندما تكون مستعداً.
- **gpt-6.1-terra** · Spanish · facts [none] · Hola, claro. Si te parece, puedes enviarnos una foto de tu sonrisa y tu número de WhatsApp con el código de país para que nuestro equipo prepare una valoración sin compromiso y te la envíe cuando estés listo o lista.
- **gpt-6.1-terra** · English · facts [15] · Hi! At TEST — Prof Clinic (automated runs), our team has 15 years of specialized medical experience, and we offer dental implants to help restore missing teeth. Are you looking to replace all your teeth, or do you still have some natural teeth?
- **gpt-6.1-terra** · Chinese · facts [none] · 你好！我们在 TEST — Prof Clinic (automated runs) 提供种植牙治疗，通过植入颌骨的钛种植体支撑牙冠、牙桥或假牙，帮助患者恢复咀嚼和笑容。 请问您目前是缺失一颗牙，还是多颗牙呢？
- **gpt-6.1-terra** · Turkish · facts [none] · Merhaba, TEST — Prof Clinic (automated runs) olarak implant tedavisi konusunda size yardımcı olabiliriz. Ekibimizin, hazır olduğunuzda size ulaştırmak üzere herhangi bir yükümlülük içermeyen bir ön değerlendirme hazırlaması için WhatsApp’tan bir ağız fotoğrafı paylaşabilirsiniz: +90 542 150 2222.
- **gpt-6.1-terra** · Spanish · facts [none] · Hola, entendemos que quieras valorar tus opciones con calma. Si te parece, puedes escribirnos por WhatsApp al +90 542 150 2222 y nuestro equipo podrá orientarte sin compromiso cuando estés preparado.
