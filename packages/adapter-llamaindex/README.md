# @memoweft/adapter-llamaindex

> 中文版 · [README.zh-CN.md](./README.zh-CN.md)

**LlamaIndex adapter for [MemoWeft](https://github.com/memoweft/memoweft).** Give your LlamaIndex agent (`llamaindex` + `@llamaindex/workflow`) long-term memory across three seams: **read** = a `BaseMemoryBlock` that recalls relevant memory and injects it as a neutral `role:'memory'` message every model call; **write** = a pass-through wrapper around `agent.runStream(...)` that persists the user's own words and each tool result while re-yielding every event untouched.

This is an **external integration package**. It wraps MemoWeft's public Core facade (`createMemoWeftCore`) — it does not touch Core internals. `llamaindex` and `@llamaindex/workflow` are peer dependencies (bring your own).

> **Upstream note.** LlamaIndex.TS is mid-restructuring: its granular `@llamaindex/*` packages are marked *deprecated* on npm, yet the maintained umbrella `llamaindex@^0.12` still depends on them. This adapter peers on the umbrella `llamaindex` (so it doesn't directly depend on the deprecated `@llamaindex/core`), but the event-driven agent API it needs (`agent` / `runStream` / `agentToolCallResultEvent`) lives only in `@llamaindex/workflow` — also marked deprecated, and itself a dependency of `llamaindex@0.12`. Installing may print a deprecation warning from these transitive packages; the adapter is fully functional today. See `DECISIONS.md` D-0029.

## Install

```bash
npm i llamaindex @llamaindex/workflow memoweft @memoweft/adapter-llamaindex
```

`@llamaindex/core` `^0.6.23`, `@llamaindex/workflow` `^1.1.25`, and `memoweft` `^0.5.0` are peer dependencies.

## Why recall goes through a memory block, and writes through a stream tap

**Read — a memory block, not a manual prompt splice.** LlamaIndex's `Memory` calls each block's `get(messages)` **before every model call** and stitches the returned "memory context" into the prompt. That is exactly the recall-injection seam. `MemoWeftMemoryBlock` implements `get()` to run one semantic recall and return the neutral knowledge block as a single `role:'memory'` message — so once you drop the block into `createMemory({ memoryBlocks: [block] })`, injection is automatic and you write no prompt-splicing code.

**Write — a pass-through stream tap, not the block's `put()`.** A `BaseMemoryBlock` also has a `put()` hook, but `Memory` feeds it the **whole conversation** (assistant replies and already-injected memory included) — persisting there would store the assistant's output as if it were evidence (dirty data). So the block's `put()` is a **no-op**, and all writing goes through `persistFromAgentStream`: the user's words are passed in explicitly (held before injection), and tool results are recognized **only** from `agentToolCallResultEvent`.

## One factory, four pieces, three paths

`createMemoWeftLlamaIndex(core, opts?)` returns `{ memoryBlock, persistFromAgentStream, persistUserTurn, formatKnowledge }`.

```ts
import { createMemory } from '@llamaindex/core/memory';
import { agent } from '@llamaindex/workflow';
import { createMemoWeftCore } from 'memoweft';
import { createMemoWeftLlamaIndex } from '@memoweft/adapter-llamaindex';

const core = createMemoWeftCore({ dbPath: './memory.db' });
const mw = createMemoWeftLlamaIndex(core, { lang: 'en' });

// ① read: drop the block into Memory → recall is injected automatically before every model call.
const memory = createMemory({ memoryBlocks: [mw.memoryBlock] });
const myAgent = agent({ llm, tools, memory }); // bring your own ToolCallLLM + tools

// ②③ write: wrap runStream — re-yields every event untouched, persisting the user's words + tool results in passing.
for await (const ev of mw.persistFromAgentStream(myAgent.runStream(userText), { userMessage: userText, originId: turnId })) {
  // …consume ev as usual (events pass through untouched)…
}
```

Three paths, three pieces:

- **① Recall injection (read) — `memoryBlock`.** `mw.memoryBlock` is a `MemoWeftMemoryBlock extends BaseMemoryBlock`. `Memory` calls `block.get(messages)` before each model call; the block takes the last user message as the query, recalls, and returns **one** `role:'memory'` message whose content is the neutral knowledge block — MemoWeft's own wording, ported verbatim from Core's `knowledgeBlock`. Low-confidence items are explicitly marked *"only guesses — do not treat as established facts."* The adapter **adds no persona / character prompt** of its own. (`priority: 0` means the block is always included in the memory context.)
- **② The user's words (write) — via `persistFromAgentStream`'s `userMessage`.** Pass the words you already hold (**before** injection) as `extras.userMessage`. Do not fish them back out of the stream: the model input has already been injected with recalled memory, so re-reading it would store the injected memory as if it were the user's words. Stored as `spoken` evidence. (A standalone `persistUserTurn({ text, originId })` closure is also provided for hosts that drive `runStream` themselves.)
- **③ Tool results (write) — via `persistFromAgentStream`'s event tap.** The wrapper re-yields every event and persists **only** the ones matching `agentToolCallResultEvent` (the tool's real **result**, `event.data.toolOutput.result`) → stored as `tool` evidence, keyed by `toolId` for idempotency. It **never** matches `agentToolCallEvent` — so the model's tool-call **intent / arguments** never reach the write path (iron rule 3a, enforced *by construction*: the result discriminator physically excludes the call-intent and assistant-output event types).

## Privacy hard constraint (D-0024)

`provenance` (evidence text + authorization bits) **never** enters the injected `role:'memory'` message, and never enters the `formatKnowledge` block. The injected content uses only `content` / `confidence` / `credStatus` (`buildKnowledgeBlock`). The richer recall surface — `id`, `contentType`, `score`, and (with `explain`) `provenance` including `allowCloudRead` / `allowInference` bits — is handed to the host **only** through the `onRecall` callback, so you can filter before forwarding anything to a cloud model. Because injection lands in the model prompt (never back into the captured user words), the stored `spoken` evidence can never contain injected memory.

## Degradation (§16.2)

- Recall is bounded by `recallTimeoutMs` (default 200ms). On timeout or error `block.get()` returns `[]` — the turn proceeds **without injection**; recall failure never blocks the reply, and never throws to `Memory`. The read path does not retry.
- Writes (`ingest`) retry once on real errors (a timed-out write is not retried, since it may have committed); a still-failing write is logged (if a `logger` is provided) and swallowed. Ingestion failure **never** throws to or interrupts the stream — every event is re-yielded regardless.

## Options

Factory: `{ subjectId?, lang?: 'en' | 'zh', contentTypes?, explain?, onRecall?, recallTimeoutMs?, ingestTimeoutMs?, logger?, memoryBlockId?, memoryBlockPriority? }`

Per-turn (via `persistFromAgentStream`): `{ userMessage, originId?, subjectId? }`

## Full example

See [`examples/basic.ts`](./examples/basic.ts) — a two-turn chat that stores each turn's words and tool results and recalls them into the next turn's injected memory block, with the real `agent(...).runStream(...)` wiring shown alongside an offline demo.

## Why not implement `FactExtractionMemoryBlock`-style extraction

LlamaIndex's built-in `FactExtractionMemoryBlock` uses an **LLM to self-report facts** and store them. That is orthogonal to MemoWeft, which **separates facts from guesses, computes confidence by rule (not model self-report), stores only the user's words and tool results, and never stores the assistant reply.** So the adapter's block does recall-injection only (`get()`), leaves `put()` a no-op, and routes all writing through the stream tap.

## What it does not do

- No persona / character prompt (Core is headless — tone/role is the host's job).
- Does not store the assistant reply, only the user's words and tool results.
- Never reads a tool call's arguments (`agentToolCallEvent`), and passes no cloud-authorization bits on the write path.

## License

MIT
