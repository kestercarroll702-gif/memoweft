# CURRENT.md · 当前任务白板

> 唯一的"现在该做什么"看板。只写**当前主线 + 允许做 + 不做 + 验收**。历史不写这儿——看 git 提交与 `CHANGELOG.md`。

## 当前主线：质量证据（Quality Evidence）· 总纲第 3 步

回答评估者两问「凭什么信」和「能撑多少」：eval 用例证明认知纪律真生效、lint + 覆盖率关卡、SECURITY / issue·PR 模板 / 维护声明、perf 实测数字、CI provenance 发布。**这批有代码也有文档，但不改核心运行时逻辑、不动认知纪律判定算法——只给它加断言证据。**

**施工任务书五份 + 总览，在 [`docs/internal/tasks/quality-evidence/`](./docs/internal/tasks/quality-evidence/README.md)**：Q1 lint+覆盖率 / Q2 eval 套件 / Q3 信任文档 / Q4 perf 实测 / Q5 provenance 发布。Q1/Q2/Q4 可并行，Q3 排 Q2 后。7 项设计选择作者已拍板（见 README）。

## 允许做

- Q1–Q5 任务书写明的事，按"改哪里 / 不许动 / 验收"执行。
- lint / coverage / bench 工具进 **devDependencies**。

## 不做（本主线明确不碰）

- ❌ 改 `src/consolidation/` 的置信度算法 / 认知纪律判定逻辑（`confidence.ts` / `consolidate.ts` / `model.ts`）——eval 只加断言，不改算法迁就测试；断言跑红=发现真 bug，停下问。
- ❌ 加任何 runtime 依赖（`dependencies` 保持 `{}`）。
- ❌ lint 扫出的 `src` 存量问题本批不修，记"发现待办"。
- ❌ Q5 的 npm token 托管由作者手动（GitHub secrets），AI 不代做、不写死 token。

## 验收

- 每任务对应任务书验收清单全勾 + `npm run typecheck && npm test && npm run build` 三绿。全批合完跑 README 的"批次完成验收"。

---

## 已完成上一主线：接口契约 Memory Surface Contract v1 ✅（2026-07-05 · 合 `74b58c3`）

S2-1 写 `docs/memory-surface-contract.md` + S2-2 给 `src/index.ts` 贴稳定性标签（导出符号 170→170 不变、零运行时改动），已合 main。

## 已发布：memoweft@0.3.0（npm latest）

发布尾巴（作者手动）：main 推 origin、tag `v0.3.0`、GitHub Release；CI 矩阵在真 Node 20/22 上验 better-sqlite3 路径。

## 后续总排序

第 3 步（当前）→ … → 第 10 步收口 1.0，商用线 + 功能线合排共 11 步，见 [`docs/internal/tasks/后续批次总纲.md`](./docs/internal/tasks/后续批次总纲.md)——每步开工前才细化成施工任务书（`quality-evidence/` 这套即样板）。
