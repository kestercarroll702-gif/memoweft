# @memoweft/adapter-mastra

Give a [Mastra](https://mastra.ai) agent long-term memory with [MemoWeft](https://github.com/memoweft/memoweft) — the portable memory library that keeps **facts and guesses apart** (confidence is rule-derived, conflicts are surfaced not adjudicated).

One `Processor` wires both directions:

- **Read** (`processInput`, before the model runs): recall relevant memory for the user's turn and inject it into the **system channel** — the user message is never touched, so nothing you inject can leak back in as "what the user said".
- **Write** (`processOutputResult`, after the model answers):
  - the user's turn → a `spoken` evidence (captured pre-injection);
  - each tool **result** → a `tool` evidence (only `payload.result` — never the call arguments, iron rule 3a);
  - the assistant reply → `recordAssistantReply` (MemoWeft 0.6 conversation context — kept only as context for the *next* turn, never stored as evidence).

## Install

```bash
npm install @memoweft/adapter-mastra memoweft @mastra/core
```

`memoweft` and `@mastra/core` are peer dependencies. This adapter works with **memoweft `^0.5` or `^0.6`**: the assistant-reply / preceding-context line uses `recordAssistantReply`, a 0.6 feature that is probed at runtime — on 0.5 it is skipped and the rest (recall + user/tool ingestion) still works.

## Usage

```ts
import { Agent } from '@mastra/core/agent';
import { createMemoWeftCore } from 'memoweft';
import { createMemoWeftProcessor } from '@memoweft/adapter-mastra';

const core = createMemoWeftCore({ dbPath: './memory.db', llm, embedder });

// One instance serves both directions — register it in BOTH arrays.
const memory = createMemoWeftProcessor(core, { lang: 'en' });

const agent = new Agent({
  name: 'assistant',
  instructions: 'You are a helpful assistant.',
  model,
  inputProcessors: [memory],   // processInput  → recall + inject
  outputProcessors: [memory],  // processOutputResult → persist
});
```

To thread the 0.6 conversation context (so a bare "yes" is understood against the assistant's previous question), give your Mastra messages a stable `threadId` — the adapter uses it as the MemoWeft `conversationId`.

## Options

`createMemoWeftProcessor(core, options)`:

| option | default | meaning |
|---|---|---|
| `processorId` | `'memoweft-memory'` | Mastra processor id. |
| `subjectId` | Core default | Whose memory to recall / write. |
| `lang` | `'en'` | Language of the injected knowledge block (`'en'` \| `'zh'`). Wording only — does not change Core behavior. |
| `contentTypes` | all | Recall filter by cognition type (allow-list); passed through to `core.recall`. |
| `explain` | `false` | Ask Core for each recalled cognition's provenance; delivered **only** via `onRecall` (never injected). |
| `onRecall` | — | Called after each successful recall with the recalled items (id / contentType / score, and provenance when `explain`). Use it to observe or to self-filter before forwarding to a cloud model. |
| `recallTimeoutMs` | `200` | Recall timeout (§16.2). On timeout/error the turn degrades to **no injection**; the read path does not retry. |
| `logger` | — | Structured degradation events `{ event, op, reason }`. Never receives user content, utterances, or secrets. |

## Guarantees

- **No injection into the user message.** Recall goes to the system channel; the captured user utterance is always the pristine input.
- **Iron rule 3a.** Only tool *results* become evidence — tool call arguments and the assistant's own reply never do. The assistant reply is context-only.
- **Privacy (D-0024).** `provenance` (raw evidence text + cloud/inference authorization bits), `contentType`, `id` and `score` are never placed in the injected prompt — they travel only through `onRecall`.
- **Never blocks the conversation (§16.2).** Recall is bounded by a timeout and degrades to no-injection on failure; writes retry once then give up silently. Memory failures never abort a generation.

## Coexisting with Mastra's built-in memory

Mastra ships its own working / semantic / observational memory. MemoWeft **replaces the semantic-recall layer** with fact-vs-guess memory. If you also enable Mastra's built-in semantic recall you will get two memory systems injecting in parallel — disable Mastra's semantic recall (keep message history / working memory as you like) so recall stays coherent.

## License

MIT
