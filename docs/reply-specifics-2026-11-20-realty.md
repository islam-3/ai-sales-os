# Reply specifics and early handoff, 2026-11-20

Sonnet: the 12 production smoke conversations of 2026-11-17 and 2026-11-18. gpt-6.1-terra: docs/reply-provider-2026-11-20-realty.sessions.json.

Fact vocabulary from test-clinic's own material: 26 numbers (2012, 14, 1200, 40, 2000, 4500, 6000, 3500, 1800, 8000, 8, 5, 2, 4, 50, 300, 150, 400000, 3, 6, 9, 200000, 1, 12, 10, 36), 17 names (Sar, European, Kad, Asian, English, Arabic, Russian, Turkish, Levent, USD, Beylikd, Land, Registry, VAT, Ayd, Monday, Saturday).

| Arm | Visitor language | Conversations | First reply carries a fact | Price reply carries a fact | Process reply carries a fact | Distinct facts per conversation | Names a brand or programme | Early handoffs (replies 1-2) |
|---|---|---|---|---|---|---|---|---|
| gpt-6.1-terra | English | 2 | 0/2 (0%) | 2/2 | 2/2 | 11.0 | 2/2 | 0 |
| gpt-6.1-terra | Arabic | 2 | 0/2 (0%) | 2/2 | 2/2 | 4.0 | 0/2 | 0 |
| gpt-6.1-terra | Russian | 2 | 0/2 (0%) | 2/2 | 2/2 | 4.0 | 0/2 | 0 |
| gpt-6.1-terra | Chinese | 2 | 0/2 (0%) | 2/2 | 2/2 | 9.5 | 2/2 | 0 |
| gpt-6.1-terra | Turkish | 2 | 0/2 (0%) | 2/2 | 2/2 | 5.0 | 1/2 | 0 |
| gpt-6.1-terra | Spanish | 2 | 0/2 (0%) | 0/2 | 2/2 | 1.0 | 0/2 | 0 |
| **gpt-6.1-terra** | **all** | 12 | 0/12 (0%) | 10/12 | 12/12 | 5.8 | 5/12 | 0 |

## Against the bars

- gpt-6.1-terra: distinct business facts per conversation 5.8 (bar 2.0) → ok
- gpt-6.1-terra: process reply carries a fact 12/12 (bar 10/12) → ok
- gpt-6.1-terra: early handoffs in replies 1-2: 0 (bar 0) → ok
- **gpt-6.1-terra: PASS** (overloaded replies: see measure-reply-provider's report)

## Price and process replies, side by side

Sonnet: production smoke runs of 2026-11-17 (run 1) and 2026-11-18 (run 2). Facts offered: what the state block handed the OpenAI reply that turn.

### English

| Run | Reply | Sonnet | gpt-6.1-terra | Facts offered |
|---|---|---|---|---|
| 1 | price |  | Prices depend on the area and size: Beşiktaş and Şişli start from about USD 4,500 per m², Kadıköy from about USD 3,500 per m², and Başakşehir and Beylikdüzü from about USD 1,800 per m². For an accurate quote, could you briefly share what you need, your name and your WhatsApp number in full international format with country code, so our team can reach you from abroad? | none |
| 1 | process |  | For a foreign buyer, the process is: Choose a home and sign a reservation agreement with a 5% deposit. Get a Turkish tax number and bank account; we take you to both. Obtain the required government appraisal report. Arrange DASK earthquake insurance before transfer. Transfer the title deed, or tapu, at the Land Registry—usually 2–4 weeks after reservation. | Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |
| 2 | price |  | Prices vary by area: Kadıköy starts at about USD 3,500 per m², while Beşiktaş and Şişli start at about USD 4,500 per m². For an accurate quote, could you briefly share what you need, your name, and your WhatsApp number in full international format with the country code so our team can reach you from abroad? | none |
| 2 | process |  | Once you choose an apartment, we start with a reservation agreement and a 5% deposit. We then take you to get a Turkish tax number and open a bank account. A government appraisal is required, and DASK earthquake insurance is arranged before the title deed (tapu) is transferred at the Land Registry. That transfer usually takes 2–4 weeks from reservation. | Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |

### Arabic

| Run | Reply | Sonnet | gpt-6.1-terra | Facts offered |
|---|---|---|---|---|
| 1 | price |  | تبدأ الأسعار تقريباً من ٣٬٥٠٠ دولار للمتر المربع في كاديكوي، ومن ٦٬٠٠٠ دولار للمتر المربع في ساريير. ليقدّم لك فريقنا عرضاً دقيقاً، هل يمكنك أن تخبرنا باختصار عن ميزانيتك والمنطقة المفضلة، وتترك اسمك ورقم واتساب هنا في المحادثة بصيغته الدولية مع رمز الدولة حتى يتمكن الفريق من التواصل معك من الخارج؟ | none |
| 1 | process |  | بالتأكيد. بعد اختيار الشقة، توقّع اتفاقية حجز وتدفع عربوناً بنسبة ٥٪. ثم تحصل على رقم ضريبي تركي وحساب بنكي، ونرافقك لإتمامهما. يُطلب تقرير تقييم حكومي للمشتري الأجنبي، ويُرتّب تأمين الزلازل DASK قبل نقل سند الملكية (الطابو) في دائرة السجل العقاري. وعادةً يتم نقل الطابو خلال أسبوعين إلى أربعة أسابيع من الحجز. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |
| 2 | price |  | تختلف الأسعار حسب المنطقة: تبدأ في كاديكوي بالجانب الآسيوي من نحو 3,500 دولار للمتر المربع، وفي ساريير من نحو 6,000 دولار للمتر المربع. لنعطيك سعرًا أدق، هل تذكر لنا باختصار احتياجاتك المتبقية، وتترك اسمك ورقم واتساب هنا في المحادثة؟ | none |
| 2 | process |  | بالتأكيد. بعد اختيار الشقة، نوقّع اتفاقية حجز مع دفعة مقدّمة قدرها 5%. ثم نرافقك لاستخراج رقم ضريبي تركي وفتح حساب بنكي، ويُطلب تقرير تقييم حكومي للمشتري الأجنبي. نرتّب تأمين الزلازل الإلزامي DASK قبل نقل سند الملكية (الطابو) في دائرة السجل العقاري، وعادةً يتم النقل خلال 2–4 أسابيع من الحجز. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |

### Russian

| Run | Reply | Sonnet | gpt-6.1-terra | Facts offered |
|---|---|---|---|---|
| 1 | price |  | В Сарыере цены начинаются примерно от 6 000 долларов США за м²; стоимость конкретной двухкомнатной квартиры с видом на Босфор наша команда уточнит. Для точного расчёта не могли бы вы кратко написать желаемую площадь и бюджет, а также оставить здесь в чате своё имя и номер WhatsApp в полном международном формате с кодом страны, чтобы команда могла связаться с вами? | none |
| 1 | process |  | Иностранец выбирает квартиру и подписывает соглашение о резервировании с депозитом 5%. Затем мы сопровождаем покупателя для получения турецкого налогового номера и открытия банковского счёта. Для покупки потребуется государственный отчёт об оценке недвижимости и страховка DASK от землетрясений. Право собственности оформляется в Земельном кадастре: передача тапу обычно занимает 2–4 недели с момента резервирования. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |
| 2 | price |  | В Сарыере квартиры с видом на Босфор стоят примерно от 6 000 долларов США за м²; итоговая цена зависит от площади и конкретного объекта. Чтобы наша команда точнее сориентировала вас по стоимости, не могли бы вы коротко указать желаемую площадь, ваше имя и номер WhatsApp с кодом страны? | none |
| 2 | process |  | После выбора квартиры мы подписываем соглашение о резервировании с депозитом 5%. Затем помогаем получить турецкий налоговый номер и открыть банковский счёт. Для иностранного покупателя также требуется государственный оценочный отчёт. До передачи права собственности оформляется страховка DASK от землетрясения. Само оформление тапу проходит в Земельном кадастре, обычно через 2–4 недели после резервирования. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |

### Chinese

| Run | Reply | Sonnet | gpt-6.1-terra | Facts offered |
|---|---|---|---|---|
| 1 | price |  | 两居室总价取决于区域和面积。例如，亚洲一侧的卡德柯伊约从每平方米3,500美元起；如果考虑入籍，房产价值需至少40万美元，并持有3年。 为了让团队准确报价，方便简要说说你的需求，并在这里留下姓名和 WhatsApp 号码吗？ | A home worth at least USD 200,000 in Istanbul qualifies the buyer for a short-term residence permit, renewed every 1–2 years. |
| 1 | process |  | 外国人买房通常是这样的： 选定房源后，签署预订协议并支付5%定金。 办理土耳其税号和银行账户，我们会陪同办理。 取得外国买家必须办理的政府估价报告，并在过户前办理 DASK 地震保险。 在土地登记处办理房产证（tapu）过户，通常在预订后2–4周完成。 | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |
| 2 | price |  | 两居室的价格会因区域和房屋面积而不同：亚洲侧的卡德柯伊约从每平方米3,500美元起，贝西克塔什和希什利约从每平方米4,500美元起。如果考虑通过购房入籍，房产价值需至少40万美元。 为了让团队给你准确报价，可以简要说说你希望的区域和预算，并在这里留下姓名和WhatsApp号码吗？ | A home worth at least USD 200,000 in Istanbul qualifies the buyer for a short-term residence permit, renewed every 1–2 years. |
| 2 | process |  | 外国人购房通常按以下流程进行： 选定房源后，签署预订协议并支付5%的定金。 办理土耳其税号和银行账户，我们会陪同办理。 取得外国买家所需的政府房产评估报告，并在过户前办理DASK地震保险。 在土地登记处完成房产证（tapu）过户，通常从预订起需要2至4周。 | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |

### Turkish

| Run | Reply | Sonnet | gpt-6.1-terra | Facts offered |
|---|---|---|---|---|
| 1 | price |  | Deniz manzarası için bakabileceğiniz Sarıyer’de fiyatlar metrekare başına yaklaşık 6.000 USD’den başlıyor. Size daha net bir fiyat sunabilmemiz için aradığınız daireyi kısaca yazıp adınızı ve WhatsApp numaranızı ülke koduyla birlikte burada paylaşır mısınız? | none |
| 1 | process |  | Tabii, satın alma süreci genel olarak şöyle ilerliyor: Daireyi seçip %5 kapora ile rezervasyon sözleşmesini imzalarsınız. Vergi numarası alır ve banka hesabı açarsınız; ekibimiz her ikisinde de size eşlik eder. Yabancı alıcılar için gerekli olan devlet ekspertiz raporu alınır. Tapu devrinden önce DASK deprem sigortası yaptırılır. Tapu devri, genellikle rezervasyondan 2–4 hafta sonra Tapu Müdürlüğü’nde gerçekleşir. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. |
| 2 | price |  | Sarıyer’de Boğaz manzaralı dairelerin fiyatları metrekare başına yaklaşık 6.000 ABD dolarından başlıyor. Daha net bir fiyat için ne aradığınızı kısaca, adınızı ve WhatsApp numaranızı ülke koduyla birlikte buraya yazar mısınız? Ekibimiz yurt dışından aradığı için ülke koduna ihtiyaç duyuyor. | none |
| 2 | process |  | Satın alma süreci şöyle ilerliyor: Daireyi seçiyorsunuz ve %5 depozito ile rezervasyon sözleşmesini imzalıyorsunuz. Türk vergi numarası ve banka hesabı alıyorsunuz; her ikisi için de size eşlik ediyoruz. Yabancı alıcılar için gerekli olan devlet ekspertiz raporu hazırlanıyor. Tapu devrinden önce DASK deprem sigortası düzenleniyor. Tapu, Tapu Müdürlüğü’nde devrediliyor. Bu aşama genellikle rezervasyondan 2–4 hafta sonra gerçekleşiyor. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. |

### Spanish

| Run | Reply | Sonnet | gpt-6.1-terra | Facts offered |
|---|---|---|---|---|
| 1 | price |  | Nuestro equipo tendrá que confirmar el alquiler de un piso de dos habitaciones cerca de Levent. La fianza es de uno a dos meses de alquiler y nuestros honorarios son de un mes. Para darte una cifra precisa, ¿puedes contarnos brevemente qué necesitas y dejarnos aquí tu nombre y tu número de WhatsApp completo con el código de país, para que el equipo pueda contactarte desde el extranjero? | none |
| 1 | process |  | Para alquilar con nosotros, el contrato es de al menos 12 meses, la fianza es de uno a dos meses de alquiler y nuestros honorarios son de un mes. Nuestro equipo tendrá que confirmar los requisitos y la documentación para alquilar siendo extranjero. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |
| 2 | price |  | Nuestro equipo tendrá que confirmar el alquiler de un piso de dos habitaciones cerca de Levent. El depósito es de uno a dos meses de alquiler y nuestros honorarios equivalen a un mes. Para darte una cifra precisa, necesitamos algunos detalles: ¿puedes contarnos brevemente qué necesitas y dejarnos aquí tu nombre y tu número de WhatsApp con el código de país? Nuestro equipo llama desde el extranjero. | none |
| 2 | process |  | Nuestros contratos de alquiler son de al menos 12 meses. El depósito es de uno a dos meses de alquiler y nuestros honorarios equivalen a un mes. Nuestro equipo tendrá que confirmar los documentos y los pasos específicos para alquilar como extranjero. | Sign a reservation agreement with a 5% deposit. The title deed (tapu) is transferred at the Land Registry, usually 2–4 weeks from reservation. ◆ Turkish banks lend to foreigners only up to about 50% of the value and at high rates, so most of our foreign buyers pay in full. |

## Early handoffs, quoted

None.

## First replies: every English one, and every one with no fact

- **gpt-6.1-terra** · English · facts [none] · Hi! At TEST — Bosphorus Key Realty (automated runs), our team helps international buyers find homes across both sides of Istanbul, with viewings in person or by video. What’s prompting your move to Istanbul?
- **gpt-6.1-terra** · Arabic · facts [none] · مرحباً! في TEST — Bosphorus Key Realty (automated runs)، نساعد المشترين الدوليين في العثور على شقق في إسطنبول، ونرتّب المعاينات حضورياً أو عبر الفيديو. ما الذي تأمل أن تجده في شقتك الجديدة؟
- **gpt-6.1-terra** · Russian · facts [none] · Здравствуйте! В TEST — Bosphorus Key Realty (automated runs) мы помогаем иностранным покупателям найти квартиру в Стамбуле и организуем просмотры лично или по видеосвязи. Что для вас важнее всего при выборе квартиры?
- **gpt-6.1-terra** · Chinese · facts [none] · 你好！在 TEST — Bosphorus Key Realty (automated runs)，我们可以安排实地或视频看房，也会协助买家办理房产证和居留许可手续。 你希望在伊斯坦布尔买房后，生活有什么不同？
- **gpt-6.1-terra** · Turkish · facts [none] · Merhaba! TEST — Bosphorus Key Realty (automated runs) olarak İstanbul’da daire arayan alıcı ve kiracılara yardımcı oluyor, yüz yüze veya canlı video ile ev gezileri düzenliyoruz. Sizin için nasıl bir daire ideal olurdu?
- **gpt-6.1-terra** · Spanish · facts [none] · ¡Hola! En TEST — Bosphorus Key Realty (automated runs) ayudamos a encontrar pisos en distintas zonas de Estambul y organizamos visitas en persona o por vídeo. ¿Buscas comprar o alquilar?
- **gpt-6.1-terra** · English · facts [none] · Hi! At TEST — Bosphorus Key Realty (automated runs), we help international buyers find apartments across Istanbul and can arrange viewings in person or by live video. What’s drawing you to Istanbul?
- **gpt-6.1-terra** · Arabic · facts [none] · أهلًا بك! في TEST — Bosphorus Key Realty (automated runs)، نساعد المشترين الدوليين في العثور على شقق في إسطنبول، ويمكننا ترتيب المعاينات حضوريًا أو عبر الفيديو. ما الذي تأمل أن تجده في شقتك الجديدة؟
- **gpt-6.1-terra** · Russian · facts [none] · Здравствуйте! В TEST — Bosphorus Key Realty (automated runs) мы помогаем иностранным покупателям найти квартиру в Стамбуле и сопровождаем оформление права собственности. Что для вас важнее всего в будущей квартире?
- **gpt-6.1-terra** · Chinese · facts [none] · 你好！我们在伊斯坦布尔的欧洲区和亚洲区都帮助国际买家寻找公寓和别墅，也可以通过视频看房。 你希望买房主要是自住，还是投资呢？
- **gpt-6.1-terra** · Turkish · facts [none] · Merhaba! TEST — Bosphorus Key Realty (automated runs) olarak İstanbul’un hem Avrupa hem de Anadolu yakasında daire arayan müşterilerimize yardımcı oluyor, yüz yüze veya canlı video ile gösterimler düzenliyoruz. Daireyi satın almak için mi, kiralamak için mi arıyorsunuz?
- **gpt-6.1-terra** · Spanish · facts [none] · ¡Hola! En TEST — Bosphorus Key Realty (automated runs) ayudamos a encontrar pisos en Estambul y organizamos visitas tanto en persona como por vídeo. ¿Buscas comprar o alquilar?
