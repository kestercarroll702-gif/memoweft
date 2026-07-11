# Assistant output is never evidence

MemoWeft records what the user said, what the host observed, and what a tool returned. It never records the assistant's own reply, or the tool call the model proposes. The model cannot feed its own guesses back in as facts.

## The store has no door for assistant output (no API key)

This runs with no model and no network. Copy it into a file and run it.

```ts
import { createMemoWeftCore } from 'memoweft';

const core = createMemoWeftCore({ dbPath: ':memory:' });

// The user speaks — this records evidence.
await core.ingestUserMessage({ subjectId: 'alice', content: 'I love strong coffee.' });

// There is no ingestAssistantMessage. A reply has no way into the store.
// What's recorded is exactly what the user said, tagged with who said it.
const evidence = core.memory.listEvidence({ subjectId: 'alice' });
console.log(evidence.length, evidence[0].sourceKind, '·', evidence[0].rawContent);
// → 1 spoken · I love strong coffee.

core.close();
```

The facade offers `ingestUserMessage`, `ingestObservation`, and `ingestToolResult` — and no method that turns an assistant reply into evidence.

## The rule

Evidence only comes from outside the model:

- **`spoken`** — the user's own words (`ingestUserMessage`).
- **`observed`** — a behavior the host observed (`ingestObservation`).
- **`tool`** — the payload a tool returned (`ingestToolResult`).

The model's own output — its chat reply, and the tool-call arguments it proposes — is never ingested. This is iron rule 3a (see [`AGENTS.md`](../../AGENTS.md)). The Vercel AI SDK adapter holds the same line: `persistOnEnd` stores the user's verbatim turn and `tool`-role results, and never reads assistant messages.

## Why it matters: no self-reinforcing guesses

A cognition's support chain cites evidence ids — never another cognition, never the model's earlier words. So the assistant cannot cite its own guess to raise that guess's confidence. Without this rule, a hypothesis the model voiced last turn could return as "a thing the user said" and snowball into a false fact. Confidence stays anchored to what actually came from outside the model. (Confidence itself is computed by rules, not self-reported — see the [Memory Surface Contract](../reference/memory-surface-contract.md), implicit contract item 1.)

## In a full turn (needs a chat model)

<!-- snippet:skip (needs a live model) -->
```ts
const before = core.memory.listEvidence({ subjectId: 'alice' }).length;

const turn = await core.handleConversationTurn({ subjectId: 'alice', message: 'Any snack ideas?' });
console.log(turn.reply); // the assistant answers...

const after = core.memory.listEvidence({ subjectId: 'alice' });
console.log(after.length - before); // → 1 — only the user's new message; the reply is not stored
```

The reply lives in `turn.reply`, not in the store. See the effect end to end in the four-act demo: [`examples/demo.ts`](../../examples/demo.ts) (`npm run demo`).

## See also

- [Getting started](../getting-started.md) — store one message and read it back.
- [Memory Surface Contract](../reference/memory-surface-contract.md) — `SourceKind`, the ingest methods, how confidence is computed.
- [Demo script](../demo-script.md) — the four differentiators in 90 seconds.
