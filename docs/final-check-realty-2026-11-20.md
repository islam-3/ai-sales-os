# Step 8: final check on test-realty, 2026-11-20

## Against the bars

- classifier p95 1325 ms (p50 856 ms, 84 turns, budget 2,000 ms) → ok
- no clinic wording: 0 of 84 replies use a word only test-clinic's material uses → ok
- lead in Turkish, name and digits kept: 12/12 → ok
- OpenAI only: 0 of 348 usage rows are not OpenAI → ok

Clinic topic words checked: beauty, meets, precision, leading, aesthetic, procedures, aesthetics, transplant, female, breast, augmentation, surgery, dental, implants, treatment, crowns, brand, package, turkey, experience, history, rhinoplasty, hollywood, smile, duration, warranty, bariatric, teeth, whitening, clinic, celebrity, heart, shine, liposuction, brazilian, straumann, implant, swiss, sapphire

Usage rows by call: facts_query_embedding text-embedding-3-small ×84, visitor_signals gpt-6-luna ×84, chat_reply gpt-6.1-terra ×84, lead_extraction gpt-6.1-terra ×84, coverage_answered gpt-6-luna ×12

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
