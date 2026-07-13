# Reference Host Demo

**English** | [简体中文](./reference-host.zh-CN.md)

The bundled host under `apps/memoweft-host` is a reference implementation.

It exists to demonstrate how a host can use MemoWeft Core. It is not the main product of this repository.

MemoWeft itself is the library exposed by:

```ts
import { createMemoWeftCore } from 'memoweft';
```

## What the demo shows

The reference host demonstrates:

- chat with memory recall;
- visible memory formation;
- evidence and cognition inspection;
- memory management;
- export and import;
- plugin and observation flows.

## What the host owns

A host owns:

- UI;
- chat experience;
- persona and tone;
- privacy prompts;
- when to trigger `updateProfile()`;
- how to display recalled context;
- how users manage memory.

## What MemoWeft Core owns

MemoWeft Core owns:

- evidence storage;
- event distillation;
- cognition formation;
- confidence computation;
- conflict handling;
- recall;
- controlled memory-management APIs;
- portable memory bundles.

## Run the demo

The reference host requires Node.js 24 or newer.

```bash
git clone https://github.com/memoweft/memoweft.git
cd memoweft
npm install
npm run build
npm start -w @memoweft/host
```

Open:

```text
http://localhost:7788
```
