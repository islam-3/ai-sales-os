# Step 8: final check on test-realty, 2026-11-20

## Against the bars

- classifier p95 1325 ms (p50 856 ms, 84 turns, budget 2,000 ms) → ok
- no clinic wording: 9 of 84 replies use a word only test-clinic's material uses → **FAIL**
- lead in Turkish, name and digits kept: 12/12 → ok
- OpenAI only: 0 of 348 usage rows are not OpenAI → ok
- capture: 5/5 as expected → ok

Usage rows by call: facts_query_embedding text-embedding-3-small ×84, visitor_signals gpt-6-luna ×84, chat_reply gpt-6.1-terra ×84, lead_extraction gpt-6.1-terra ×84, coverage_answered gpt-6-luna ×12

## Clinic wording

- 2ad7508e [helps, sides] Hi! At TEST — Bosphorus Key Realty (automated runs), our team helps international buyers find homes across both sides of Istanbul, with viewings in person or by video. What’s prompting your move to Is
- 2ad7508e [reach] Prices depend on the area and size: Beşiktaş and Şişli start from about USD 4,500 per m², Kadıköy from about USD 3,500 per m², and Başakşehir and Beylikdüzü from about USD 1,800 per m². For an accurat
- 2ad7508e [process, obtain] For a foreign buyer, the process is: Choose a home and sign a reservation agreement with a 5% deposit. Get a Turkish tax number and bank account; we take you to both. Obtain the required government ap
- 2ad7508e [leave] Of course—take the time you need to talk it over as a family. If you’d like, you can leave us your WhatsApp number with the country code, and our team can follow up whenever you’re ready.
- 2ad7508e [visit, helps, complete] Thanks, Emma. Knowing how long you can stay in Istanbul on each visit helps us plan what you could realistically complete in one trip. How many days would you be able to stay each time?
- 146d6a61 [reach] Prices vary by area: Kadıköy starts at about USD 3,500 per m², while Beşiktaş and Şişli start at about USD 4,500 per m². For an accurate quote, could you briefly share what you need, your name, and yo
- 146d6a61 [later] Of course, take the time you need to talk it over as a family. If it would help later, you’re welcome to message us on WhatsApp at +90 212 555 01 47, and our team can help you explore options with no 
- 146d6a61 [later] Thanks, Emma. Take all the time you and your family need—we’re here if you have questions later.
- 146d6a61 [shape, visit] Thanks, Emma. The time you have in Istanbul will shape how many viewings and buying steps we can realistically plan for each trip. How long would you be able to stay on each visit?

## Lead summaries (for reading)

- English run 1: Emma, gelecek yıl Londra'dan iki çocuğuyla İstanbul'a taşınmak için muhtemelen 3 yatak odalı bir daire satın almak istiyor. Fiyatı ve yabancılar için satın alma sürecini sordu; ilerlemeden önce ailesiyle görüşmek istiyor ve iletişim numarasını paylaştı.
- Arabic run 1: عمر, İstanbul'da ailesiyle yaşayabileceği, denize yakın üç odalı bir daire satın almak istiyor. Fiyatları ve yabancılar için satın alma sürecini sordu; karar vermeden önce düşünüp eşiyle görüşmek istiyor ve iletişim numarasını paylaştı.
- Russian run 1: Анна, İstanbul'da hem yaşamak hem de yatırım yapmak için Boğaz manzaralı, iki odalı bir daire arıyor. Yaklaşık fiyatı ve yabancılar için satın alma sürecini sordu; karar vermeden önce eşiyle görüşmek istiyor. İletişim numarasını paylaştı, ancak bütçesi ve istediği alan henüz bilinmiyor.
- Chinese run 1: 李明, İstanbul'da yatırım için iki yatak odalı bir ev satın almak istiyor ve Türk vatandaşlığını değerlendiriyor. Fiyat ve yabancıların satın alma süreci hakkında bilgi istedi; karar vermeden önce eşiyle görüşecek.
- Turkish run 1: Ayşe, Almanya'da yaşıyor ve emeklilik için İstanbul'da deniz manzaralı bir daire satın almak istiyor. Fiyatları ve satın alma sürecini sordu; karar vermeden önce düşünüp eşiyle konuşması gerekiyor.
- Spanish run 1: Lucía, iş için İstanbul'a taşınırken Levent yakınında iki yatak odalı kiralık daire arıyor. Kira bedelini ve yabancı olarak kiralama sürecini merak ediyor; karar vermeden önce partneriyle görüşmek istiyor.
- English run 2: Emma, gelecek yıl Londra'dan iki çocuğuyla İstanbul'a taşınmak için 3 yatak odalı bir daire satın almayı düşünüyor. Fiyatları ve yabancılar için satın alma adımlarını sordu; karar vermeden önce ailesiyle görüşmek istiyor.
- Arabic run 2: عمر, İstanbul'da ailesiyle yaşamak üzere denize yakın, üç odalı bir daire arıyor. Fiyatları ve yabancılar için satın alma sürecini sordu; ilerlemeden önce düşünüp eşiyle konuşmak istiyor.
- Russian run 2: Анна, İstanbul'da hem yaşamak hem yatırım yapmak için Boğaz manzaralı iki odalı bir daire arıyor. Yaklaşık maliyeti ve yabancılar için satın alma sürecini sordu; karar vermeden önce eşiyle görüşmek istiyor ve iletişim numarasını paylaştı.
- Chinese run 2: 李明, İstanbul'da yatırım amaçlı iki yatak odalı bir ev arıyor ve vatandaşlık seçeneğini değerlendiriyor. Fiyat ve satın alma süreci hakkında bilgi aldı; karar vermeden önce eşiyle görüşmek istiyor.
- Turkish run 2: Ayşe, Almanya'da yaşıyor ve İstanbul'da emeklilik için deniz manzaralı bir daire satın almak istiyor. Fiyatları ve satın alma sürecini sordu; karar vermeden önce düşünmek ve eşiyle konuşmak istiyor.
- Spanish run 2: Lucía, iş nedeniyle İstanbul'a taşınıyor ve Levent yakınlarında iki odalı kiralık daire arıyor. Kira bedelini ve yabancılar için kiralama sürecini öğrenmek istiyor; karar vermeden önce partneriyle görüşecek.

## Capture (session 6bf545f0-1fe9-472e-b5d2-7166afc8d0be)

- "hi, I'm interested in buying a flat in Kadıköy": no row (want no row)
- "do you allow pets in the apartments you sell?": gap (want gap)
- "is there parking included with the apartments?": gap (want gap)
- "yes please": no row (want no row)
- "what is your commission?": no row (want no row)

- recorded: "do you allow pets in the apartments you sell?" → "Sattığınız dairelerde evcil hayvana izin veriliyor mu?"
- recorded: "is there parking included with the apartments?" → "Dairelere otopark dahil mi?"
