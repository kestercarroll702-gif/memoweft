# @memoweft/adapter-langchain

> 中文版 · [README.zh-CN.md](./README.zh-CN.md)

**LangChain adapter for [MemoWeft](https://github.com/memoweft/memoweft).** Give your `@langchain/core` app long-term memory across three seams: **read** = a `BaseRetriever` that recalls relevant memory as `Document[]` for you to stitch into your prompt; **write** = a `BaseCallbackHandler` that persists each tool result, plus a host closure that persists the user's own words.

This is an **external integration package**. It wraps MemoWeft's public Core facade (`createMemoWeftCore`) — it does not touch Core internals. `@langchain/core` is a peer dependency (bring your own).

## Install

```bash
npm i @langchain/core memoweft @memoweft/adapter-langchain
```

`@langchain/core` `^1` and `memoweft` `^0.5.0` are peer dependencies.

## Why recall goes through a retriever, not a callback

**Hard fact:** LangChain callbacks are **observe-only** — the `CallbackManager` discards a handler's return value, so a handler cannot **inject** anything into the model input. Recall injection therefore **cannot** ride a callback; it must go through a `BaseRetriever` (a `Runnable`). You call `retriever.invoke(query)`, get `Document[]`, and stitch the neutral block into your prompt yourself. The two write paths — tool results and the user's words — are the only things that ride the callback / a closure.

## One factory, four pieces, three paths

`createMemoWeftLangChain(core, opts?)` returns `{ retriever, writeCallback, formatKnowledge, persistUserTurn }`.

```ts
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createMemoWeftCore } from 'memoweft';
import { createMemoWeftLangChain } from '@memoweft/adapter-langchain';

const core = createMemoWeftCore({ dbPath: './memory.db' });
const mw = createMemoWeftLangChain(core, { lang: 'en' });

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful assistant.{memory}'],
  ['human', '{question}'],
]);

// ② write: persist the user's own words (before any injection); originId is a stable idempotency key.
await mw.persistUserTurn({ text: question, originId: turnId });

// ① read: recall → Document[] → neutral knowledge block → you stitch it into the prompt.
const memory = mw.formatKnowledge(await mw.retriever.invoke(question));

// ③ write: attach the callback so every tool result in the chain is persisted automatically.
const chain = prompt.pipe(model); // bring your own chat model, e.g. @langchain/openai's ChatOpenAI
const reply = await chain.invoke({ memory, question }, { callbacks: [mw.writeCallback] });
```

Three paths, three pieces:

- **① Recall injection (read) — `retriever` + `formatKnowledge`.** `mw.retriever` is a `MemoWeftRetriever extends BaseRetriever`; `retriever.invoke(query)` recalls and returns `Document[]` (`pageContent` = the cognition's content; `metadata` carries host-facing `confidence` / `credStatus` / `id` / `contentType` / `score`). `mw.formatKnowledge(docs)` renders them into the neutral knowledge block — MemoWeft's own wording, ported verbatim from Core's `knowledgeBlock`. Low-confidence items are explicitly marked *"only guesses — do not treat as established facts."* The adapter **adds no persona / character prompt** of its own; where the block goes in the prompt is your call.
- **② The user's words (write) — `persistUserTurn`.** Call `mw.persistUserTurn({ text, originId })` at the call site, **before** injection, passing the words you already hold. Do not fish them back out of chain events: the model input has already been injected with recalled memory, so re-reading it would store the injected memory as if it were the user's words. Stored as `spoken` evidence.
- **③ Tool results (write) — `writeCallback`.** Add `mw.writeCallback` to any chain's `config.callbacks`. It implements **only** `handleToolEnd` (the tool's real **result**) → stored as `tool` evidence, keyed by `runId` for idempotency. It **never** declares `handleToolStart` — so the model's tool-call **intent / arguments** never reach the adapter (iron rule 3a, enforced *by construction*: `CallbackManager` only dispatches `if (handler.handleToolStart)`).

## Privacy hard constraint (D-0024)

`provenance` (evidence text + authorization bits) **never** enters `pageContent` or `Document.metadata`, and never enters the `formatKnowledge` block. `pageContent` holds only `content`; `buildKnowledgeBlock` uses only `content` / `confidence` / `credStatus`. The richer recall surface — `id`, `contentType`, `score`, and (with `explain`) `provenance` including `allowCloudRead` / `allowInference` bits — is handed to the host **only** through the `onRecall` callback, so you can filter before forwarding anything to a cloud model. Because injection lands in your prompt (never back into the captured user words), the stored `spoken` evidence can never contain injected memory.

## Degradation (§16.2)

- Recall is bounded by `recallTimeoutMs` (default 200ms). On timeout or error `retriever.invoke` returns `[]` — the turn proceeds **without injection**; recall failure never blocks the reply. The read path does not retry.
- Writes (`ingest`) retry once on real errors; a still-failing write is logged (if a `logger` is provided) and swallowed. Nothing is ever thrown to the chain or the caller.

## Options

Factory: `{ subjectId?, lang?: 'en' | 'zh', contentTypes?, explain?, onRecall?, recallTimeoutMs?, ingestTimeoutMs?, logger? }`

Per-turn (via `persistUserTurn`): `{ text, originId?, subjectId?, hostId?, occurredAt? }`

## Full example

See [`examples/basic.ts`](./examples/basic.ts) — a two-turn chat that stores each turn's words and recalls them into the next turn's prompt, with the `RunnablePassthrough.assign` LCEL wiring shown as an alternative.

## Why not implement `BaseMemory`

LangChain's `BaseMemory` is a **conversation buffer** — it stuffs prior turns back into the prompt. That is orthogonal to MemoWeft's long-term memory, which **separates facts from guesses, computes confidence by rule (not model self-report), stores only the user's words and tool results, and never stores the assistant reply.** Forcing MemoWeft into `BaseMemory` would store assistant replies and injected memory as "history" (dirty data, violating iron rule 3a and D-0024). So the adapter uses three seams — a retriever (read) plus a callback and a closure (write) — instead of `BaseMemory`.

## What it does not do

- No persona / character prompt (Core is headless — tone/role is the host's job).
- Does not store the assistant reply, only the user's words and tool results.
- Never reads a tool call's arguments, and passes no cloud-authorization bits on the write path.

## License

MIT
