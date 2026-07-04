# CURRENT.md · 当前任务白板

> 唯一的"现在该做什么"看板。只写**当前主线 + 允许做 + 不做 + 验收**。历史不写这儿——看 git 提交与 `CHANGELOG.md`。

## 当前状态：总纲第 1–3 步已完成，等开工第 4 步

- **第 1 步 · 0.3.0 补漏加固** ✅ 已发布 `memoweft@0.3.0`（npm latest）。
- **第 2 步 · 接口契约 Memory Surface Contract v1** ✅（合 `74b58c3`）：`docs/memory-surface-contract.md` + `src/index.ts` 稳定性分级注释。
- **第 3 步 · 质量证据** ✅（合 `1d09c55`）：eval 25 用例断言认知纪律三条（冲突暴露 / 情绪封顶 / 记≠信）、ESLint 松档关卡 + 覆盖率 97.42%、SECURITY / issue·PR 模板 / 维护声明、perf 实测（10k 条 `updateProfile` ≈ 462ms）、CI provenance 发布配置。三绿 194/194 + lint 绿。

**下一主线 = 总纲第 4 步：英文化与模型兼容（0.4.0）**——提示词 / 兜底文案抽中英双语层、INSTALL / integration 英文版、examples 扩到 3 个、temperature 可配、hostId 默认名改。**待作者拍板开工后细化成施工任务书**（`quality-evidence/` 那套即样板）。

## 待作者手动（发布 / 平台侧尾巴，AI 做不了）

- **Q5 provenance 发布**：往 GitHub secrets 放 `NPM_TOKEN`（npm automation token）→ 打 `v*` tag 触发 publish job（`npm publish --provenance`）。
- **GitHub 仓库设置**：开启 "Private vulnerability reporting"，`SECURITY.md` 的私密报告链接才生效。
- **覆盖率徽章 97.42%**：本机数；CI（ubuntu Node24）跑出后按其 "all files" line% 再校一次。

## 发现待办（不阻塞，回头清）

- lint 6 个警告（存量）：4 个未用变量 + `tests/store.test.ts` 两处 `@ts-expect-error` 缺说明。松档已降 warn、不阻断；清理时给未用变量加 `_` 前缀 / 给 ts-comment 补一句说明即可。
- README `Node ≥24` 徽章与 `engines>=20` 口径可再对齐（≥24 是零依赖路径，20/22 走可选 `better-sqlite3`）。

## 后续总排序

第 4 步 → … → 第 10 步收口 1.0，商用线 + 功能线合排共 11 步，见 [`docs/internal/tasks/后续批次总纲.md`](./docs/internal/tasks/后续批次总纲.md)——每步开工前才细化成施工任务书。
