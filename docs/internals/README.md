# How MemoWeft is built

Engineer-facing notes on how MemoWeft is built — the mechanism behind the [concepts](../concepts/). English single source.

- [`architecture.md`](./architecture.md) — evidence → event → cognition, the read/write paths, and how the cognitive disciplines land in code.
- [`boundaries.md`](./boundaries.md) — the long-term Core / Host / Plugin responsibility boundary (kept in Chinese).
- [`perf.md`](./perf.md) — measured performance numbers, reproducible.

For the public API surface see [reference/memory-surface-contract.md](../reference/memory-surface-contract.md). Maintainer-only ledgers (calibration, runbooks, feasibility) live under [`docs/internal/`](../internal/).
