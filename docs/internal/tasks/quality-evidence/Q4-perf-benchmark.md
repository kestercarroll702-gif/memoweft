# Q4 · 性能实测：灌 1 万条出真实数字

## 背景

评估者问「能撑多少」。现状无 perf 脚本、无实测数字。抓手现成：`src/consolidation/updateProfile.ts` 已有逐步计时，导出 `UpdateProfileTimings`（经 `src/index.ts` 出口），返回 `timings.totalMs`（`tests/cognition.test.ts` 已断言存在）。recall 走公共入口。本卡灌 1 万条 evidence → 读现成 timings 出 updateProfile 耗时、测 recall 延迟，把真实数字写进 README/docs。

**作者已拍板**：**只报真实数字、不设门**，且**注明测试环境（Node 版本 / 机器）**。

## 改哪里

1. **新建 `bench/bulk-updateProfile.mjs`**（独立脚本，不进 tests/ glob、不进 CI）：
   - **从 `dist` import，不要让 `.mjs` 直接 import `.ts`**。脚本从 `dist/index.js`（即 `package.json` 的 `main`）拿 `createMemoWeftCore` 等 [stable] 入口——因此**跑之前必须先 `npm run build`**。理由：项目 src 是 `.ts`、发布物经 dist，`.mjs` 直 import `.ts` 在未 build 或非原生剥类型的 Node 上跑不起来，验收会飘。脚本开头注释写明「先 npm run build」。
   - 装配用 `:memory:` 或临时库（勿混 dogfood 数据；按记忆「冒烟数据必清」跑完即清）。
   - 灌 1 万条造 evidence → 计时 `updateProfile`（读返回的 `timings.totalMs`，别另造计时）+ 计时 recall。
   - 灌数据思路可仿 `testbench/seed-dogfood.ps1` 但纯脚本化。
2. **`package.json` 的 `scripts`** 加 `"bench": "node bench/bulk-updateProfile.mjs"`（供手动跑）。可在脚本里或文档里提示「先 `npm run build` 再 `npm run bench`」。
3. **数字落文档**：把跑出的真实数字写进 README 一个 perf 段或 docs 独立 perf 文件，格式如「1 万条 evidence：updateProfile ≈ X ms，recall ≈ Y ms」，**并注明测试环境（Node 版本 / 机器规格）**——诚实标明本机数字非保证值。**不设阈值、不进 CI 硬门**（bench 慢且抖）。

## 不许动

- 不进 CI 硬门（只加 `bench` script 供手动跑）。
- 不改 `updateProfile` / `recall` 任何逻辑，只读现成 timings。
- 临时 / 测试库勿留残留数据（跑完即清，守「冒烟数据必清」）。
- 不引入新 runtime 依赖（脚本从 dist import，不新增任何依赖）。

## 验收（可执行核对）

- [ ] `npm run build && npm run bench` 能跑通并打印 updateProfile 耗时 + recall 延迟数字。
- [ ] `bench/bulk-updateProfile.mjs` 从 `dist/index.js` import（`grep "dist" bench/bulk-updateProfile.mjs` 命中；`grep -E "from ['\"].*\.ts['\"]" bench/bulk-updateProfile.mjs` 无命中——没有直接 import .ts）。
- [ ] `grep -c "\"bench\"" package.json` ≥ 1（script 已加）。
- [ ] README 或 docs 里有实测数字段，且注明测试环境（Node 版本 / 机器）。
- [ ] `node -e "console.log(JSON.stringify(require('./package.json').dependencies))"` 输出 `{}`（runtime 依赖仍空）。
- [ ] 跑完无残留测试库文件遗留在仓库（`git status` 干净）。
- [ ] 三绿：`npm run typecheck && npm test && npm run build` 全过。

## 发现待办

（若 1 万条暴露性能悬崖记这里，属观测不属本卡修。）
