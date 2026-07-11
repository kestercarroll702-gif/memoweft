# Confidence is computed by rule, not reported by the LLM

Every cognition MemoWeft keeps carries a `confidence` (0–1000) and a `credStatus`. This page shows where those numbers come from — and why the model never gets to set them.

## See it (no API key)

This runs with no model and no network. `computeConfidence` and `deriveCredStatus` are pure functions.

```ts
import { createMemoWeftCore, computeConfidence, deriveCredStatus } from 'memoweft';

// Storing what the user said needs no model — it just records raw evidence, unscored.
const core = createMemoWeftCore({ dbPath: ':memory:' });
await core.ingestUserMessage({ subjectId: 'alice', content: 'I am allergic to peanuts.' });
console.log('evidence stored:', core.memory.listEvidence({ subjectId: 'alice' }).length);
core.close();

// Confidence is a rule: same inputs -> same score, every run.
const stated = computeConfidence({ contentType: 'fact', formedBy: 'stated',   supportCount: 1,  contradictCount: 0 });
const guess  = computeConfidence({ contentType: 'fact', formedBy: 'inferred', supportCount: 1,  contradictCount: 0 });
const nagged = computeConfidence({ contentType: 'fact', formedBy: 'inferred', supportCount: 20, contradictCount: 0 });

console.log('stated fact      ', stated, deriveCredStatus(stated, 0, 'fact')); // 600 limited
console.log('inferred guess   ', guess,  deriveCredStatus(guess,  0, 'fact')); // 200 candidate
console.log('guess x20 support', nagged, deriveCredStatus(nagged, 0, 'fact')); // 400 low
console.log('with 1 contradict', deriveCredStatus(stated, 1, 'fact'));         // conflicted
```

## How the score is built

The formula is `base + support − contradict`, clamped to 50–1000:

- **Base by source strength** — `stated` 600, `ruled` 450, `observed` 350, `inferred` 200. A guess is born lowest.
- **Support** — each extra supporting piece of evidence adds 40, up to 5 pieces (+200 max).
- **Contradiction** — each contradicting piece subtracts 120.
- **Transient cap** — `state` cognitions (moods, "tired today") cap at 300, so a repeated feeling never hardens into a stable trait.

## Why this matters

Ask an LLM how sure it is and it will happily invent a number — high for a hallucination, low for a fact. MemoWeft ignores that. The score is a function of **where the claim came from and how the evidence stacks up**, so it is reproducible and auditable: rerun the inputs, get the same number.

This also means a guess cannot climb into a fact. Above, piling 20 supporting observations onto an `inferred` claim reaches 400 (`low`) and stops — a guess never accumulates its way to `stable`. Only new first-hand evidence, distilled as `stated`, earns a high base. See how a claim's source strength is decided in [Concepts](./).

## Credibility status

`deriveCredStatus` turns a score into a plain label. Any contradicting evidence overrides everything else:

| credStatus  | condition                                  |
|-------------|--------------------------------------------|
| `conflicted`| any contradicting evidence (see conflict)  |
| `stable`    | confidence ≥ 750                           |
| `limited`   | confidence ≥ 500                           |
| `low`       | confidence ≥ 300                           |
| `candidate` | confidence < 300                           |

`state` (transient) cognitions never rank above `low`, whatever the score.

## See it become a stored fact (needs a model)

Turning evidence into a scored cognition needs a chat model. Scene 1 of the demo ingests "I am allergic to peanuts", distills it, and shows it land as a high-confidence `fact` — no key, no network, deterministic offline stub.

<!-- snippet:skip (needs a live model) -->
```ts
await core.ingestUserMessage({ subjectId: 'alice', content: 'I am allergic to peanuts' });
await core.updateProfile({ subjectId: 'alice' }); // distill -> consolidate -> score by rule
for (const c of core.memory.listCognitions({ subjectId: 'alice' })) {
  console.log(c.content, c.confidence, c.credStatus); // allergic to peanuts · 600 · limited
}
```

Run it: `npm run demo -- --act 1` ([demo walkthrough](../demo-script.md)).

## Related

- [Getting started](../getting-started.md) — store evidence and read it back in five minutes.
- [Concepts](./) — source strength, conflict exposure, and time decay, one screen each.
- [Run the demo](../demo-script.md) — the four differentiators in 90 seconds.
