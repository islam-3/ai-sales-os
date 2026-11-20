# Reply provider: Sonnet vs gpt-6.1-terra, 2026-11-20

Six smoke-test conversations × 2 runs per arm, on test-clinic. Only the reply model differs.

| Metric | gpt-6.1-terra run 1 | gpt-6.1-terra run 2 | gpt-6.1-terra all |
|---|---|---|---|
| Hard failures (smoke checks) | 0 in 0/6 conv. | 0 in 0/6 conv. | 0 in 0/12 conv. |
| Leads with name and number | 6/6 (100%) | 6/6 (100%) | 12/12 (100%) |
| Replies in the wrong script | 0/42 (0%) | 0/42 (0%) | 0/84 (0%) |
| Dialect introduced (judge) | 0/42 (0%) | 1/42 (2%) | 1/84 (1%) |
| Overloaded replies (density) | 1/42 (2%) | 2/42 (5%) | 3/84 (4%) |
| Mean units per reply | 2.55 | 2.67 | 2.61 |
| Mean words per reply | 36 | 36 | 36 |
| Consecutive replies, same shape | 7/36 (19%) | 7/36 (19%) | 14/72 (19%) |
| Hesitation reply / longest earlier | 0.53 mean; over 0.6: 1/6 (17%) | 0.56 mean; over 0.6: 1/6 (17%) | 0.54 mean; over 0.6: 2/12 (17%) |
| Measured cost per conversation | $0.0201 | $0.0161 | $0.0181 |

Reply model recorded per conversation matches its arm: yes, all.

Dialect markers flagged for gpt-6.1-terra: apartment

## Transcripts, side by side

### English (Latin baseline), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hi, we're looking to buy an apartment in Istanbul | Hi! At TEST — Bosphorus Key Realty (automated runs), our team helps international buyers find homes across both sides of Istanbul, with viewings in person or by video.<br><br>What’s prompting your move to Istanbul? |
| 2 | we're relocating from London next year with two kids, so probably 3 bedrooms | That’s a big move for the whole family. A three-bedroom apartment sounds like a good starting point.<br><br>What are you hoping life in Istanbul will be like for you and the kids? |
| 3 | what would something like that cost? | Prices depend on the area and size: Beşiktaş and Şişli start from about USD 4,500 per m², Kadıköy from about USD 3,500 per m², and Başakşehir and Beylikdüzü from about USD 1,800 per m². For an accurate quote, could you briefly share what you need, your name and your WhatsApp number in full international format with country code, so our team can reach you from abroad? |
| 4 | how does buying work for a foreigner, step by step? | For a foreign buyer, the process is:<br><br>Choose a home and sign a reservation agreement with a 5% deposit.<br>Get a Turkish tax number and bank account; we take you to both.<br>Obtain the required government appraisal report.<br>Arrange DASK earthquake insurance before transfer.<br>Transfer the title deed, or tapu, at the Land Registry—usually 2–4 weeks after reservation. |
| 5 (hesitation) | honestly we need to think about it and talk it over as a family first | Of course—take the time you need to talk it over as a family. If you’d like, you can leave us your WhatsApp number with the country code, and our team can follow up whenever you’re ready. |
| 6 | Emma | Thanks, Emma. Take all the time you need to talk it over with your family. We’re here if any questions come up. |
| 7 | +44 7700 900456 | Thanks, Emma. Knowing how long you can stay in Istanbul on each visit helps us plan what you could realistically complete in one trip.<br><br>How many days would you be able to stay each time? |

### Arabic (right-to-left, ؟), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | مرحبا، أبحث عن شقة للشراء في إسطنبول | مرحباً! في TEST — Bosphorus Key Realty (automated runs)، نساعد المشترين الدوليين في العثور على شقق في إسطنبول، ونرتّب المعاينات حضورياً أو عبر الفيديو.<br><br>ما الذي تأمل أن تجده في شقتك الجديدة؟ |
| 2 | أريد شقة ثلاث غرف قريبة من البحر، للسكن مع عائلتي | شقة بثلاث غرف قرب البحر تبدو مناسبة لحياة عائلية هادئة. نساعد المشترين في مناطق مثل ساريير المطلة على البوسفور، وكاديكوي على الجانب الآسيوي. |
| 3 | كم الأسعار تقريباً؟ | تبدأ الأسعار تقريباً من ٣٬٥٠٠ دولار للمتر المربع في كاديكوي، ومن ٦٬٠٠٠ دولار للمتر المربع في ساريير.<br><br>ليقدّم لك فريقنا عرضاً دقيقاً، هل يمكنك أن تخبرنا باختصار عن ميزانيتك والمنطقة المفضلة، وتترك اسمك ورقم واتساب هنا في المحادثة بصيغته الدولية مع رمز الدولة حتى يتمكن الفريق من التواصل معك من الخارج؟ |
| 4 | ممكن تشرح لي خطوات الشراء للأجانب؟ | بالتأكيد. بعد اختيار الشقة، توقّع اتفاقية حجز وتدفع عربوناً بنسبة ٥٪. ثم تحصل على رقم ضريبي تركي وحساب بنكي، ونرافقك لإتمامهما.<br><br>يُطلب تقرير تقييم حكومي للمشتري الأجنبي، ويُرتّب تأمين الزلازل DASK قبل نقل سند الملكية (الطابو) في دائرة السجل العقاري. وعادةً يتم نقل الطابو خلال أسبوعين إلى أربعة أسابيع من الحجز. |
| 5 (hesitation) | بصراحة أحتاج أفكر وأتكلم مع زوجتي أولاً | بالتأكيد، خذ وقتك وتحدث مع زوجتك براحتك. وإذا أحببت، يمكنك ترك رقم واتساب لنشاركك خيارات مبدئية عندما تكون مستعداً، دون أي التزام. |
| 6 | عمر | تشرفنا يا عمر. خذ وقتك في التفكير والتحدث مع زوجتك، ونحن هنا متى أحببت أن تواصل الحديث. |
| 7 | +966 55 123 4567 | شكراً يا عمر، وصلنا رقمك. كم من الوقت تستطيع البقاء في إسطنبول في كل زيارة؟ |

### Russian (Cyrillic), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Здравствуйте, хочу купить квартиру в Стамбуле | Здравствуйте! В TEST — Bosphorus Key Realty (automated runs) мы помогаем иностранным покупателям найти квартиру в Стамбуле и организуем просмотры лично или по видеосвязи.<br><br>Что для вас важнее всего при выборе квартиры? |
| 2 | Ищу двухкомнатную с видом на Босфор, для себя и как инвестицию | Понимаем: хочется, чтобы квартира была приятным местом для жизни и при этом подходила для инвестиций. В Сарыере есть квартиры с видом на Босфор; цены в этом районе начинаются примерно от 6 000 долларов США за м². |
| 3 | Сколько это примерно стоит? | В Сарыере цены начинаются примерно от 6 000 долларов США за м²; стоимость конкретной двухкомнатной квартиры с видом на Босфор наша команда уточнит.<br><br>Для точного расчёта не могли бы вы кратко написать желаемую площадь и бюджет, а также оставить здесь в чате своё имя и номер WhatsApp в полном международном формате с кодом страны, чтобы команда могла связаться с вами? |
| 4 | Объясните, пожалуйста, как проходит покупка для иностранца? | Иностранец выбирает квартиру и подписывает соглашение о резервировании с депозитом 5%. Затем мы сопровождаем покупателя для получения турецкого налогового номера и открытия банковского счёта.<br><br>Для покупки потребуется государственный отчёт об оценке недвижимости и страховка DASK от землетрясений. Право собственности оформляется в Земельном кадастре: передача тапу обычно занимает 2–4 недели с момента резервирования. |
| 5 (hesitation) | Честно говоря, мне нужно подумать и посоветоваться с мужем | Конечно, спокойно обсудите всё с мужем. Если будет удобно, можете написать нам в WhatsApp на +90 212 555 01 47 — команда подготовит примерный расчёт стоимости без каких-либо обязательств. |
| 6 | Анна | Приятно познакомиться, Анна. Конечно, обсудите всё с мужем в удобном для вас темпе. Если позже появятся вопросы, мы будем рады помочь. |
| 7 | +7 916 123 4567 | Спасибо, Анна. Сколько дней вы сможете провести в Стамбуле во время каждого приезда? |

### Chinese (no spaces between words), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | 你好，我想在伊斯坦布尔买房 | 你好！在 TEST — Bosphorus Key Realty (automated runs)，我们可以安排实地或视频看房，也会协助买家办理房产证和居留许可手续。<br><br>你希望在伊斯坦布尔买房后，生活有什么不同？ |
| 2 | 想买一套两居室，主要是投资，也在考虑入籍 | 明白，你希望买一套两居室作为投资，同时也在考虑土耳其入籍。<br><br>按目前提供的信息，投资入籍要求房产价值至少为40万美元，并持有3年；取得房产证后，申请约需6–9个月。我们的合作律所 Aydın & Partners 会协助办理申请。 |
| 3 | 大概多少钱？ | 两居室总价取决于区域和面积。例如，亚洲一侧的卡德柯伊约从每平方米3,500美元起；如果考虑入籍，房产价值需至少40万美元，并持有3年。<br><br>为了让团队准确报价，方便简要说说你的需求，并在这里留下姓名和 WhatsApp 号码吗？ |
| 4 | 外国人买房的流程是怎样的？ | 外国人买房通常是这样的：<br><br>选定房源后，签署预订协议并支付5%定金。<br>办理土耳其税号和银行账户，我们会陪同办理。<br>取得外国买家必须办理的政府估价报告，并在过户前办理 DASK 地震保险。<br>在土地登记处办理房产证（tapu）过户，通常在预订后2–4周完成。 |
| 5 (hesitation) | 说实话我需要考虑一下，还要和太太商量 | 当然，买房是大事，和太太慢慢商量就好。<br><br>如果方便，可以留下你的 WhatsApp 号码，我们的团队可以整理一份两居室投资和入籍条件的简要说明，等你们准备好时参考；完全没有义务。号码请包含国家区号，方便团队从国外联系你。 |
| 6 | 李明 | 李先生，明白了，您先和太太慢慢商量。等您准备好时，随时可以在这里联系我们。 |
| 7 | +86 139 1234 5678 | 谢谢李先生，已记下您的联系方式。看房行程通常需要2–3天，而房产证过户通常在预订后2–4周完成；了解您每次能停留多久，有助于我们安排每趟能实际完成的事项。<br><br>您每次来伊斯坦布尔大约能停留几天？ |

### Turkish (dotted/dotless i), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | merhaba, İstanbul'da daire bakıyorum | Merhaba! TEST — Bosphorus Key Realty (automated runs) olarak İstanbul’da daire arayan alıcı ve kiracılara yardımcı oluyor, yüz yüze veya canlı video ile ev gezileri düzenliyoruz.<br><br>Sizin için nasıl bir daire ideal olurdu? |
| 2 | Almanya'da yaşıyorum, emeklilik için deniz manzaralı bir yer istiyorum | Emekliliğinizi deniz manzaralı bir evde geçirmek güzel bir düşünce. Sarıyer’de Boğaz manzaralı daireler metrekare başına yaklaşık 6.000 USD’den başlıyor.<br><br>Emeklilikte İstanbul’da nasıl bir yaşam hayal ediyorsunuz? |
| 3 | fiyatlar ne kadar? | Deniz manzarası için bakabileceğiniz Sarıyer’de fiyatlar metrekare başına yaklaşık 6.000 USD’den başlıyor. Size daha net bir fiyat sunabilmemiz için aradığınız daireyi kısaca yazıp adınızı ve WhatsApp numaranızı ülke koduyla birlikte burada paylaşır mısınız? |
| 4 | satın alma süreci nasıl işliyor, adım adım anlatır mısınız? | Tabii, satın alma süreci genel olarak şöyle ilerliyor:<br><br>Daireyi seçip %5 kapora ile rezervasyon sözleşmesini imzalarsınız.<br>Vergi numarası alır ve banka hesabı açarsınız; ekibimiz her ikisinde de size eşlik eder.<br>Yabancı alıcılar için gerekli olan devlet ekspertiz raporu alınır.<br>Tapu devrinden önce DASK deprem sigortası yaptırılır.<br>Tapu devri, genellikle rezervasyondan 2–4 hafta sonra Tapu Müdürlüğü’nde gerçekleşir. |
| 5 (hesitation) | açıkçası biraz düşünmem ve eşimle konuşmam lazım | Elbette, eşinizle rahatça değerlendirin. İsterseniz WhatsApp üzerinden bize bir mesaj bırakabilirsiniz; hazır olduğunuzda ekibimiz size örnek daire seçenekleri konusunda yardımcı olur. |
| 6 | Ayşe | Memnun olduk Ayşe Hanım. Eşinizle konuşup değerlendirmek için ihtiyacınız olan zamanı ayırın; hazır olduğunuzda buradan yazabilirsiniz. |
| 7 | +49 151 2345 6789 | Teşekkür ederiz Ayşe Hanım. İstanbul’a her gelişinizde ne kadar süre kalabilirsiniz? |

### Spanish (¿ inverted punctuation), run 1

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hola, estoy buscando un piso en Estambul | ¡Hola! En TEST — Bosphorus Key Realty (automated runs) ayudamos a encontrar pisos en distintas zonas de Estambul y organizamos visitas en persona o por vídeo.<br><br>¿Buscas comprar o alquilar? |
| 2 | me mudo por trabajo y busco alquilar algo de dos habitaciones cerca de Levent | Mudarte por trabajo es un cambio importante. Buscas un piso de dos habitaciones cerca de Levent; nuestro equipo tiene oficinas en esa zona. |
| 3 | ¿cuánto cuesta el alquiler? | Nuestro equipo tendrá que confirmar el alquiler de un piso de dos habitaciones cerca de Levent. La fianza es de uno a dos meses de alquiler y nuestros honorarios son de un mes.<br><br>Para darte una cifra precisa, ¿puedes contarnos brevemente qué necesitas y dejarnos aquí tu nombre y tu número de WhatsApp completo con el código de país, para que el equipo pueda contactarte desde el extranjero? |
| 4 | ¿cómo funciona el proceso para alquilar siendo extranjero? | Para alquilar con nosotros, el contrato es de al menos 12 meses, la fianza es de uno a dos meses de alquiler y nuestros honorarios son de un mes. Nuestro equipo tendrá que confirmar los requisitos y la documentación para alquilar siendo extranjero. |
| 5 (hesitation) | sinceramente necesito pensarlo y hablarlo con mi pareja | Por supuesto, habladlo con calma. Si os viene bien, podéis dejarnos vuestro WhatsApp completo, con el código de país, y el equipo podrá prepararos una orientación sin compromiso para cuando estéis listos. |
| 6 | Lucía | Gracias, Lucía. Habladlo con calma; estaremos aquí si os surge alguna pregunta. |
| 7 | +34 612 345 678 | Gracias, Lucía. ¿Cuánto tiempo podrás quedarte en Estambul en cada visita? |

### English (Latin baseline), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hi, we're looking to buy an apartment in Istanbul | Hi! At TEST — Bosphorus Key Realty (automated runs), we help international buyers find apartments across Istanbul and can arrange viewings in person or by live video.<br><br>What’s drawing you to Istanbul? |
| 2 | we're relocating from London next year with two kids, so probably 3 bedrooms | That sounds like a big move for your family. A three-bedroom apartment would give you all room to settle in.<br><br>What are you hoping family life in Istanbul will look like? |
| 3 | what would something like that cost? | Prices vary by area: Kadıköy starts at about USD 3,500 per m², while Beşiktaş and Şişli start at about USD 4,500 per m². For an accurate quote, could you briefly share what you need, your name, and your WhatsApp number in full international format with the country code so our team can reach you from abroad? |
| 4 | how does buying work for a foreigner, step by step? | Once you choose an apartment, we start with a reservation agreement and a 5% deposit. We then take you to get a Turkish tax number and open a bank account.<br><br>A government appraisal is required, and DASK earthquake insurance is arranged before the title deed (tapu) is transferred at the Land Registry. That transfer usually takes 2–4 weeks from reservation. |
| 5 (hesitation) | honestly we need to think about it and talk it over as a family first | Of course, take the time you need to talk it over as a family. If it would help later, you’re welcome to message us on WhatsApp at +90 212 555 01 47, and our team can help you explore options with no obligation. |
| 6 | Emma | Thanks, Emma. Take all the time you and your family need—we’re here if you have questions later. |
| 7 | +44 7700 900456 | Thanks, Emma. The time you have in Istanbul will shape how many viewings and buying steps we can realistically plan for each trip. How long would you be able to stay on each visit? |

### Arabic (right-to-left, ؟), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | مرحبا، أبحث عن شقة للشراء في إسطنبول | أهلًا بك! في TEST — Bosphorus Key Realty (automated runs)، نساعد المشترين الدوليين في العثور على شقق في إسطنبول، ويمكننا ترتيب المعاينات حضوريًا أو عبر الفيديو.<br><br>ما الذي تأمل أن تجده في شقتك الجديدة؟ |
| 2 | أريد شقة ثلاث غرف قريبة من البحر، للسكن مع عائلتي | شقة قريبة من البحر للعائلة تبدو خيارًا جميلًا. نغطي ساريير، حيث توجد إطلالات على البوسفور وتبدأ الأسعار من نحو 6,000 دولار للمتر المربع. |
| 3 | كم الأسعار تقريباً؟ | تختلف الأسعار حسب المنطقة: تبدأ في كاديكوي بالجانب الآسيوي من نحو 3,500 دولار للمتر المربع، وفي ساريير من نحو 6,000 دولار للمتر المربع.<br><br>لنعطيك سعرًا أدق، هل تذكر لنا باختصار احتياجاتك المتبقية، وتترك اسمك ورقم واتساب هنا في المحادثة؟ |
| 4 | ممكن تشرح لي خطوات الشراء للأجانب؟ | بالتأكيد. بعد اختيار الشقة، نوقّع اتفاقية حجز مع دفعة مقدّمة قدرها 5%. ثم نرافقك لاستخراج رقم ضريبي تركي وفتح حساب بنكي، ويُطلب تقرير تقييم حكومي للمشتري الأجنبي.<br><br>نرتّب تأمين الزلازل الإلزامي DASK قبل نقل سند الملكية (الطابو) في دائرة السجل العقاري، وعادةً يتم النقل خلال 2–4 أسابيع من الحجز. |
| 5 (hesitation) | بصراحة أحتاج أفكر وأتكلم مع زوجتي أولاً | بالتأكيد، خذا وقتكما في التفكير. إذا أحببتما، يمكنك مراسلتنا على واتساب +90 212 555 01 47 لنعدّ لكما تقديرًا مبدئيًا للتكاليف، دون أي التزام. |
| 6 | عمر | تشرفنا يا عمر. خذا وقتكما في التفكير، ونحن هنا إذا احتجتما إلى أي توضيح. |
| 7 | +966 55 123 4567 | كم تستطيع البقاء في إسطنبول خلال كل زيارة؟ |

### Russian (Cyrillic), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | Здравствуйте, хочу купить квартиру в Стамбуле | Здравствуйте! В TEST — Bosphorus Key Realty (automated runs) мы помогаем иностранным покупателям найти квартиру в Стамбуле и сопровождаем оформление права собственности.<br><br>Что для вас важнее всего в будущей квартире? |
| 2 | Ищу двухкомнатную с видом на Босфор, для себя и как инвестицию | Понимаем: хочется, чтобы квартира была и местом для жизни, и удачным вложением. В Сарыере есть варианты с видом на Босфор; цены там начинаются примерно от 6 000 долларов США за м². |
| 3 | Сколько это примерно стоит? | В Сарыере квартиры с видом на Босфор стоят примерно от 6 000 долларов США за м²; итоговая цена зависит от площади и конкретного объекта.<br><br>Чтобы наша команда точнее сориентировала вас по стоимости, не могли бы вы коротко указать желаемую площадь, ваше имя и номер WhatsApp с кодом страны? |
| 4 | Объясните, пожалуйста, как проходит покупка для иностранца? | После выбора квартиры мы подписываем соглашение о резервировании с депозитом 5%. Затем помогаем получить турецкий налоговый номер и открыть банковский счёт. Для иностранного покупателя также требуется государственный оценочный отчёт.<br><br>До передачи права собственности оформляется страховка DASK от землетрясения. Само оформление тапу проходит в Земельном кадастре, обычно через 2–4 недели после резервирования. |
| 5 (hesitation) | Честно говоря, мне нужно подумать и посоветоваться с мужем | Конечно, спокойно всё обдумайте и посоветуйтесь с мужем. Если вам будет удобно, можете оставить номер WhatsApp с кодом страны — наша команда подготовит примерный расчёт стоимости, без каких-либо обязательств. |
| 6 | Анна | Анна, приятно познакомиться. Конечно, обсудите всё с мужем в удобном для вас темпе. Если позже возникнут вопросы, мы будем рады помочь. |
| 7 | +7 916 123 4567 | Спасибо, Анна. На сколько дней вы сможете приезжать в Стамбул во время каждой поездки? Это поможет нам понять, что можно успеть за один визит. |

### Chinese (no spaces between words), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | 你好，我想在伊斯坦布尔买房 | 你好！我们在伊斯坦布尔的欧洲区和亚洲区都帮助国际买家寻找公寓和别墅，也可以通过视频看房。<br><br>你希望买房主要是自住，还是投资呢？ |
| 2 | 想买一套两居室，主要是投资，也在考虑入籍 | 明白，你希望买一套两居室用于投资，同时也在考虑土耳其入籍。<br><br>按目前的置业入籍要求，房产价值至少为40万美元，并需持有3年；取得房产证后，申请通常需要约6至9个月。我们与合作律所 Aydın & Partners 一起处理入籍申请。 |
| 3 | 大概多少钱？ | 两居室的价格会因区域和房屋面积而不同：亚洲侧的卡德柯伊约从每平方米3,500美元起，贝西克塔什和希什利约从每平方米4,500美元起。如果考虑通过购房入籍，房产价值需至少40万美元。<br><br>为了让团队给你准确报价，可以简要说说你希望的区域和预算，并在这里留下姓名和WhatsApp号码吗？ |
| 4 | 外国人买房的流程是怎样的？ | 外国人购房通常按以下流程进行：<br><br>选定房源后，签署预订协议并支付5%的定金。<br>办理土耳其税号和银行账户，我们会陪同办理。<br>取得外国买家所需的政府房产评估报告，并在过户前办理DASK地震保险。<br>在土地登记处完成房产证（tapu）过户，通常从预订起需要2至4周。 |
| 5 (hesitation) | 说实话我需要考虑一下，还要和太太商量 | 当然，买房是大事，和太太慢慢商量。你们准备好时，可以通过 WhatsApp +90 212 555 01 47 给我们发条消息，我们可以帮你们整理一份符合预算的房源参考，不需要做任何承诺。 |
| 6 | 李明 | 李先生，谢谢您告诉我们。您和太太可以慢慢商量，之后有任何问题都欢迎随时联系我们。 |
| 7 | +86 139 1234 5678 | 谢谢，李先生，我们已收到您的号码。<br><br>您每次来伊斯坦布尔能停留的时间，会影响我们能在一次行程中安排多少看房和购房手续。您通常每次能待几天？ |

### Turkish (dotted/dotless i), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | merhaba, İstanbul'da daire bakıyorum | Merhaba! TEST — Bosphorus Key Realty (automated runs) olarak İstanbul’un hem Avrupa hem de Anadolu yakasında daire arayan müşterilerimize yardımcı oluyor, yüz yüze veya canlı video ile gösterimler düzenliyoruz.<br><br>Daireyi satın almak için mi, kiralamak için mi arıyorsunuz? |
| 2 | Almanya'da yaşıyorum, emeklilik için deniz manzaralı bir yer istiyorum | Emekliliğinizi deniz manzaralı bir evde geçirmek güzel bir düşünce. Sarıyer’de Boğaz manzaralı daireler bulunuyor; fiyatlar metrekare başına yaklaşık 6.000 ABD dolarından başlıyor.<br><br>İstanbul’da emeklilik hayatınızın nasıl olmasını hayal ediyorsunuz? |
| 3 | fiyatlar ne kadar? | Sarıyer’de Boğaz manzaralı dairelerin fiyatları metrekare başına yaklaşık 6.000 ABD dolarından başlıyor. Daha net bir fiyat için ne aradığınızı kısaca, adınızı ve WhatsApp numaranızı ülke koduyla birlikte buraya yazar mısınız? Ekibimiz yurt dışından aradığı için ülke koduna ihtiyaç duyuyor. |
| 4 | satın alma süreci nasıl işliyor, adım adım anlatır mısınız? | Satın alma süreci şöyle ilerliyor:<br><br>Daireyi seçiyorsunuz ve %5 depozito ile rezervasyon sözleşmesini imzalıyorsunuz.<br>Türk vergi numarası ve banka hesabı alıyorsunuz; her ikisi için de size eşlik ediyoruz.<br>Yabancı alıcılar için gerekli olan devlet ekspertiz raporu hazırlanıyor.<br>Tapu devrinden önce DASK deprem sigortası düzenleniyor.<br>Tapu, Tapu Müdürlüğü’nde devrediliyor. Bu aşama genellikle rezervasyondan 2–4 hafta sonra gerçekleşiyor. |
| 5 (hesitation) | açıkçası biraz düşünmem ve eşimle konuşmam lazım | Elbette, eşinizle rahatça değerlendirin. İsterseniz size uygun olabilecek seçenekler için ekibimizin bağlayıcı olmayan bir ön değerlendirme hazırlaması amacıyla WhatsApp numaranızı ülke koduyla paylaşabilirsiniz; ekibimiz yurt dışından aradığı için bu gerekli. |
| 6 | Ayşe | Memnun olduk Ayşe Hanım. Eşinizle konuşup değerlendirmek için elbette zaman ayırabilirsiniz; aklınıza bir soru gelirse buradayız. |
| 7 | +49 151 2345 6789 | Teşekkür ederiz Ayşe Hanım. İstanbul’a her gelişinizde ne kadar süre kalabiliyorsunuz? |

### Spanish (¿ inverted punctuation), run 2

| # | Visitor | gpt-6.1-terra |
|---|---|---|
| 1 | hola, estoy buscando un piso en Estambul | ¡Hola! En TEST — Bosphorus Key Realty (automated runs) ayudamos a encontrar pisos en Estambul y organizamos visitas tanto en persona como por vídeo.<br><br>¿Buscas comprar o alquilar? |
| 2 | me mudo por trabajo y busco alquilar algo de dos habitaciones cerca de Levent | Una mudanza por trabajo trae muchos cambios; un piso de dos habitaciones cerca de Levent puede ayudarte a instalarte con comodidad. Tenemos nuestra oficina en Levent, así que nuestro equipo puede ayudarte con la búsqueda. |
| 3 | ¿cuánto cuesta el alquiler? | Nuestro equipo tendrá que confirmar el alquiler de un piso de dos habitaciones cerca de Levent. El depósito es de uno a dos meses de alquiler y nuestros honorarios equivalen a un mes.<br><br>Para darte una cifra precisa, necesitamos algunos detalles: ¿puedes contarnos brevemente qué necesitas y dejarnos aquí tu nombre y tu número de WhatsApp con el código de país? Nuestro equipo llama desde el extranjero. |
| 4 | ¿cómo funciona el proceso para alquilar siendo extranjero? | Nuestros contratos de alquiler son de al menos 12 meses. El depósito es de uno a dos meses de alquiler y nuestros honorarios equivalen a un mes.<br><br>Nuestro equipo tendrá que confirmar los documentos y los pasos específicos para alquilar como extranjero. |
| 5 (hesitation) | sinceramente necesito pensarlo y hablarlo con mi pareja | Claro, habladlo con calma. Si os viene bien, podéis dejarnos un número de WhatsApp con el código de país y nuestro equipo podrá confirmar los requisitos para extranjeros cuando estéis preparados, sin compromiso. |
| 6 | Lucía | Encantados, Lucía. Tomaros el tiempo que necesitéis; si después os surge alguna duda, aquí estamos. |
| 7 | +34 612 345 678 | Gracias, Lucía. ¿Cuánto tiempo podrías quedarte en Estambul en cada visita? |
