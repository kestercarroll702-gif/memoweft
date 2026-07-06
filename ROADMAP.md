# Roadmap

MemoWeft is **library-first**. This repository remains focused on the MemoWeft library, its public API, adapters, examples, and the bundled reference host demo. Product hosts should live outside the Core library scope.

MemoWeft is pre-1.0. Public API stability tiers and the breaking-change policy are documented in the [Memory Surface Contract](./docs/memory-surface-contract.md).

## Current focus

- Make the public API easier to understand and integrate.
- Keep documentation and runnable examples aligned with the shipped package.
- Improve ecosystem adapters without adding runtime dependencies to Core.
- Maintain the reference host as a clear, bounded demonstration of Core capabilities.

## Next

- Recall quality v2: similarity thresholds, purpose and content filters, recall explanations, and negative feedback.
- More integration examples and framework adapters.
- Additional plugins that preserve the Core / Host / Plugin permission boundaries.

## Non-goals

- Turning the bundled reference host into the product.
- Expanding this repository into a desktop-product roadmap.
- Weakening the cognitive-discipline rules for convenience.
- Splitting the library into open and closed feature tiers.

Priorities may change as the public API approaches 1.0. Track concrete work in [GitHub issues](https://github.com/memoweft/memoweft/issues) and the active focus in [`CURRENT.md`](./CURRENT.md).
