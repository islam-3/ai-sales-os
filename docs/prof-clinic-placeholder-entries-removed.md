# Three knowledge-base entries removed from prof-clinic

2026-10-11. Data change only, hence this record — there is no code diff
to carry the reason.

## What went

| id | category | title and content (identical) |
|---|---|---|
| `661661fa-b512-492d-a521-98798e318e29` | Dental treatment | `Before and after ( Hollywood smile )` |
| `b33a0727-205f-47b4-bda4-c0fcba4a100d` | Dental treatment | `Before and after ( dental implants )` |
| `1caedc20-2662-4bb7-844b-568cff3f8107` | Hair transplant | `Before and after` |

All three were created on 3 September to carry a photo. Image sending
was removed from the chat, `knowledge_base_media` is empty, and nothing
referenced them — so each row's entire contribution to every prompt was
its own title repeated:

```
Before and after: Before and after
```

They were embedded, so they could also win a similarity match against a
real question.

Entry count 23 → 20. Exported in full, embeddings included, to
`backups/prof-clinic-placeholder-entries-2026-10-11T13-26-19-156Z.json`
before deletion.

## The one that was NOT removed, and why it matters

The rule that found them — *content adds nothing beyond the title* —
also matched:

| id | title and content (identical) |
|---|---|
| `ddb16a83-a1c7-405e-b16d-7f289de620ee` | `we have 15 years of experience` |

Structurally identical: title and content are the same string. But that
string is a **fact**, where the other three are a **label**, and it is
the only entry in the knowledge base recording it — checked. The
behaviour prompt specifically tells the assistant to reach for specifics
like "fifteen years and five thousand patients" instead of "well
established", and this is the row that supplies one.

Telling a label from a fact means reading the text and judging it, which
is the kind of interpretation that has caused the hard bugs in this
project. So the rule was used to FIND candidates and a person decided
which to delete. The deletion script hard-coded three ids; it did not
select by rule.

Worth carrying into the guided-data-entry work: a row whose title and
content are the same sentence is what an owner writes when handed an
empty, unlabelled box. Under a guided flow that fact becomes the answer
to "who does the work, and what are their credentials", with the
question as the title — which is the gap that produced the row.
