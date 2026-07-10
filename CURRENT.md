# CURRENT — 当前状态(Integrator 每个工作段落结束更新)

更新于:2026-07-11 | 所在 Phase:**2 固化更可信(A 路线收尾已完成,待打 tag)**(前置 tag `phase-1-done`)

> 总纲 `PROJECT_PLAN.md`;决策 `DECISIONS.md`;固化质量报告 `bench/consolidation-baseline.md`;回归流程 `docs/internal/prompt-regression-runbook.md`。

## 刚完成:A 路线(Phase 2 收尾管道)三段全部落地 + 全量基线入库

本轮从 CURRENT 的 A/B/C 里走了 **A(收尾管道)**,四个提交成链(`c74b05c..431f028`):

- **A1 提示词版本化 + 哈希闸门**(`bc618f3`):8 条散落的提示词收敛到各模块 `prompts.ts`,`{id,version,text}`,由 `src/prompts/registry.ts` 聚合(**不经 index.ts 导出,公开 API 面零变化**)。新增 `tests/prompts/registry.test.ts` + `prompt-hashes.snapshot` 哈希闸门:改内容不 bump version → `npm test` 立刻红。**搬家逐字节无损**(搬家前后 16 个 sha256 全中,Integrator 独立复算)。字段 `system`→`text`(jsonRepairNudge 实际以 role:'user' 注入)。新增 `.gitattributes` 钉死两个机读快照为 LF —— 修了一个既有潜在 bug:`core.autocrlf=true` 且无 `.gitattributes` 时 fresh clone 把 `api-surface.snapshot` smudge 成 CRLF,api-freeze 在 Windows 新克隆假红(CI 跑 Linux 故没暴露)。
- **A2 评测器可归因**(`83eeec4`):meta 记 `promptVersions`;全量跑写 `baseline.{md,json}`,**部分跑(--limit/--discipline)只写 `bench/runs/`、绝不碰基线**;新增纯离线 `--compare <a.json> <b.json>`(0.167s,把 `consolidate: v1→v2` 与分数变化并排摆出,底部吐可粘贴的 commit 摘要)。**修了一个会毁基线的脚枪**:`--limit 0`/`abc` 曾落成假值→跑满 42 场景并覆盖基线,现在退化输入一律 exit 1。
- **A3 test:live + nightly**(`bf8242e`):`scripts/test-live.mjs` 三腿编排(live e2e + 固化全量42 + 检索真实臂),**缺 LLM key 直接 exit 1 不静默跳过**,腿2 只设崩溃门(errored>0)不设质量阈,embed 未配→腿3 大声跳过。nightly 去掉 `--if-present`、timeout 150min、传 artifact。**从 ci.yml 删掉死变量 SKIP_LIVE_LLM**(全仓无人读它)。记 **D-0010**(不建 fixtures:refresh)、**D-0011**(删 SKIP_LIVE_LLM)。runbook 入库。
- **全量基线入库**(`431f028`):在 bf8242e 上跑一次全量真实 mimo,**首次把 `.json` 与 `.md` 一起入库**(补齐前后对比链条起点 —— 此前只提交 .md,`git show HEAD:...json` 取不到)。结果 **95.1%(212/223),全绿 32/42,errored 0**,较 D-0009 记录的 v2 基线(94.2%/30)+2/+2、无回退 —— 在**全部 6 类纪律**上坐实提示词搬家真实模型侧无损。`--compare` self-compare 实跑 Δ=0、exit 0,工具链闭合。

## ⚠ 需要人类做的一次性动作(nightly 上线的最后一步)

nightly(`.github/workflows/nightly.yml`)每天 UTC 18:00 跑 `npm run test:live`。**在 GitHub 仓库 Settings → Secrets and variables → Actions 添加 secrets 之前,nightly 会红 —— 这是有意的**(红着提醒"真实线还没接通",好过绿着什么都没跑):
- `MEMOWEFT_LLM_BASE_URL` / `MEMOWEFT_LLM_API_KEY` / `MEMOWEFT_LLM_MODEL`(**必需**)
- `MEMOWEFT_EMBED_BASE_URL` / `_API_KEY` / `_MODEL`(可选;不配则检索真实臂大声跳过。注:本地 Ollama 端点 CI 不可达,云端 embed 才有意义)

加完 secrets 手动 `workflow_dispatch` 触发一次,首晚绿了即可打 tag `phase-2-done`(见下)。

## Phase 2 验收清单(§15 · 就差 tag)

- [x] 语料库 42 场景、6 纪律各 7、覆盖矩阵达标
- [x] 评测器两级比对可跑,judge 3 次多数;基线报告入库(`bench/consolidation-baseline.{md,json}`)
- [x] 提示词版本化(A1)+ `test:live` 可用(A3);~~fixtures:refresh~~ → 作废见 D-0010
- [ ] **nightly live job 首晚绿**(待人类加 secrets → dispatch)
- [ ] **打 tag `phase-2-done`**(nightly 首绿后)
- 强化项:§15.5 多模型分差矩阵未做 → 进 ROADMAP

## 下一步(待人类定向)

- **收尾 Phase 2**:人类加 nightly secrets → 首晚绿 → 打 tag `phase-2-done`。(唯一卡在人类侧的动作)
- **B. 继续用质量线修**(现在修一个问题的成本已被 A 打下来了):
  - `conflict` gistRecall=0.00(不落行为认知)—— 全量基线复现,是最明确的靶子
  - `no-over-inference` 结构 29/34(6 纪律里最低)、偶发过度推断
  - 改提示词的完整流程见 `docs/internal/prompt-regression-runbook.md`,改一条 → bump version → prompts:update → 跑全量 → --compare。
- **C. 转 Phase 3**(适配器更稳)或其它。

## 环境 / 阻塞

- 无阻塞。本地 Ollama(bge-m3 @ 11435)本会话**未起**(检索真实臂要用才起:`ollama serve`)。固化走 mimo 云端 API,不依赖 ollama。
- 固化评测慢:实测 82–141s/场景,全量 42 场景约 77 分钟(CURRENT 旧记的 30s/场景是错的,已在评测器注释订正)。
- `.env`(gitignored,DLA_/MEMOWEFT_ 双前缀,mimo + bge-m3)本会话在。

## 本轮范围冻结(铁律 4)

host、采集插件、perception、asking、attribution、background、graph、portable、memory 管理 API —— 只在某 Phase 明确需要时才碰,否则进 ROADMAP Later。
