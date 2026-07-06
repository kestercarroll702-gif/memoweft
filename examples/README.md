# MemoWeft Examples

Build the package before running examples that import `memoweft` by package name:

```bash
npm run build
```

## Examples

- [`minimal.ts`](./minimal.ts) — minimal Core setup and conversation flow.
- [`memory-management.ts`](./memory-management.ts) — controlled memory-management APIs.
- [`portable-bundle.ts`](./portable-bundle.ts) — export, validate, and import a memory bundle.
- [`plugin-hook.ts`](./plugin-hook.ts) — plugin hooks and restricted `PluginContext` capabilities.

Run an example from the repository root with Node.js, for example:

```bash
node examples/minimal.ts
```

The prerequisites for model configuration and temporary database files are documented at the top of each example.
