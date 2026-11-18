# Lead extraction: Sonnet vs gpt-6.1-terra vs gpt-6-luna, 2026-11-18

Offline, stored test-clinic transcripts: 12 conversations (final turn) + the constructed Arabic-Indic turn, team languages English and Turkish, 2 runs. Output limit 1024 tokens on every model.

Conversations (stored after the 2026-11-04 timestamp fix, no tied rows): English `eee97d63-ed4c-4f8d-8150-6a779e02cf8d`, English `9faece88-125b-452a-8d1b-bab71ad31765`, Arabic `06209320-92d7-4df9-a588-6037d4b48690`, Arabic `9e68ff32-a1b5-40b6-9ad6-0431f8d2360c`, Russian `dcb0905e-74fa-4b66-b4cb-63558f478cea`, Russian `2ddbbfde-dd32-45c6-939d-755ae66f6e6b`, Chinese `cce0512c-caf0-44f1-9010-4eedea2021d0`, Chinese `4a7ab5a8-92d9-422c-8cfe-a48678b7e53e`, Turkish `d398a0e1-8ebb-4587-9d60-ca7feba70da7`, Turkish `7eb488d0-fca6-4679-9109-37a2467c0d92`, Spanish `92985564-d415-43ab-9cee-8940d5c02956`, Spanish `dc082d0f-2bfa-4d8c-ac35-73046d46f97e`.

| Model | Visitor language | Calls | Name | Contact digits | ASCII digits | Visitor language | Age null | Summary in team language | Fields in team language | Invented figures | Score within 15 of Sonnet | Fields filled as Sonnet | Cost per call |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Per conversation: every turn replayed, as production extracts

| Model | Conversation | Turns | Cost | Per call | Input read from cache | Per turn |
|---|---|---|---|---|---|---|
| gpt-6.1-terra | English | 7 | $0.0140 | $0.00200 | 0% | miss $0.00135, miss $0.00149, miss $0.00192, miss $0.00229, miss $0.00223, miss $0.00226, miss $0.00246 |
| gpt-6.1-terra | Arabic | 7 | $0.0141 | $0.00201 | 0% | miss $0.00135, miss $0.00148, miss $0.00189, miss $0.00214, miss $0.00229, miss $0.00236, miss $0.00258 |

## Parse failures (hard: a lost lead)

| Model | Calls | No usable JSON or a missing field | API errors |
|---|---|---|---|
| gpt-6.1-terra | 14 | **0** | 0 |

## Why each response stopped

| Model | Stop reasons |
|---|---|
| gpt-6.1-terra | completed: 14 |
