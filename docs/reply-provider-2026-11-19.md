# Reply provider: Sonnet vs gpt-6.1-terra, 2026-11-19

Six smoke-test conversations × 2 runs per arm, on test-clinic. Only the reply model differs.

| Metric | gpt-6.1-terra run 1 | gpt-6.1-terra run 2 | gpt-6.1-terra all |
|---|---|---|---|
| Hard failures (smoke checks) | 0 in 0/6 conv. | 0 in 0/6 conv. | 0 in 0/12 conv. |
| Leads with name and number | 6/6 (100%) | 6/6 (100%) | 12/12 (100%) |
| Replies in the wrong script | 0/42 (0%) | 0/42 (0%) | 0/84 (0%) |
| Dialect introduced (judge) | 1/42 (2%) | 1/42 (2%) | 2/84 (2%) |
| Overloaded replies (density) | 2/42 (5%) | 3/42 (7%) | 5/84 (6%) |
| Mean units per reply | 1.62 | 2.29 | 1.95 |
| Mean words per reply | 34 | 37 | 36 |
| Consecutive replies, same shape | 4/36 (11%) | 4/36 (11%) | 8/72 (11%) |
| Hesitation reply / longest earlier | 0.37 mean; over 0.6: 0/6 (0%) | 0.37 mean; over 0.6: 0/6 (0%) | 0.37 mean; over 0.6: 0/12 (0%) |
| Measured cost per conversation | $0.0260 | $0.0236 | $0.0248 |

Reply model recorded per conversation matches its arm: yes, all.

Dialect markers flagged for gpt-6.1-terra: specialized, specialized

## Transcripts, side by side

### English (Latin baseline), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hi, I'm looking into full dental implants | Hi! At TEST — Prof Clinic (automated runs), we offer dental implants in Istanbul and have 15 years of specialized medical knowledge.<br><br>What’s your situation with your teeth at the moment? |
| 2 | I lost most of my upper teeth about five years ago | Living without most of your upper teeth for five years sounds like a lot to navigate. What has that been like for you? |
| 3 | how much does it cost? | We’ll need our team to confirm the cost based on your case.<br><br>For an accurate quote, could you attach a photo of your teeth here and leave your name and WhatsApp number in full international format, including the country code? |
| 4 | can you walk me through the steps of the whole process? | Yes. Our usual implant process involves two visits to Istanbul:<br><br>Assessment and planning: Our dental team assesses your mouth and jawbone to decide what treatment you need. Some patients need bone grafting if there isn’t enough bone.<br>First visit — around 5 days: We place the implants and provide temporary dentures.<br>Healing — around 4 months: The implants heal before the final crowns are fitted.<br>Second visit — around 7 days: We place the crowns.<br><br>The exact plan depends on your assessment, particularly after missing teeth for several years. |
| 5 (hesitation) | honestly I need to think about it and talk to my wife first | Of course, take the time you need to talk it over with your wife. If you’d like, you can share a photo of your teeth and your WhatsApp number, and our team can prepare a no-obligation assessment for when you’re ready. |
| 6 | David | Thank you, David. Take your time discussing it with your wife—we’re here if either of you has questions. |
| 7 | +44 7700 900123 | Thank you, David. Since implants usually involve two visits about four months apart, knowing when you could travel will help our team plan around you.<br><br>What month are you considering for your first visit? |

### Arabic (right-to-left, ؟), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | مرحبا، أفكر في زراعة الأسنان | مرحباً، يسعدنا مساعدتك في استكشاف زراعة الأسنان على راحتك، من دون أي التزام. إذا أحببت، يمكنك مشاركة صورتك لأسنانك ورقم واتسابك بالصيغة الدولية مع رمز البلد، حتى يتمكن فريقنا من إعداد تقييم مبدئي وإرساله إليك عندما تكون مستعداً. |
| 2 | فقدت معظم أسناني العلوية منذ خمس سنوات | خمس سنوات دون معظم أسنانك العلوية مدة طويلة. ما الذي كانت عليه تجربتك خلال هذه الفترة؟ |
| 3 | كم التكلفة؟ | تختلف التكلفة بحسب عدد الزرعات والعلاج الذي تحتاجه. في TEST — Prof Clinic (automated runs)، سيؤكد لك فريقنا التكلفة بعد تقييم حالتك. |
| 4 | ممكن تشرح لي خطوات العلاج بالتفصيل؟ | بالتأكيد. عادةً تمر زراعة الأسنان لدينا بمرحلتين وزيارتين إلى إسطنبول:<br><br>الزيارة الأولى، ومدتها 5 أيام: نضع الزرعات في عظم الفك ونوفّر أطقم أسنان مؤقتة.<br>فترة الالتئام، ومدتها 4 أشهر: تلتئم خلالها الزرعات في الفك.<br>الزيارة الثانية، ومدتها 7 أيام: نركّب خلالها التيجان.<br><br>وبما أنك فقدت معظم أسنانك العلوية منذ خمس سنوات، سيقيّم طبيب الأسنان كثافة العظم؛ فقد تكون هناك حاجة إلى تطعيم عظمي لضمان ثبات الزرعات. ويؤكد فريقنا الخطة المناسبة بعد تقييم حالتك. |
| 5 (hesitation) | بصراحة أحتاج أفكر في الموضوع وأتكلم مع زوجتي أولاً | طبعاً، خذ وقتك وتحدث مع زوجتك براحتك. نحن هنا إذا ظهرت لديكما أي أسئلة لاحقاً. |
| 6 | خالد | تشرفنا يا خالد. خذ وقتك في التفكير والتحدث مع زوجتك، ونحن هنا متى احتجت إلينا. |
| 7 | +90 532 111 2233 | شكراً يا خالد، حفظنا الرقم الذي شاركته معنا.<br><br>في أي شهر تخطط للقدوم إلى إسطنبول؟ |

### Russian (Cyrillic), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Здравствуйте, меня интересует имплантация зубов | Здравствуйте! В TEST — Prof Clinic (automated runs) мы проводим имплантацию зубов в Стамбуле и используем импланты Implant Swiss.<br><br>Расскажите, пожалуйста, что вы хотели бы восстановить: один зуб или несколько? |
| 2 | Я потерял большинство верхних зубов около пяти лет назад | Понимаем, что потеря большинства верхних зубов могла сильно повлиять на повседневную жизнь. Как вам жилось с этим последние пять лет? |
| 3 | Сколько это стоит? | Стоимость имплантации зависит от состояния челюсти и подходящего плана лечения; точную цену подтвердит наша команда после оценки вашего случая.<br><br>Чтобы получить точный расчёт, можете прикрепить сюда фото ваших зубов и оставить имя и номер WhatsApp полностью, с кодом страны? |
| 4 | Расскажите, пожалуйста, по шагам, как проходит весь процесс? | Обычно имплантация проходит в два приезда:<br><br>Первый приезд — 5 дней: мы устанавливаем импланты и предоставляем временные протезы.<br>Заживление — около 4 месяцев. Если за время после потери зубов объём кости уменьшился, может потребоваться костная пластика.<br>Второй приезд — 7 дней: мы устанавливаем коронки.<br><br>Точный план для вас наша команда определит после оценки состояния зубов и челюсти. |
| 5 (hesitation) | честно говоря, мне нужно подумать и обсудить с женой | Конечно, спокойно обсудите всё с женой — спешить не нужно. Если захотите, можете прислать фото зубов: наша команда подготовит предварительную оценку без обязательств. |
| 6 | Иван | Приятно познакомиться, Иван. Не торопитесь с решением — мы будем рады ответить на вопросы, если они появятся после разговора с женой. |
| 7 | +7 900 123 4567 | Иван, на какой месяц или даты вы планируете первый приезд? |

### Chinese (no spaces between words), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | 你好，我想了解种植牙 | 你好！在 TEST — Prof Clinic (automated runs)，我们有15年专业医疗经验，提供种植牙治疗，帮助患者恢复咀嚼功能和笑容。<br><br>请问你目前是缺失一颗牙，还是有多颗牙缺失呢？ |
| 2 | 我大约五年前失去了大部分上排牙齿 | 上排大部分牙齿缺失已经五年了，这段时间想必给你的生活带来了不少影响。<br><br>这几年对你来说，最困扰的是什么？ |
| 3 | 费用是多少？ | 种植牙的费用需要根据你的口腔情况确定，我们的团队会确认准确报价。为了评估你的情况，可以在这里上传一张口腔照片，并留下你的姓名和带国家代码的完整 WhatsApp 号码吗？我们的团队从国外联系，完整号码才能接通。 |
| 4 | 能详细说明一下整个治疗的步骤吗？ | 我们的种植牙治疗通常分两次到访：<br><br>第一次约5天：种植体植入后，我们会提供临时假牙。<br>愈合期约4个月：等待种植体与颌骨愈合。<br>第二次约7天：制作并安装牙冠。<br><br>由于你已经缺牙约五年，牙槽骨可能有所流失；如果骨量不足，可能需要植骨。具体方案需要我们的牙科团队评估后确认。 |
| 5 (hesitation) | 说实话我需要考虑一下，还要和我太太商量 | 当然，和太太商量后再慢慢考虑很重要。<br><br>如果你愿意，可以通过 WhatsApp（+90 542 150 2222）联系我们，团队可以为你提供不具约束力的初步评估。 |
| 6 | 王伟 | 王伟，很高兴认识你。你和太太可以慢慢商量，如果之后有任何问题，我们都在。 |
| 7 | +86 138 0013 8000 | 收到，谢谢你，王伟。由于种植牙通常需要分两次到访，了解你的计划时间有助于我们安排治疗和确认报价。<br><br>你预计什么时候来伊斯坦布尔？知道具体日期或月份都可以。 |

### Turkish (dotted/dotless i), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Merhaba, implant tedavisi düşünüyorum | Merhaba! TEST — Prof Clinic (automated runs) olarak İstanbul’da 15 yıllık uzmanlık deneyimimizle kişiye özel diş tedavileri sunuyoruz.<br><br>İmplant düşünmenize neden olan durum nedir? |
| 2 | Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim | Beş yıl, üst dişlerinizin çoğu olmadan yaşamak için uzun bir süre. Bu durum günlük hayatınızı nasıl etkiledi? |
| 3 | Fiyat ne kadar? | İmplant tedavisinin fiyatını ekibimiz durumunuzu değerlendirdikten sonra netleştirebilir.<br><br>Doğru bir fiyat alabilmeniz için dişlerinizin fotoğrafını buraya ekleyip adınızı ve WhatsApp numaranızı ülke koduyla birlikte paylaşabilir misiniz? Ekibimiz yurt dışından aradığı için numaranın tam uluslararası biçimde olması gerekiyor. |
| 4 | Tüm sürecin adımlarını tek tek anlatır mısınız? | Elbette. İmplant tedavisi için genel süreç şöyle ilerliyor; sizin durumunuzda ayrıntılar muayeneden sonra netleşir:<br><br>Değerlendirme: Ekibimiz ağız ve çene yapınızı değerlendirerek tedavi planınızı belirler. Kemik yoğunluğu azalmışsa kemik grefti gerekebilir.<br>İlk ziyaret — 5 gün: İmplantlar yerleştirilir ve geçici protezler sağlanır.<br>İyileşme — 4 ay: İmplantların iyileşmesi beklenir.<br>İkinci ziyaret — 7 gün: Kalıcı kronlar hazırlanıp uygulanır.<br><br>İmplant sayısı ve sizin için uygun plan, değerlendirmenin ardından netleşir. |
| 5 (hesitation) | dürüst olmak gerekirse düşünmem ve eşimle konuşmam lazım | Elbette, eşinizle konuşup düşünmeniz çok anlaşılır. Hazır olduğunuzda ekibimizden herhangi bir yükümlülük olmadan değerlendirme almak isterseniz, dişlerinizin bir fotoğrafını ve WhatsApp numaranızı ülke koduyla paylaşabilirsiniz. |
| 6 | Mehmet | Tanıştığımıza memnun olduk Mehmet. Eşinizle konuşup düşünmeniz için elbette zaman ayırabilirsiniz; aklınıza bir soru gelirse buradayız. |
| 7 | +90 532 444 5566 | Teşekkür ederiz Mehmet. İstanbul’a gelmeyi hangi tarihlerde veya hangi ayda planlıyorsunuz? |

### Spanish (¿ inverted punctuation), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Hola, estoy considerando implantes dentales | Hola, claro. Si te parece, puedes enviarnos una foto de tu sonrisa y tu número de WhatsApp con el código de país para que nuestro equipo prepare una valoración sin compromiso y te la envíe cuando estés listo o lista. |
| 2 | Perdí la mayoría de mis dientes superiores hace cinco años | Llevar cinco años sin la mayoría de los dientes superiores puede haber afectado mucho a tu día a día. ¿Cómo ha sido para ti vivir con ello durante este tiempo? |
| 3 | ¿Cuánto cuesta? | El precio depende de tu caso y del tratamiento que necesites; nuestro equipo tendrá que confirmarlo.<br><br>Para darte un presupuesto preciso, ¿puedes adjuntar aquí una foto de tu boca y dejarnos tu nombre y tu número de WhatsApp completo con código de país? |
| 4 | ¿Me explicas paso a paso todo el proceso? | Claro. En TEST — Prof Clinic (automated runs), el proceso habitual de implantes se organiza en dos visitas:<br><br>Valoración y plan: nuestro equipo evalúa tu boca y comprueba si hay suficiente hueso. Si ha disminuido la densidad ósea, puede ser necesario un injerto.<br>Primera visita, de 5 días: colocamos los implantes y proporcionamos prótesis temporales.<br>Cicatrización: se deja un período de 4 meses.<br>Segunda visita, de 7 días: colocamos las coronas.<br><br>El equipo confirmará el plan adecuado para ti tras valorar tu caso. |
| 5 (hesitation) | sinceramente necesito pensarlo y hablarlo con mi mujer | Por supuesto, tómate el tiempo que necesites para hablarlo con tu mujer. Si os surge alguna pregunta, aquí estamos para ayudaros, sin compromiso. |
| 6 | Carlos | Mucho gusto, Carlos. Tómate el tiempo que necesites; aquí estamos si tú o tu mujer tenéis alguna pregunta. |
| 7 | +34 612 345 678 | Gracias, Carlos, hemos anotado tu número. ¿En qué mes o fechas estarías pensando viajar a Estambul? |

### English (Latin baseline), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hi, I'm looking into full dental implants | Hi! At TEST — Prof Clinic (automated runs), our team has 15 years of specialized medical experience, and we offer dental implants to help restore missing teeth.<br><br>Are you looking to replace all your teeth, or do you still have some natural teeth? |
| 2 | I lost most of my upper teeth about five years ago | Living with most of your upper teeth missing for five years is a long time. What has that been like for you? |
| 3 | how much does it cost? | The cost depends on your case, and our team will need to assess it to give you an accurate quote.<br><br>Could you attach a photo of your teeth here and leave your name and WhatsApp number in full international format, including the country code, so our team can reach you from abroad? |
| 4 | can you walk me through the steps of the whole process? | For dental implants, the usual process involves two visits:<br><br>First visit — 5 days: We place the implants and provide temporary dentures.<br>Healing — about 4 months: We allow time for the implants to heal.<br>Second visit — 7 days: We fit the crowns.<br><br>Because you lost your upper teeth around five years ago, our team would also need to check your bone density. If it has reduced, bone grafting may be needed for implant stability. The team can confirm the right plan and timing after assessing your case. |
| 5 (hesitation) | honestly I need to think about it and talk to my wife first | Of course—take your time and talk it over with your wife.<br><br>If it would help, you’re welcome to send our team a WhatsApp message at +90 542 150 2222 for a no-obligation assessment whenever you’re ready. |
| 6 | David | Thank you, David. We’re here if you or your wife have any questions while you consider your options. |
| 7 | +44 7700 900123 | Thanks, David. Since implant treatment usually involves two visits separated by about four months of healing, knowing your travel plans helps us work out a suitable timeline.<br><br>When are you thinking of coming to Istanbul—do you have dates or a month in mind? |

### Arabic (right-to-left, ؟), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | مرحبا، أفكر في زراعة الأسنان | مرحباً! في TEST — Prof Clinic (automated runs)، نستخدم غرسات Implant Swiss لتعويض الأسنان المفقودة.<br><br>وإذا أحببت، يمكنك مراسلتنا بصورة لأسنانك عبر واتساب على ‎+90 542 150 2222، ليتمكن فريقنا من مساعدتك في تقييم حالتك، دون أي التزام. |
| 2 | فقدت معظم أسناني العلوية منذ خمس سنوات | لا بد أن فقدان معظم أسنانك العلوية رافقك في تفاصيل كثيرة خلال السنوات الخمس الماضية. كيف أثّر ذلك على حياتك اليومية؟ |
| 3 | كم التكلفة؟ | تعتمد تكلفة الزراعة على حالتك وخطة العلاج، وسيؤكد لك فريقنا السعر بعد تقييمها.<br><br>هل يمكنك إرفاق صورة لأسنانك هنا وترك اسمك ورقم واتساب كاملاً مع رمز الدولة، حتى يتمكن فريقنا من تقديم عرض دقيق والتواصل معك من الخارج؟ |
| 4 | ممكن تشرح لي خطوات العلاج بالتفصيل؟ | بالتأكيد. في TEST — Prof Clinic (automated runs)، تتم زراعة الأسنان عادةً على زيارتين:<br><br>الزيارة الأولى، لمدة 5 أيام: نضع الغرسات في عظم الفك، ونوفر أطقم أسنان مؤقتة.<br>فترة الالتئام، لمدة 4 أشهر: تلتئم خلالها الأنسجة حول الغرسات قبل المرحلة التالية.<br>الزيارة الثانية، لمدة 7 أيام: نركّب التيجان على الغرسات.<br><br>ولأنك فقدت معظم أسنانك العلوية منذ خمس سنوات، سيحتاج فريقنا إلى تقييم عظم الفك؛ فقد تكون هناك حاجة إلى تطعيم عظمي إذا انخفضت كثافته. وسيؤكد الفريق خطة العلاج المناسبة لك بعد التقييم. |
| 5 (hesitation) | بصراحة أحتاج أفكر في الموضوع وأتكلم مع زوجتي أولاً | طبعاً، خذ وقتك وتحدث مع زوجتك براحتك. وإذا أحببت لاحقاً، يمكنك مراسلتنا بصورة لأسنانك عبر واتساب على ‎+90 542 150 2222، ليقيّمها فريقنا ويشاركك رأيه دون أي التزام. |
| 6 | خالد | تشرفنا يا خالد. خذ وقتك في التفكير والتحدث مع زوجتك، ونحن هنا إذا احتجت إلى أي توضيح لاحقاً. |
| 7 | +90 532 111 2233 | شكراً يا خالد. متى تخطط للمجيء إلى إسطنبول، ولو بشكل تقريبي بالشهر؟ |

### Russian (Cyrillic), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Здравствуйте, меня интересует имплантация зубов | Здравствуйте! В TEST — Prof Clinic (automated runs) мы проводим имплантацию зубов в Стамбуле и используем импланты Implant Swiss.<br><br>Расскажите, пожалуйста, сколько зубов вы хотели бы восстановить? |
| 2 | Я потерял большинство верхних зубов около пяти лет назад | Пять лет — немалый срок, чтобы жить с потерей большинства верхних зубов. Как это повлияло на вашу повседневную жизнь? |
| 3 | Сколько это стоит? | Стоимость зависит от вашего случая; наша команда уточнит цену после оценки.<br><br>Для точного расчёта не могли бы вы прикрепить здесь фото зубов и оставить ваше имя и номер WhatsApp в полном международном формате с кодом страны? |
| 4 | Расскажите, пожалуйста, по шагам, как проходит весь процесс? | Обычно имплантация проходит в несколько этапов:<br><br>Оценка. Наша команда изучает состояние зубов и челюстной кости и определяет план лечения. Если кости недостаточно, может понадобиться костная пластика.<br>Первый визит — 5 дней. Мы устанавливаем импланты и предоставляем временные протезы.<br>Заживление — около 4 месяцев. За это время импланты приживаются.<br>Второй визит — 7 дней. Мы устанавливаем коронки.<br><br>Поскольку большинство верхних зубов вы потеряли около пяти лет назад, состояние кости особенно важно проверить. Точный план наша команда подтвердит после оценки вашего случая. |
| 5 (hesitation) | честно говоря, мне нужно подумать и обсудить с женой | Конечно, обсудите всё спокойно с женой. Если захотите, можете оставить номер WhatsApp с кодом страны — наша команда подготовит предварительную оценку без обязательств и свяжется с вами, когда вам будет удобно. |
| 6 | Иван | Спасибо, Иван. Конечно, не торопитесь — мы будем здесь, если после разговора с женой у вас появятся вопросы. |
| 7 | +7 900 123 4567 | Спасибо, Иван, номер получили. На какой месяц вы примерно планируете приехать? |

### Chinese (no spaces between words), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | 你好，我想了解种植牙 | 你好！我们在 TEST — Prof Clinic (automated runs) 提供种植牙治疗，通过植入颌骨的钛种植体支撑牙冠、牙桥或假牙，帮助患者恢复咀嚼和笑容。<br><br>请问您目前是缺失一颗牙，还是多颗牙呢？ |
| 2 | 我大约五年前失去了大部分上排牙齿 | 上排大部分牙齿缺失已经五年了，这段时间一定给生活带来了一些变化。对您来说，这些年最受影响的是什么？ |
| 3 | 费用是多少？ | 种植牙的费用需要根据您缺失牙齿的情况和治疗方案确定，我们的团队会为您确认准确报价。<br><br>为了评估您的情况并报价，您可以在这里附上一张口腔照片，并留下您的姓名和完整国际格式的 WhatsApp 号码（含国家代码），方便我们的团队从国外联系您吗？ |
| 4 | 能详细说明一下整个治疗的步骤吗？ | 可以。我们通常会先由牙医评估您的口腔和颌骨情况，确定适合的方案。您已经缺牙约五年，团队也会评估骨量是否足够；如果骨量减少，可能需要植骨，具体要看检查结果。<br><br>我们的种植牙治疗通常分两次来诊：<br><br>第一次约 5 天：植入种植体，并提供临时假牙。<br>愈合约 4 个月：让种植体与颌骨结合。<br>第二次约 7 天：制作并安装牙冠。<br><br>如果需要植骨或其他治疗，具体步骤和时间安排由团队评估后确认。 |
| 5 (hesitation) | 说实话我需要考虑一下，还要和我太太商量 | 当然，和太太商量后再决定很重要。如果您愿意，也可以留下 WhatsApp 号码，我们的团队可以在您准备好时为您确认费用，无需做任何决定。 |
| 6 | 王伟 | 王先生，谢谢您告诉我们。您先和太太慢慢商量，有任何问题，随时可以回来问我们。 |
| 7 | +86 138 0013 8000 | 谢谢您，王先生，我们收到了您的号码。种植牙通常需要分两次来诊，计划来诊的时间会影响治疗安排和报价。<br><br>您大概计划什么时候来伊斯坦布尔？有具体日期或月份都可以。 |

### Turkish (dotted/dotless i), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Merhaba, implant tedavisi düşünüyorum | Merhaba, TEST — Prof Clinic (automated runs) olarak implant tedavisi konusunda size yardımcı olabiliriz. Ekibimizin, hazır olduğunuzda size ulaştırmak üzere herhangi bir yükümlülük içermeyen bir ön değerlendirme hazırlaması için WhatsApp’tan bir ağız fotoğrafı paylaşabilirsiniz: +90 542 150 2222. |
| 2 | Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim | Üst dişlerinizin çoğu olmadan beş yıl geçirmek kolay olmamış olabilir. Bu süreç sizin için nasıl geçti? |
| 3 | Fiyat ne kadar? | İmplant tedavisinin fiyatı için ekibimizin durumunuzu değerlendirmesi gerekiyor; elimizde paylaşabileceğimiz bir fiyat bilgisi yok.<br><br>Size doğru bir fiyat sunabilmemiz için buraya ağız fotoğrafınızı, adınızı ve ekibimizin yurt dışından ulaşabilmesi için ülke koduyla birlikte WhatsApp numaranızı bırakabilir misiniz? |
| 4 | Tüm sürecin adımlarını tek tek anlatır mısınız? | Tabii. TEST — Prof Clinic (automated runs) olarak implant tedavisini genel olarak şu aşamalarda yürütüyoruz:<br><br>Değerlendirme: Dişlerinizin ve çene kemiğinizin durumu değerlendirilir. Kemik yoğunluğu azalmışsa kemik grefti gerekebilir.<br>İlk ziyaret: Yaklaşık 5 gün sürer. İmplantlar yerleştirilir ve geçici protezler hazırlanır.<br>İyileşme: İmplantların iyileşmesi için yaklaşık 4 ay beklenir.<br>İkinci ziyaret: Yaklaşık 7 gün sürer. Bu ziyarette kronlar yapılır.<br><br>Bunlar genel sürelerdir; sizin için uygun planı ekibimiz değerlendirmenizden sonra netleştirecektir. |
| 5 (hesitation) | dürüst olmak gerekirse düşünmem ve eşimle konuşmam lazım | Elbette, eşinizle konuşup düşünmeniz çok doğal. Hazır olduğunuzda, ekibimizin size yükümlülük içermeyen bir ön değerlendirme hazırlaması için ağız fotoğrafınızı WhatsApp’tan paylaşabilirsiniz: +90 542 150 2222. |
| 6 | Mehmet | Tanıştığımıza memnun olduk Mehmet. Eşinizle konuşup düşünmek için ihtiyacınız olan zamanı ayırabilirsiniz; hazır olduğunuzda buradayız. |
| 7 | +90 532 444 5566 | Teşekkür ederiz Mehmet. İmplant tedavisi iki ziyaret gerektirdiği için, İstanbul’a hangi ay gelmeyi planlıyorsunuz? |

### Spanish (¿ inverted punctuation), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Hola, estoy considerando implantes dentales | Hola, entendemos que quieras valorar tus opciones con calma. Si te parece, puedes escribirnos por WhatsApp al +90 542 150 2222 y nuestro equipo podrá orientarte sin compromiso cuando estés preparado. |
| 2 | Perdí la mayoría de mis dientes superiores hace cinco años | Llevar cinco años sin la mayoría de los dientes superiores puede haber tenido un impacto importante en tu día a día.<br><br>¿Qué ha sido lo más difícil para ti durante este tiempo? |
| 3 | ¿Cuánto cuesta? | Entendemos que quieras saber el precio. En TEST — Prof Clinic (automated runs), nuestro equipo tendrá que revisar tu caso para darte un presupuesto preciso.<br><br>¿Puedes adjuntar aquí una foto de tu boca y dejarnos tu nombre y número de WhatsApp completo, con código de país? |
| 4 | ¿Me explicas paso a paso todo el proceso? | Claro. El proceso de implantes suele incluir dos visitas a Estambul:<br>Valoración: el equipo revisa tu caso y confirma qué tratamiento necesitas. Como perdiste los dientes hace cinco años, también será importante valorar el hueso; si ha disminuido demasiado, podría hacer falta un injerto.<br>Primera visita, de 5 días: colocamos los implantes y proporcionamos prótesis dentales temporales.<br>Cicatrización: dejamos un periodo de aproximadamente 4 meses para que la zona sane.<br>Segunda visita, de 7 días: colocamos las coronas. Nuestro equipo confirmará los pasos adecuados para tu caso. |
| 5 (hesitation) | sinceramente necesito pensarlo y hablarlo con mi mujer | Por supuesto, tómate el tiempo que necesites para hablarlo con tu mujer. Si más adelante os surgen dudas, podéis escribirnos por WhatsApp al +90 542 150 2222, sin compromiso. |
| 6 | Carlos | Encantados, Carlos. Tómate el tiempo que necesites; aquí estaremos si tú o tu mujer tenéis alguna duda. |
| 7 | +34 612 345 678 | Gracias, Carlos. ¿En qué fecha o mes estás pensando viajar a Estambul? |
