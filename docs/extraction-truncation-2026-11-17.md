# Lead extraction truncation check, 2026-11-17

Sonnet (claude-sonnet-4-6), production settings (max_tokens 512), team language Turkish,
final turn of two test-clinic smoke conversations stored after the 2026-11-04 timestamp fix
(tie-free, so the transcript order is certain).

```
English conversation 9faece88-125b-452a-8d1b-bab71ad31765, Turkish team:
  stop_reason=end_turn  output_tokens=399  parsed=yes  cost=$0.01143
  last 120 characters of the raw output: "memiştir. WhatsApp numarasını paylaşmış olup doğru zamanda takip yapılması uygun olacaktır.\", \"qualification_score\": 55}"
Arabic conversation 9e68ff32-a1b5-40b6-9ad6-0431f8d2360c, Turkish team:
  stop_reason=max_tokens  output_tokens=512  parsed=NO  cost=$0.01460
  last 120 characters of the raw output: "ı. Karar vermeden önce eşiyle görüşmek istediğini belirtti, dolayısıyla seyahat tarihi henüz belirsiz.\", \"qualification_"
total $0.02603
```

Confirmed: the Arabic conversation stopped at max_tokens at exactly 512 output tokens,
with the JSON cut off mid-key, so it does not parse and the route saves nothing from it.
The English one finished at 399 of 512.
