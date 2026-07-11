# CURRENT — 当前状态(Integrator 每个工作段落结束更新)

更新于:2026-07-11 | 所在 Phase:**2 固化更可信(A 路线收尾已完成,待打 tag)**(前置 tag `phase-1-done`)

> 总纲 `PROJECT_PLAN.md`;决策 `DECISIONS.md`;固化质量报告 `bench/consolidation-baseline.md`;回归流程 `docs/internal/prompt-regression-runbook.md`。

## 刚完成:A 路线(Phase 2 收尾管道)三段全部落地 + 全量基线入库

本轮从 CURRENT 的 A/B/C 里走了 **A(收尾管道)**,四个提交成链(`c74b05c..431f028`):

- **A1 提示词版本化 + 哈希闸门**(`bc618f3`):8 条散落的提示词收敛到各模块 `prompts.ts`,`{id,version,text}`,由 `src/prompts/registry.ts` 聚合(**不经 index.ts 导出,公开 API 面零变化**)。新增 `tests/prompts/registry.test.ts` + `prompt-hashes.snapshot` 哈希闸门:改内容不 bump version → `npm test` 立刻红。**搬家逐字节无损**(搬家前后 16 个 sha256 全中,Integrator 独立复算)。字段 `system`→`text`(jsonRepairNudge 实际以 role:'user' 注入)。新增 `.gitattributes` 钉死两个机读快照为 LF —— 修了一个既有潜在 bug:`core.autocrlf=true` 且无 `.gitattributes` 时 fresh clone 把 `api-surface.snapshot` smudge 成 CRLF,api-freeze 在 Windows 新克隆假红(CI 跑 Linux 故没暴露)。
- **A2 评测器可归因**(`83eeec4`):meta 记 `promptVersions`;全量跑写 `baseline.{md,json}`,**部分跑(--limit/--discipline)只写 `bench/runs/`、绝不碰基线**;新增纯离线 `--compare <a.json> <b.json>`(0.167s,把 `consolidate: v1→v2` 与分数变化并排摆出,底部吐可粘贴的 commit 摘要)。**修了一个会毁基线的脚枪**:`--limit 0`/`abc` 曾落成假值→跑满 42 场景并覆盖基线,现在退化输入一律 exit 1。
- **A3 test:live + nightly**(`bf8242e`):`scripts/test-live.mjs` 三腿编排(live e2e + 固化全量42 + 检索真实臂),**缺 LLM key 直接 exit 1 不静默跳过**,腿2 只设崩溃门(errored>0)不设质量阈,embed 未配→腿3 大声跳过。nightly 去掉 `--if-present`、timeout 150min、传 artifact。**从 ci.yml 删掉死变量 SKIP_LIVE_LLM**(全仓无人读它)。记 **D-0010**(不建 fixtures:refresh)、**D-0011**(删 SKIP_LIVE_LLM)。runbook 入库。
- **全量基线入库**(`431f028`):在 bf8242e 上跑一次全量真实 mimo,**首次把 `.json` 与 `.md` 一起入库**(补齐前后对比链条起点 —— 此前只提交 .md,`git show HEAD:...json` 取不到)。结果 **95.1%(212/223),全绿 32/42,errored 0**,较 D-0009 记录的 v2 基线(94.2%/30)+2/+2、无回退 —— 在**全部 6 类纪律**上坐实提示词搬家真实模型侧无损。`--compare` self-compare 实跑 Δ=0、exit 0,工具链闭合。

## 已上线:整段历史推公开 main + nightly 首晚绿(2026-07-10)

- **推送**:此前 Phase 0-2 纯本地开发,远端停在 v0.5.1。本轮经人类逐条授权,把 25 提交(`e7d5ec4..0ec3006`)+ 后续 e2e 修复(`800adde`)快进推上**公开** `memoweft/memoweft` 的 main。`.env` 未跟踪、未泄露。详见记忆 `memoweft-repo-publish-state.md`。
- **secrets**:GitHub Actions 加了 3 个必需 LLM secret(`MEMOWEFT_LLM_BASE_URL/_API_KEY/_MODEL`,值来自本地 `.env` 的 `DLA_LLM_*`)。**故意不设 EMBED**(端点是 localhost、CI 不可达,设了反让腿3 变红)。key 经 stdin 喂 `gh secret set`,未落终端/日志。
- **nightly 首跑红→修→第二跑绿**:首跑暴露一个**既有 e2e bug**(`conflict.e2e.ts` 的 observed 证据没显式 `allowCloudRead:true`→云 tier 下被 distill 滤掉→6.9ms 空转失败;`800adde` 修)。**这个测试直到 nightly 接真实模型才第一次真跑**(本地 e2e 不加载 .env 全 skip、旧 nightly 空转)。第二跑(run 29116360383)**全绿 1h20m**:腿1 e2e 通过、腿2 固化 errored=0 结构 210/223 全绿 30/42(提示词版本 consolidate@v2 记入)、腿3 大声跳过。

## Phase 2 验收清单(§15 · 只差打 tag)

- [x] 语料库 42 场景、6 纪律各 7、覆盖矩阵达标
- [x] 评测器两级比对可跑,judge 3 次多数;基线报告入库(`bench/consolidation-baseline.{md,json}`)
- [x] 提示词版本化(A1)+ `test:live` 可用(A3);~~fixtures:refresh~~ → 作废见 D-0010
- [x] **nightly live job 首晚绿**(run 29116360383,test:live 通过)
- [ ] **打 tag `phase-2-done`**(发布动作,待人类点头 —— nightly 已绿,就差这一下)
- 强化项:§15.5 多模型分差矩阵未做 → 进 ROADMAP

## B 靶子经诊断为【度量假象】—— 已用质量线证伪(2026-07-10 只读 scout)

动手改提示词前先诊断了 CURRENT 原列的两个"B 靶子",结论:**两个都不是真缺陷,是度量退化**(依据见 baseline.json 逐场景明细):

- **conflict gistRecall=0.00 = 度量盲区,非质量缺陷**。gist 判官只看【落库认知的文本】(`eval-consolidation.mjs:129-133`),而 conflict 是靠"给旧认知打 conflicted 标 + 不造新认知"处理的(证据在计数器里、不在文本里)→ 这条路径**天生产不出可被 gist 匹配的文本**,gistRecall 恒为 0,与模型好坏无关。真实处理质量由**结构 40/42** 背书(且语料 `newCognitions.min=0` 明说可不落新认知)。叠加 D-0009 单跑噪声(CC-003 created=0 却抖出一票 YES)。**改提示词动不了这个数字。**
- **no-over-inference 29/34 = fact/state 类型口径分歧,非过度推断**。`overInferRate=0.00`、所有 `shouldNotFormGists` 陷阱 100% 躲过——真正的过度推断靶心全达标。挂掉的 5 分全是同一类 `created类型⊆{types}`:模型把"一次性完成事件/情绪残留"标 `fact`,语料期望 `state`,**两边都站得住,甚至可能是语料期望该松绑**。

→ **B 手里没有一个经得起结构硬指标检验的真靶子。** 若真要动,最划算的是一次**廉价的语料/度量清理**(见 ROADMAP Next:定 fact-vs-state 规范类型 / 让 conflict 的 gist 度量改看 conflicted 标而非落认知),而不是"改提示词→bump→跑全量→compare"的 77 分钟迭代。

## 下一步(待人类定向)

- **C. 转 Phase 3(适配器更稳,PROJECT_PLAN §16)** —— 证据推荐方向。开工照惯例:先只读 calibration scout 侦察 `packages/mcp-server` 与 `packages/adapter-ai-sdk`(AD-1…AD-6 契约、peer 版本矩阵、故障注入降级)。
- **B'(可选·低优先)**:上面那次廉价语料/度量清理(不是提示词战役);想让这两个数字"好看"时再做,已进 ROADMAP Next。
- 改提示词的完整流程(将来真需要时)见 `docs/internal/prompt-regression-runbook.md`。

## 环境 / 阻塞

- 无阻塞。本地 Ollama(bge-m3 @ 11435)本会话**未起**(检索真实臂要用才起:`ollama serve`)。固化走 mimo 云端 API,不依赖 ollama。
- 固化评测慢:实测 82–141s/场景,全量 42 场景约 77 分钟(CURRENT 旧记的 30s/场景是错的,已在评测器注释订正)。
- `.env`(gitignored,DLA_/MEMOWEFT_ 双前缀,mimo + bge-m3)本会话在。

## 本轮范围冻结(铁律 4)

host、采集插件、perception、asking、attribution、background、graph、portable、memory 管理 API —— 只在某 Phase 明确需要时才碰,否则进 ROADMAP Later。
