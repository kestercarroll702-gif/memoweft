# CLAUDE.md

MemoWeft 是可移植的 AI 长期记忆库(npm 包 `memoweft`):区分事实与猜测,置信度由规则算、不由 LLM 自报,冲突只暴露不裁决。库本体在 `src/`;`apps/memoweft-host` 是参考宿主(demo,非产品);`plugins/` 是采集/体验插件。

**接手先读**:`AGENTS.md`(工程纪律 + Integrator 章程)与 `PROJECT_PLAN.md`(升级总纲)。当前状态 `CURRENT.md`,关键决策 `DECISIONS.md`,校准事实 `docs/internal/phase0-calibration.md`。

**常用命令**:`npm test` · `npm run typecheck` · `npm run build` · `npm run api:check` · `npm run api:update`(慎用)。
