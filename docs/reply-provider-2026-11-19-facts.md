# Reply provider: Sonnet vs gpt-6.1-terra, 2026-11-19

Six smoke-test conversations × 2 runs per arm, on test-clinic. Only the reply model differs.

| Metric | gpt-6.1-terra run 1 | gpt-6.1-terra run 2 | gpt-6.1-terra all |
|---|---|---|---|
| Hard failures (smoke checks) | 0 in 0/6 conv. | 0 in 0/6 conv. | 0 in 0/12 conv. |
| Leads with name and number | 6/6 (100%) | 6/6 (100%) | 12/12 (100%) |
| Replies in the wrong script | 0/42 (0%) | 0/42 (0%) | 0/84 (0%) |
| Dialect introduced (judge) | 1/42 (2%) | 1/42 (2%) | 2/84 (2%) |
| Overloaded replies (density) | 0/42 (0%) | 0/42 (0%) | 0/84 (0%) |
| Mean units per reply | 1.98 | 1.86 | 1.92 |
| Mean words per reply | 37 | 35 | 36 |
| Consecutive replies, same shape | 5/36 (14%) | 4/36 (11%) | 9/72 (13%) |
| Hesitation reply / longest earlier | 0.40 mean; over 0.6: 0/6 (0%) | 0.50 mean; over 0.6: 1/6 (17%) | 0.45 mean; over 0.6: 1/12 (8%) |
| Measured cost per conversation | $0.0256 | $0.0242 | $0.0249 |

Reply model recorded per conversation matches its arm: yes, all.

Dialect markers flagged for gpt-6.1-terra: tómense el tiempo que necesiten, compartirnos una foto

## Transcripts, side by side

### English (Latin baseline), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hi, I'm looking into full dental implants | Hi! At TEST — Prof Clinic (automated runs), we help patients restore missing teeth with dental implants, which can support a bridge or denture.<br><br>What’s your current situation with your teeth? |
| 2 | I lost most of my upper teeth about five years ago | Losing most of your upper teeth five years ago is a lot to live with. What has that been like for you day to day? |
| 3 | how much does it cost? | Our team will need to assess your case before confirming the cost.<br><br>Could you attach a photo of your teeth here and leave your name and WhatsApp number, including the country code? |
| 4 | can you walk me through the steps of the whole process? | Of course. Our dental implant treatment generally involves two visits to Istanbul:<br><br>First visit — 5 days: We place the implants and provide temporary dentures.<br>Healing — around 4 months: The implants heal before the crowns are fitted.<br>Second visit — 7 days: We fit the crowns.<br><br>Since you lost your upper teeth about five years ago, our dental team would also need to assess your jawbone. If bone density has reduced, bone grafting may be needed, which could change the plan or timing. |
| 5 (hesitation) | honestly I need to think about it and talk to my wife first | Of course—take your time and talk it through with your wife.<br><br>If it helps, you’re welcome to message us on WhatsApp at +90 542 150 2222 whenever you’re ready, and our team can help with any questions, with no obligation. |
| 6 | David | Thanks for sharing your name, David. Take all the time you need to talk things over with your wife—we’re here if either of you has questions. |
| 7 | +44 7700 900123 | Thanks, David. Because implant treatment usually involves two visits with around four months of healing between them, knowing when you can travel helps us plan the stages.<br><br>When are you hoping to come to Istanbul, even roughly by month? |

### Arabic (right-to-left, ؟), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | مرحبا، أفكر في زراعة الأسنان | أهلًا بك! في TEST — Prof Clinic (automated runs)، نجمع بين خبرة 15 عامًا والرعاية الشخصية لمساعدة مرضانا على استعادة ابتسامتهم.<br><br>ما الذي دفعك للتفكير في زراعة الأسنان الآن؟ |
| 2 | فقدت معظم أسناني العلوية منذ خمس سنوات | لا بد أن فقدان معظم أسنانك العلوية منذ خمس سنوات قد أثّر في حياتك اليومية. كيف كانت تجربتك خلال هذه الفترة؟ |
| 3 | كم التكلفة؟ | تعتمد تكلفة زراعة الأسنان على حالتك، وسيؤكدها فريقنا بعد تقييمها.<br><br>هل يمكنك إرفاق صورة لأسنانك هنا وترك اسمك ورقم واتساب كاملًا مع رمز الدولة ليقدم لك فريقنا عرضًا دقيقًا؟ |
| 4 | ممكن تشرح لي خطوات العلاج بالتفصيل؟ | بالتأكيد. خطة زراعة الأسنان تعتمد على فحص حالتك، لكن العلاج لدينا يتم عادةً على زيارتين:<br><br>التقييم: يفحص طبيب الأسنان الفم والعظم لتحديد خطة العلاج. إذا كانت كثافة العظم منخفضة، فقد تحتاج إلى تطعيم عظمي لضمان ثبات الزرعات.<br>الزيارة الأولى: تستغرق 5 أيام، نضع خلالها الزرعات ونوفر أطقم أسنان مؤقتة.<br>فترة الالتئام: تستمر نحو 4 أشهر، حتى يلتئم العظم حول الزرعات.<br>الزيارة الثانية: تستغرق 7 أيام، ونضع خلالها التيجان.<br><br>سيؤكد فريقنا الخطوات المناسبة لك بعد تقييم حالتك، خصوصًا بعد مرور خمس سنوات على فقدان معظم أسنانك العلوية. |
| 5 (hesitation) | بصراحة أحتاج أفكر في الموضوع وأتكلم مع زوجتي أولاً | طبعًا، خذ وقتك وتحدث مع زوجتك براحتك. إذا رغبت لاحقًا، يمكنك مراسلة فريقنا على واتساب عبر ‎+90 542 150 2222‎ للحصول على تقييم أولي من دون التزام. |
| 6 | خالد | تشرفنا يا خالد. خذ وقتك في التفكير والتحدث مع زوجتك، ونحن هنا إذا احتجت أي توضيح لاحقًا. |
| 7 | +90 532 111 2233 | شكرًا لك يا خالد. متى تخطط للقدوم إلى إسطنبول، ولو بشكل تقريبي؟ |

### Russian (Cyrillic), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Здравствуйте, меня интересует имплантация зубов | Здравствуйте! В TEST — Prof Clinic (automated runs) мы используем зубные импланты Implant Swiss, а лечение проводим в Стамбуле.<br><br>Расскажите, пожалуйста, что привело вас к мысли об имплантации? |
| 2 | Я потерял большинство верхних зубов около пяти лет назад | Пять лет — немалый срок, чтобы жить без большинства верхних зубов. Как это повлияло на вашу повседневную жизнь? |
| 3 | Сколько это стоит? | Стоимость имплантации зависит от вашего случая; наша команда уточнит её после оценки.<br><br>Чтобы получить точный расчёт, можете прикрепить здесь фото зубов и написать ваше имя и номер WhatsApp полностью с кодом страны, чтобы команда могла связаться с вами из-за рубежа? |
| 4 | Расскажите, пожалуйста, по шагам, как проходит весь процесс? | Имплантация обычно проходит в два визита:<br><br>Первый визит — 5 дней: мы устанавливаем импланты и предоставляем временные протезы.<br>Заживление — 4 месяца: за это время импланты приживаются.<br>Второй визит — 7 дней: мы устанавливаем коронки.<br><br>Поскольку большинство верхних зубов вы потеряли около пяти лет назад, нашей команде также нужно будет оценить состояние челюстной кости. Если её плотность снизилась, может потребоваться костная пластика. Окончательный план команда уточнит после оценки вашего случая. |
| 5 (hesitation) | честно говоря, мне нужно подумать и обсудить с женой | Конечно, обсудите всё с женой спокойно. Если захотите, можете оставить номер WhatsApp с кодом страны — наша команда будет на связи, когда вы будете готовы. Без каких-либо обязательств. |
| 6 | Иван | Спасибо, Иван. Спокойно обсудите всё с женой. Если позже возникнут вопросы, мы будем рады помочь. |
| 7 | +7 900 123 4567 | Спасибо, Иван, номер записали. На какой месяц вы планируете поездку в Стамбул? |

### Chinese (no spaces between words), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | 你好，我想了解种植牙 | 你好！在 TEST — Prof Clinic (automated runs)，我们有15年的专业医疗经验，致力于为患者提供个性化护理。<br><br>种植牙通常是在颌骨中植入一颗钛合金人工牙根，再用它支撑牙冠、牙桥或假牙。我们使用 Implant Swiss 种植体。<br><br>您是缺少一颗牙，还是有多颗牙需要修复呢？ |
| 2 | 我大约五年前失去了大部分上排牙齿 | 上排大部分牙齿缺失已经五年了，这一定对您的日常生活有不少影响。您这几年吃东西或与人交流时，感觉怎么样？ |
| 3 | 费用是多少？ | 种植牙的费用需要根据您的具体情况确定，我们的团队会为您确认准确报价。<br><br>为了准确报价，您可以在这里上传一张口腔照片，并留下您的姓名和带国家代码的 WhatsApp 号码吗？ |
| 4 | 能详细说明一下整个治疗的步骤吗？ | 通常，种植牙治疗分两次来伊斯坦布尔，具体方案需要由我们的团队评估后确定：<br><br>第一次，约5天：植入种植体，并为您提供临时假牙。您已经缺牙五年，如果检查发现骨量不足，可能需要植骨。<br>愈合期，约4个月：让种植体与颌骨愈合。<br>第二次，约7天：制作并安装牙冠，完成修复。<br><br>您的具体步骤和时间会根据口腔及骨量情况调整。 |
| 5 (hesitation) | 说实话我需要考虑一下，还要和我太太商量 | 当然，和太太商量、慢慢考虑是很重要的。<br><br>如果您愿意，也可以通过 WhatsApp（+90 542 150 2222）给我们发一张口腔照片，我们的团队可以为您准备一份无义务的初步评估，方便您们商量。 |
| 6 | 王伟 | 王先生，谢谢您告诉我们您的名字。您和太太慢慢商量就好；之后如果有任何问题，我们随时愿意帮您解答。 |
| 7 | +86 138 0013 8000 | 谢谢您留下联系方式，王先生。<br><br>种植牙通常需要分两次来诊，中间约有4个月的愈合期。了解您预计的出行时间，有助于我们安排治疗并确认报价。您计划什么时候来伊斯坦布尔，方便的话告诉我们大概的月份就好？ |

### Turkish (dotted/dotless i), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Merhaba, implant tedavisi düşünüyorum | Merhaba, TEST — Prof Clinic (automated runs) olarak İstanbul’da eksik dişlerin yerine implant tedavisi sunuyoruz. İmplantlar, çene kemiğine yerleştirilen ve üzerine diş yapılmasını sağlayan yapay köklerdir.<br><br>İmplant tedavisini düşünmenize ne sebep oldu? |
| 2 | Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim | Beş yıldır üst dişlerinizin çoğu olmadan yaşamak günlük hayatınızı etkilemiş olabilir. Bu süreç sizin için nasıl geçti? |
| 3 | Fiyat ne kadar? | İmplant tedavisinin fiyatını ekibimiz, durumunuzu değerlendirdikten sonra netleştirebilir.<br><br>Size doğru bir fiyat verebilmemiz için dişlerinizin fotoğrafını buraya ekleyip adınızı ve ülke koduyla birlikte WhatsApp numaranızı paylaşabilir misiniz? Ekibimiz yurt dışından aradığı için numaranın uluslararası formatta olması gerekiyor. |
| 4 | Tüm sürecin adımlarını tek tek anlatır mısınız? | Elbette. İmplant tedavisi genellikle şu adımlarla ilerliyor:<br><br>Değerlendirme: Ekibimiz eksik dişlerinizi ve çene kemiğinizin durumunu değerlendirerek tedavi planını belirler. Kemik yoğunluğu azalmışsa kemik grefti gerekebilir.<br>İlk ziyaret: Genellikle 5 gün sürer. İmplantlar yerleştirilir ve geçici protezler sağlanır.<br>İyileşme: İmplantların iyileşmesi için yaklaşık 4 ay beklenir.<br>İkinci ziyaret: Genellikle 7 gün sürer ve kronlar yapılır.<br><br>Üst çenenizdeki diş kaybının kapsamına ve kemik durumunuza göre ayrıntılar değişebilir; ekibimiz sizin için uygun planı değerlendirme sonrasında netleştirir. |
| 5 (hesitation) | dürüst olmak gerekirse düşünmem ve eşimle konuşmam lazım | Elbette, eşinizle konuşup düşünmeniz çok doğal. Hazır hissettiğinizde, ekibimizin durumunuzu değerlendirmesi için dişlerinizin fotoğrafını ve ülke koduyla birlikte WhatsApp numaranızı paylaşabilirsiniz; bu sizi herhangi bir şeye bağlamaz. |
| 6 | Mehmet | Memnun olduk Mehmet. Eşinizle konuşup düşünmek için ihtiyacınız olan zamanı alın; aklınıza bir soru gelirse buradayız. |
| 7 | +90 532 444 5566 | Teşekkürler Mehmet, numaranızı aldık. İmplant tedavisi iki ziyaret gerektirdiği için ilk ziyaretinizde hangi ay gelmeyi planlıyorsunuz? |

### Spanish (¿ inverted punctuation), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Hola, estoy considerando implantes dentales | ¡Hola! En TEST — Prof Clinic (automated runs) combinamos atención personalizada con 15 años de experiencia, y ofrecemos implantes dentales en Estambul.<br><br>¿Qué te gustaría mejorar de tu sonrisa? |
| 2 | Perdí la mayoría de mis dientes superiores hace cinco años | Llevar cinco años sin la mayoría de los dientes superiores puede haber afectado muchos aspectos de tu vida. Gracias por contárnoslo.<br><br>¿Cómo ha sido para ti vivir con esa pérdida? |
| 3 | ¿Cuánto cuesta? | El precio depende de tu caso; nuestro equipo tendrá que revisarlo para darte un presupuesto preciso. ¿Puedes adjuntar aquí una foto de tu boca y dejarnos tu nombre y tu número de WhatsApp completo, con código de país, para que podamos contactarte desde el extranjero? |
| 4 | ¿Me explicas paso a paso todo el proceso? | Claro. El plan exacto depende de la evaluación de tu boca y del hueso, pero el proceso de implantes en TEST — Prof Clinic (automated runs) suele organizarse así:<br><br>Evaluación: nuestro equipo revisa tu caso y determina qué tratamiento necesitas. Tras varios años sin dientes, puede ser necesario un injerto si ha disminuido la cantidad de hueso.<br>Primera visita: dura 5 días. Se colocan los implantes y proporcionamos prótesis temporales.<br>Cicatrización: se deja un periodo de 4 meses para la recuperación.<br>Segunda visita: dura 7 días. Se colocan las coronas.<br><br>Nuestro equipo te confirmará los pasos y el plan adecuados para ti después de evaluar tu caso. |
| 5 (hesitation) | sinceramente necesito pensarlo y hablarlo con mi mujer | Por supuesto, tómense el tiempo que necesiten. Si les ayuda, podemos preparar una valoración sin compromiso a partir de una foto de tu boca y enviártela por WhatsApp cuando estés listo. |
| 6 | Carlos | Mucho gusto, Carlos. Gracias por compartirlo con nosotros. Tómate el tiempo que necesites para hablarlo con tu mujer; aquí estaremos si les surge alguna pregunta. |
| 7 | +34 612 345 678 | Gracias, Carlos. ¿En qué mes estás pensando viajar a Estambul para la primera visita? |

### English (Latin baseline), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hi, I'm looking into full dental implants | Hi! At TEST — Prof Clinic (automated runs), we offer dental implants to replace missing teeth, with temporary dentures provided during the healing period.<br><br>What’s your situation with your teeth at the moment? |
| 2 | I lost most of my upper teeth about five years ago | That’s a long time to live with most of your upper teeth missing. What has that been like for you? |
| 3 | how much does it cost? | Our team will need to assess your case to give you an accurate price.<br><br>Could you attach a photo of your teeth here and leave your name and WhatsApp number, including the country code? |
| 4 | can you walk me through the steps of the whole process? | For implants, our usual process involves two visits to Istanbul:<br><br>First visit — 5 days: We place the implants and provide temporary dentures.<br>Healing — 4 months: The implants are left to heal.<br>Second visit — 7 days: We fit the crowns.<br><br>Because you lost your upper teeth five years ago, our team would also check your jawbone. If bone density has reduced, bone grafting may be needed; the team can confirm whether that applies to you and how it might affect the plan. |
| 5 (hesitation) | honestly I need to think about it and talk to my wife first | Of course, take your time and talk it through with your wife. If it helps, you can send a photo to our WhatsApp at (+90) 542 150 2222, and our team can prepare a no-obligation assessment for whenever you’re ready. |
| 6 | David | Thank you, David. Take all the time you need to discuss it with your wife. We’re here if any questions come up. |
| 7 | +44 7700 900123 | Thanks, David. Since implant treatment usually involves two visits around a four-month healing period, knowing when you can travel will help us plan the timing.<br><br>When are you thinking of coming to Istanbul—even an approximate month is helpful? |

### Arabic (right-to-left, ؟), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | مرحبا، أفكر في زراعة الأسنان | مرحباً بك! في TEST — Prof Clinic (automated runs)، نجمع بين الخبرة الطبية والرعاية الشخصية لمساعدة مرضانا على استعادة ابتسامتهم.<br><br>ما الذي دفعك للتفكير في زراعة الأسنان الآن؟ |
| 2 | فقدت معظم أسناني العلوية منذ خمس سنوات | فقدان معظم أسنانك العلوية منذ خمس سنوات تجربة قد تكون أثّرت في حياتك اليومية وثقتك بابتسامتك.<br><br>كيف كانت هذه الفترة بالنسبة لك؟ |
| 3 | كم التكلفة؟ | تعتمد التكلفة على حالتك، وسيؤكدها لك فريقنا بعد تقييمها. هل يمكنك إرفاق صورة لأسنانك هنا في المحادثة وترك اسمك ورقم واتساب كاملاً مع رمز الدولة، حتى يتمكن فريقنا من الاتصال بك من الخارج وإعطائك عرض سعر دقيقاً؟ |
| 4 | ممكن تشرح لي خطوات العلاج بالتفصيل؟ | عادةً تتضمن زراعة الأسنان لدينا زيارتين إلى إسطنبول، وبينهما فترة تعافٍ:<br><br>التقييم: يقيّم طبيب الأسنان الأسنان المتبقية وعظم الفك لتحديد الخطة المناسبة. وبعد مرور فترة طويلة على فقدان الأسنان، قد تقل كثافة العظم وقد تكون هناك حاجة إلى تطعيم عظمي لضمان ثبات الزرعات.<br>الزيارة الأولى — 5 أيام: نضع الزرعات في عظم الفك ونوفّر أطقم أسنان مؤقتة.<br>التعافي — 4 أشهر: تُترك الزرعات خلال هذه الفترة للالتئام.<br>الزيارة الثانية — 7 أيام: نركّب التيجان الدائمة.<br><br>قد تختلف الخطة حسب حالة فكك وأسنانك، وسيؤكد فريقنا التفاصيل بعد تقييم حالتك. |
| 5 (hesitation) | بصراحة أحتاج أفكر في الموضوع وأتكلم مع زوجتي أولاً | طبعاً، خذ وقتك وتحدّث مع زوجتك براحتك. وإذا أحببت، يمكنك مراسلة فريقنا عبر واتساب على ‎+90 542 150 2222 لنحتفظ بتواصلك ونجيب عن أي استفسار عندما تكون مستعداً، دون أي التزام. |
| 6 | خالد | تشرفنا بك يا خالد. خذ وقتك في التفكير والتحدث مع زوجتك، ونحن هنا متى احتجت إلى أي توضيح. |
| 7 | +90 532 111 2233 | شكراً يا خالد. متى تخطط للقدوم إلى إسطنبول، ولو بشكل تقريبي؟ |

### Russian (Cyrillic), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Здравствуйте, меня интересует имплантация зубов | Здравствуйте! В TEST — Prof Clinic (automated runs) мы помогаем восстановить улыбку с помощью зубных имплантов: они служат опорой для коронки, моста или протеза.<br><br>Что бы вам хотелось изменить или восстановить в первую очередь? |
| 2 | Я потерял большинство верхних зубов около пяти лет назад | Понимаем, что пять лет без большинства верхних зубов — это долгий срок. Как это повлияло на вашу повседневную жизнь? |
| 3 | Сколько это стоит? | Стоимость имплантации зависит от вашего случая; наша команда сможет её уточнить после оценки.<br><br>Для точного расчёта не могли бы вы прикрепить здесь фото зубов и оставить имя и номер WhatsApp в международном формате с кодом страны, чтобы мы могли связаться с вами из-за границы? |
| 4 | Расскажите, пожалуйста, по шагам, как проходит весь процесс? | Обычно имплантация проходит в два визита:<br><br>Первый визит — 5 дней. Устанавливаем импланты и предоставляем временные протезы.<br>Период заживления — 4 месяца.<br>Второй визит — 7 дней. Устанавливаем коронки.<br><br>Поскольку зубы были потеряны около пяти лет назад, перед лечением важно оценить объём костной ткани: если она уменьшилась, может потребоваться костная пластика. Точный план наша команда подтвердит после оценки вашего случая. |
| 5 (hesitation) | честно говоря, мне нужно подумать и обсудить с женой | Конечно, спокойно всё обдумайте и обсудите с женой — решение важное.<br><br>Если захотите позже получить предварительную оценку без обязательств, можете написать нам в WhatsApp: +90 542 150 2222. |
| 6 | Иван | Спасибо, Иван. Не торопитесь с решением — мы будем рады ответить на вопросы, если они появятся. |
| 7 | +7 900 123 4567 | Спасибо, Иван, записали ваш номер. На какой месяц вы планируете поездку? |

### Chinese (no spaces between words), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | 你好，我想了解种植牙 | 你好！在 TEST — Prof Clinic (automated runs)，我们的种植牙治疗会根据患者的情况制定方案，帮助恢复咀嚼和微笑的信心。<br><br>你目前是缺失了一颗牙，还是多颗牙呢？ |
| 2 | 我大约五年前失去了大部分上排牙齿 | 失去大部分上排牙齿已经五年了，这段时间一定经历了不少适应。<br><br>这几年对你的生活有什么影响呢？ |
| 3 | 费用是多少？ | 种植牙的费用需要根据你的口腔情况确定，我们的团队会为你确认准确报价。为了评估并报价，可以在这里上传一张口腔照片，并留下你的姓名和带国家代码的 WhatsApp 号码吗？ |
| 4 | 能详细说明一下整个治疗的步骤吗？ | 种植牙治疗通常分为两个阶段：<br><br>第一次来诊约需约 5 天：我们的牙科团队会先评估你的口腔状况，再进行种植体植入，并提供临时假牙。由于你缺牙已有五年，团队也会评估牙槽骨；如果骨量不足，可能需要植骨。<br><br>愈合约 4 个月后第二次来诊约：通常需要约 7 天，我们会制作和安装牙冠。<br><br>具体方案和时间仍要由团队根据你的检查结果确认。 |
| 5 (hesitation) | 说实话我需要考虑一下，还要和我太太商量 | 当然，和太太商量一下很重要，不用着急决定。<br><br>如果你愿意，也可以随时通过 WhatsApp 联系我们的团队（+90 542 150 2222），发送口腔照片，让团队为你准备一份无需承诺的初步评估。 |
| 6 | 王伟 | 王伟，你好。慢慢和太太商量就好，我们随时都在。 |
| 7 | +86 138 0013 8000 | 谢谢你，王伟，我们已记下你的联系方式。种植牙通常需要分两次到访，间隔约四个月；了解你的旅行时间，有助于我们的团队评估如何安排治疗和报价。<br><br>你大概计划什么时候来伊斯坦布尔？有预计的月份也可以。 |

### Turkish (dotted/dotless i), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Merhaba, implant tedavisi düşünüyorum | Merhaba! TEST — Prof Clinic (automated runs) olarak İstanbul’da eksik dişlerin yerine implant tedavisi sunuyoruz. İmplant, çene kemiğine yerleştirilen ve üzerine kaplama, köprü veya protez yapılabilen titanyum bir kök görevi görür.<br><br>Sizi implant tedavisi düşünmeye yönelten nedir? |
| 2 | Yaklaşık beş yıl önce üst dişlerimin çoğunu kaybettim | Üst dişlerinizin çoğu olmadan beş yıl geçirmek kolay olmamış olabilir. Bu süre sizin için nasıl geçti? |
| 3 | Fiyat ne kadar? | İmplant tedavisinin fiyatını ekibimiz, durumunuzu değerlendirdikten sonra netleştirebilir.<br><br>Doğru bir fiyat teklifi için dişlerinizin fotoğrafını buraya ekleyip adınızı ve ülke koduyla birlikte WhatsApp numaranızı paylaşır mısınız? |
| 4 | Tüm sürecin adımlarını tek tek anlatır mısınız? | Elbette. İmplant tedavimiz genellikle iki ziyaret ve arada bir iyileşme döneminden oluşur:<br><br>İlk ziyaret — 5 gün: İmplantlar yerleştirilir ve geçici protezler sağlanır.<br>İyileşme dönemi — 4 ay: İmplantların iyileşmesi beklenir.<br>İkinci ziyaret — 7 gün: Kaplamalar yapılır.<br><br>Diş kaybının üzerinden zaman geçtiğinde kemik yoğunluğu azalmış olabilir. Bu durumda implantların sağlamlığı için kemik grefti gerekebilir; sizin için gerekip gerekmediğini ekibimiz değerlendirecektir. |
| 5 (hesitation) | dürüst olmak gerekirse düşünmem ve eşimle konuşmam lazım | Elbette, eşinizle konuşup düşünmek için zaman ayırmanız çok doğal. İsterseniz dişlerinizin bir fotoğrafını WhatsApp üzerinden bizimle paylaşabilirsiniz; ekibimiz, bir karar verme zorunluluğunuz olmadan size bir ön değerlendirme iletebilir: +90 542 150 2222. |
| 6 | Mehmet | Memnun olduk Mehmet. Eşinizle konuşup düşünmeniz için elbette zaman ayırabilirsiniz; hazır olduğunuzda sorularınızı yanıtlamak için buradayız. |
| 7 | +90 532 444 5566 | Teşekkür ederiz Mehmet, numaranızı aldık. Tedavi için İstanbul’a ne zaman gelmeyi planlıyorsunuz? |

### Spanish (¿ inverted punctuation), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Hola, estoy considerando implantes dentales | ¡Hola! En TEST — Prof Clinic (automated runs) combinamos experiencia médica con atención personalizada para ayudar a nuestros pacientes a recuperar su sonrisa.<br><br>¿Qué te gustaría que cambiara para ti con los implantes dentales? |
| 2 | Perdí la mayoría de mis dientes superiores hace cinco años | Llevar cinco años sin la mayoría de los dientes superiores puede haber sido difícil. Gracias por contarnos.<br><br>¿Qué ha sido lo más complicado para ti durante este tiempo? |
| 3 | ¿Cuánto cuesta? | Nuestro equipo tendrá que confirmar el precio según tu caso. Para darte un presupuesto preciso, ¿puedes adjuntar aquí una foto de tu boca y dejarnos tu nombre y número de WhatsApp completo con código de país, para que podamos contactarte desde el extranjero? |
| 4 | ¿Me explicas paso a paso todo el proceso? | Claro. Para los implantes dentales, nuestro proceso suele dividirse en dos visitas:<br><br>Primera visita: 5 días. Colocamos los implantes y proporcionamos prótesis temporales.<br>Cicatrización: 4 meses. Se deja tiempo para que los implantes cicatricen.<br>Segunda visita: 7 días. Colocamos las coronas.<br><br>Como perdiste los dientes hace cinco años, será importante que nuestro equipo evalúe el hueso: si ha perdido demasiada densidad, podría ser necesario un injerto óseo. El equipo podrá confirmar el plan adecuado para ti. |
| 5 (hesitation) | sinceramente necesito pensarlo y hablarlo con mi mujer | Claro, tómate el tiempo que necesites para hablarlo con tu mujer. Si te sirve, puedes compartirnos una foto de tu boca y tu WhatsApp completo con código de país para que nuestro equipo te prepare una valoración sin compromiso y te la haga llegar cuando estés listo. |
| 6 | Carlos | Gracias por compartir tu nombre, Carlos. Tómate el tiempo que necesites para hablarlo con tu mujer; aquí estaremos si después quieres preguntar algo más. |
| 7 | +34 612 345 678 | Gracias, Carlos. ¿En qué fechas o mes estás pensando venir a Estambul para comenzar el tratamiento? |
