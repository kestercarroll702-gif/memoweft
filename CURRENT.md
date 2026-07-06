# CURRENT.md · 当前任务白板

> 唯一的"现在该做什么"看板。只写**当前主线 + 允许做 + 不做 + 验收**。历史不写这儿——看 git 提交与 `CHANGELOG.md`。

## 当前状态：总纲第 1–8 步已完成（第 8 步已合 main 并推 origin），下一 = 第 9 步

- **第 1 步 · 0.3.0 补漏加固** ✅ 已发布 `memoweft@0.3.0`（npm latest）。
- **第 2 步 · 接口契约 Memory Surface Contract v1** ✅（合 `74b58c3`）。
- **第 3 步 · 质量证据** ✅（合 `1d09c55`）：eval 25 用例 + lint 关卡 + 覆盖率 97.42% + SECURITY/模板/维护声明 + perf 实测 + CI provenance。
- **第 4 步 · 英文化与模型兼容（0.4.0）** ✅（合 `feb713c`·分支 `step4/i18n-model-compat` T1–T6）**+ 已发 `memoweft@0.4.0`（npm latest·2026-07-05）**：双语层（`config.language` 缺省 en + `resolveLang`）+ 8 处提示词双语化、宿主/用户文案双语化、`temperature` 可配（`LLMConfig`+env 按 prefix 分 chat/write）、reasoning 剥 `<think>`+`extractJsonObject` 括号配平、`hostId` 默认改 `local`、examples 扩到 3（以包名入口）、INSTALL/integration 英文化（`.zh-CN` + 互链）+ 明文落盘声明。三绿 202/202 + lint 0 + 零依赖。
- **第 5 步 · 图谱前端 G2** ✅（合 `9496a3d`·分支 `step5/graph-frontend-g2`）：Host 加只读 `GET /api/memory-graph`（走 `core.graph` 门面）；记忆管理页加「记忆图谱」tab——**手搓 canvas 力导向图（零依赖）** + 丰富交互（拖/缩放/过滤/边类型图例/搜索/详情/重置）。preview 真起 Host 只读渲染真数据验过（12 节点/14 边、力模拟冷却、全交互无报错）。Core 202/202 + Host 27/27 + lint 0。

- **第 6 步 · 本地模型档 2（cloud/local tier 路由）** ✅ 已合 main 并推 origin（merge `ff92d33`·T1–T6·分支已删）：写路径隐私关 `filterCloudReadable`→`filterReadableByTier(items, tier)`（cloud 筛 `allowCloudRead` / local 筛 `allowLocalRead`）；`MEMOWEFT_WRITE_LLM_TIER=local` 让本地写模型消化 observed（默认不上云）成画像——采集线真闭环。含覆盖修复（distill 只覆盖真消化的、被挡留 pending 可再扫）+ `allowInference` 门三处一致 + 挂账信号 `tierBlockedCount` + 向导 tier 字段/风险提醒。**不动认知判定算法（confidence.ts/cognition 零改）**、零依赖。根 209/209 + Host 32/32 + lint 0。任务书 / 拍板 D1–D8 / 对抗校对纪要见 `docs/internal/tasks/step6-local-model-tier/`。

- **第 7 步 · 插件契约 v2（Core hooks + PluginContext）+ 采集器可插拔** ✅ 已合 main 并推 origin（merge `343a65e`·T1–T6·分支已删）：插件契约进 Core `src/plugin/`（导出·experimental）；`createMemoWeftCore({ plugins })` + 三 hook（`onLoad`/`onUserMessage`/`onObservation`）**在方法层烧、只观察不改管线**；受限 `PluginContext`（`submitObservation` 剥授权位 + `requestMemory`）**闭包给不持 store**、声明式权限门控；Host 迁 Core 契约 + 记忆管理页「插件」tab（`GET /api/plugins`）；采集器采样器按平台工厂化（现只 Windows·mac/Linux 留口子不写）；`examples/plugin-hook.ts` 活体 demo。**红线：`confidence.ts`/`cognition/`/`consolidation/`/`conversation.ts`/`ingest.ts` 全部零改动**、零依赖。三包全绿（Core 217/217 + Host 33/33 + Collector 10/10）。任务书 / 拍板 D1–D12 / 对抗校对纪要见 `docs/internal/tasks/step7-plugin-contract-v2/`；契约文档 `docs/plugin-contract.md`。

- **第 8 步 · 生态获客（0.5.0）** ✅ 已合 main 并推 origin（merge `7471e0a`·分支已删）：token 用量观测进 Core（`core.usage()` 累计总账·llm/embed 分桶去重·Host `GET /api/usage`；接回响应里被丢弃的 usage·只给原始计数不内置价目表·usage 不入 confidence·端点不回 usage 不崩）+ 新增两个可发布外部集成包：`@memoweft/mcp-server`（`@modelcontextprotocol/sdk` stdio server·**6 tool 白名单**：recall/list×3/graph 读 + ingestUserMessage 写·轻；破坏性面/改上云授权/整套消化改画像**一律不注册**·描述中性无人设）与 `@memoweft/adapter-ai-sdk`（读=`wrapLanguageModel` middleware 经 transformParams 注入召回·照 knowledgeBlock 口径；写=onEnd 存用户原话·闭包捕获不从结果回捞·不存助手回话）。第三方 SDK 只进各自包、**Core 主包 dependencies 仍 {}**；主包 bump 0.4.0→0.5.0。五包三绿（Core 222 + Host 33 + Collector 10 + mcp-server 5 + adapter 15）+ lint 0 error；**红线自证 confidence/cognition/consolidation/conversation/ingest 全零改动**。任务书 / 拍板 D1–D11 / 对抗校对纪要见 `docs/internal/tasks/step8-ecosystem/`。

**下一主线 = 总纲第 9 步**（见 [`docs/internal/tasks/后续批次总纲.md`](./docs/internal/tasks/后续批次总纲.md)，开工前细化成施工任务书）。

## 待作者手动（发布 / 平台侧尾巴，AI 做不了）

- **0.5.0 npm 发布**：`npm publish --workspaces --provenance --access public`（自动跳过 private 的 host/collector；按 workspaces 顺序 memoweft 先发，满足新包 peer `^0.5.0`）。发布前先 `--dry-run` 核一遍（`--workspaces`+`--provenance` 组合在旧 npm 有坑，用 Node24 自带的新 npm）。`@memoweft` scope 归属需确认。
- **MCP registry 收录**（`@memoweft/mcp-server`「本地能跑不算完」）：`packages/mcp-server/server.json` 已备好（`name`/`mcpName` 占位 `io.github.memoweft/memoweft`，须确认命名空间归属）；装 `mcp-publisher` CLI → `mcp-publisher login github`（**本机没装 gh**）→ `mcp-publisher publish`；验收 = registry API 搜得到。
- **`v0.5.0` tag + GitHub Release**：`git tag v0.5.0 && git push origin v0.5.0`（触发 CI publish job，前提是 `NPM_TOKEN` secret 已托管）。
- **本地模型端点 usage 真机验**（第 6 步 local tier 场景）：llama.cpp/ollama/vLLM 到底回不回 usage、字段全不全——配好本地模型的机器实测（现"读到才加"容错逻辑已就位）。
- **第 4 步真模型 e2e 英文验**（0.4.0 唯一未闭验收）：配好模型的机器上，真 LLM 跑 `tests/eval/cognition-discipline.eval.e2e.ts` 换**英文对话输入**，验三纪律（冲突暴露 / 情绪封顶 / 记≠信）在英文侧真生效——离线 eval 只断结构、证不了这个。
- **`v0.4.0` tag + GitHub Release**（若未打）：`git tag v0.4.0 && git push origin v0.4.0`。
- **Q5 provenance 发布**：往 GitHub secrets 放 `NPM_TOKEN` → 打 `v*` tag 触发 publish job。
- **GitHub 仓库设置**：开启 "Private vulnerability reporting"。
- **覆盖率徽章**：CI（ubuntu Node24）跑出后按其 "all files" line% 再校。

## 发现待办（不阻塞，回头清）

- lint 6 个警告（存量）：4 个未用变量 + `tests/store.test.ts` 两处 `@ts-expect-error` 缺说明。松档已降 warn、不阻断；清理时给未用变量加 `_` 前缀 / 给 ts-comment 补一句说明即可。
- README `Node ≥24` 徽章与 `engines>=20` 口径可再对齐（≥24 是零依赖路径，20/22 走可选 `better-sqlite3`）。

## 后期前端打磨待办（功能都通了再统一打磨 · 作者拍板 2026-07-05）

> 前端显示/反馈的打磨排到最后，现在不过度雕；桌面端后续要做、先留改造空间（web 前端别过度定制）。
- **S0「它记住我 N 件事」记忆胶囊 = demo 脚手架** → 后期改成朴素的「记忆管理」入口（demo 是为证明"它真记住了"，稳定后不用一直留这拟人化提示）。
- **「你说过的（记忆线索）」tab 口径**：evidence ≈ 原话/对话记录 → 后期或重构为「对话记录」这类更直白的说法。
- **记忆图谱（G2）力参数 / 视觉**：斥力/弹簧/聚拢是手调经验值，节点多时可能挤/散；随前端打磨一起在真库上调（毛线球收敛度）。
- **桌面端优化**：后续做桌面客户端时前端要重整，现在 web 端保持克制、留改造口子。

## 后续总排序

第 6 步 → … → 第 10 步收口 1.0，商用线 + 功能线合排共 11 步，见 [`docs/internal/tasks/后续批次总纲.md`](./docs/internal/tasks/后续批次总纲.md)——每步开工前才细化成施工任务书。
