# 第 7 步 · 插件契约 v2（Core hooks + PluginContext）+ 采集器可插拔 · 任务书**草稿**

> **状态：施工完成 ✅（2026-07-06·分支 `step7/plugin-contract-v2`）——T1–T6 六卡全落地、逐卡三绿 + 提交；三包全绿（Core 217/217 + Host 33/33 + Collector 10/10）+ lint 0 错 + 零依赖；红线自证（`confidence.ts`/`cognition/`/`consolidation/`/`conversation.ts`/`ingest.ts` 全部零改动——hook 只在 createCore 方法层烧）。preview 真起验插件管理 tab；`examples/plugin-hook.ts` 实跑三 hook 全烧到。** 关键重塑：hook 在 **createCore 方法层**烧，`conversation.ts`/`ingest.ts` 不碰。
> 依据：`后续批次总纲.md` 第 7 步（第 28 行）+ `架构归位路线.md` §7.1 草案 + 五路现状勘察（2026-07-06，关键处主线亲验）。体例照 `tasks/step6-local-model-tier/`。
> 执行者：任何 AI 会话。开工前必读 `AGENTS.md`，然后只读本目录里自己领的那份分卡 + 它点名的源码文件。

## 批次目标

把插件契约从 v1（Host 内、只 experience、只 systemPrompt、hooks/PluginContext 全预留）升到 **v2**：hooks / PluginContext **从"预留"转正式**，支撑 tool / collector 类插件。落成四件事：

1. **Core 插件契约（7A 地基）**：`MemoWeftPlugin` + 类型化 hooks + `PluginContext` + 声明式 `PluginPermissions` 落进 **Core `src/plugin/`**、从 `index.ts` 导出（experimental）。
2. **Core hook 接线（7A 核心）**：`createMemoWeftCore` 收 `plugins?`；在既有写/读点烧 hook（`onUserMessage` / `onObservation` / `onLoad`），每个 hook 拿一个受限 `PluginContext`。
3. **Host 插件管理 UI**：Host 的 experience 那套 import Core 契约、把插件传给 core；加插件管理页——列**已注册**插件、类型、声明的权限、启停 / 换人设。
4. **采集器可插拔（7B）**：采样器按平台工厂化，Windows 采样器留、文档留好加平台的口子——**现只 Windows，mac/Linux 不写**（本机验不了，诚实优先）。

> **口径更新（作者 2026-07-06 拍板）**：v1 时期"别过早抽象 / 别太早做插件市场 / 采集器先只 Windows"的谨慎话术是**框架不成熟期**的。现框架已完善、该上功能——本步顺带把这些过期口径（`plugin.ts` 注释 / `架构归位路线.md`§7.1-7.2 / `boundaries.md`）更新成 v2 说法。

## 红线（本批任何卡都不许破）

- **不动认知纪律判定算法**（#1 校对焦点）：`consolidation/` 合并冲突、`confidence.ts`、`cognition/` 分型、记≠信。**hook 只能"观察 + 经 context 请求"，不能改管线**——hook 返回值**一律丢弃**（不回灌）、不改用户消息 / 不改回话文本 / 不绕记忆规则塞证据。
  - **PluginContext 用闭包构造、绝不持 store**（对抗校对补强）：`ctx = { submitObservation: (input)=>…, requestMemory: (query)=>… }` 两个绑好的匿名函数，**不把 stores/deps 对象交给插件**——插件够不到 `ctx.store`。
  - **submitObservation 强制 observed 默认、插件不能设授权位**（安全硬点）：其入参**不含** `allowCloudRead/allowLocalRead/allowInference`（只收 `kind/occurredAt/content/originId?/meta?`），一律走 `core.ingestObservation` → observedDefaults（cloud=false）。否则插件传 `allowCloudRead:true` 会因"显式 > 默认"（`ingest.ts:80-82`）绕过"observed 不上云"。这是 Host `sanitizeObservation` 剥授权位（`server.ts:170-174`）的 Core 侧等价。
- **插件出错不崩主流程**：每个 hook 调用 `await` + `try/catch` 包裹，插件抛错 → 记日志、**不崩会话 / 不崩摄入 / 不挡回话**（呼应 conversation 的"召回失败不挡"）。
- **零运行时依赖**：不为插件/采集器引任何 runtime dep。`package.json` `dependencies` 保持 `{}`；采集器包同样零依赖。
- **公开 API 加法非破坏**：`CreateCoreOptions.plugins?` 可选（不传 = 行为同旧）；插件契约整块标 **experimental**（pre-1.0 可演进）。`MemoWeftConfig` 形状不碰。
- **Core 无头**：Core 不画任何界面。插件管理 UI、权限展示/开关全在 **Host**；Core 只给机制（注册 / hook / 受限 context / 声明式权限门控）。草案 §7.1 的 `requestPermission` / `emitUIEvent` **不进 Core 的 PluginContext**。
- **合并已授权 AI 自主**（见记忆 merge-to-main-delegated）；但**碰核心红线的设计仍先问**（本步设计已过作者）。

## 现状底座（已亲验 · 2026-07-06）

- **插件契约 v1 现状**：`MemoWeftPlugin` = `{ id, name, type:'experience', systemPrompt }`（`apps/memoweft-host/src/experiences/plugin.ts:32-52`）；hooks / permissions / PluginContext 全是**注释预留**（`:54-69`）。注册表在 `experiences/index.ts:16-45`（REGISTRY = plain/xingyao）；切人设走 Host `POST /api/experience` + `dropConversation` 重建实例（`server.ts:275-293`）。Core `src/index.ts` **无任何 plugin 导出**——契约完全在 Host。
- **设计草案**（`架构归位路线.md:674-709` §7.1）：`MemoWeftPlugin{ id,name,type:'experience'|'tool'|'collector', permissions?, systemPrompt?, onLoad?, onUserMessage?, onObservation? }`（hook 草案是松散 `Function`）；`PluginContext{ submitObservation, requestMemory, requestPermission, emitUIEvent }`。均"建议"、未定死。
- **hook 落点**（已确认）：
  - `onUserMessage`：**烧在 `createCore.ts:207` `handleConversationTurn` 方法层**——`convo.handle()` 返回 `TurnOutcome`（含 `storedEvidence`/`reply`）后烧，观察这轮。`conversation.ts` 本体不动（纯逻辑保干净）。
  - `onObservation`：`perception/ingest.ts:55` `ingestObservations` 落库循环（`:72-84`）后。
  - `onLoad`：`createMemoWeftCore`（`createCore.ts:155`）建 core 时。
- **摄入口现成**：`ingestObservations`（`ingest.ts:55`）已是 `submitObservation` 的天然实现（授权位显式 > observedDefaults，`:80-82`）。`Observation`（`ingest.ts:19-34`）已是 **stable 跨层契约**（契约文档 §56 `memory-surface-contract.md:174`）。
- **召回现成**：`recallCognitions`（`retrieval/recall.ts`）= `requestMemory` 的实现；`core.recall`（`createCore.ts:203`）已封装。
- **采集器现状**：`@memoweft/collector-active-window`（独立包·`plugins/collector-active-window/`）走 Host `/api/observe`→`core.ingestObservation`。**只 Windows**：`win32Foreground.ts:18` 硬判 `process.platform==='win32'`，`:24-54` 用 user32.dll + PowerShell Get-Process。**采样器接口 `ForegroundSampler`（`activeWindowCollector.ts:38`）+ 采集循环本就平台无关**，只 sampler 实现是 Windows；`run.mjs:37-40` 直接平台检查不过就退出（无工厂）。
- **三绿面 = 3 个包**：根 Core（`npm run typecheck/test/build`，现 209/209）、Host（`@memoweft/host`·`typecheck`+`test`，现 32/32）、采集器包（`@memoweft/collector-active-window`·`typecheck`+`test`，`collector.test.ts`）。

## 决策（作者已拍板 2026-07-06）

| # | 决策 | 定案 |
|---|---|---|
| **D1** | 契约位置 | 落 **Core `src/plugin/`**，从 `index.ts` 导出（experimental）。Host 现有 experience 那套改成 import 它。 |
| **D2** | `MemoWeftPlugin` 形状 | `{ id, name, type:'experience'\|'tool'\|'collector', systemPrompt?, permissions?, onLoad?, onUserMessage?, onObservation? }`。hooks **类型化**（不是草案的松散 `Function`）：`onUserMessage?(msg: PluginUserMessage, ctx: PluginContext)`、`onObservation?(obs: Observation, ctx)`、`onLoad?(ctx)`。 |
| **D3** | `PluginContext`（Core） | **只 `{ submitObservation(input), requestMemory(query) }`**（Core 能真执行的），**闭包构造、不持 store**（见红线）。`submitObservation` 入参不含授权位（强制 observed 默认）。草案的 `requestPermission` / `emitUIEvent` **不进 Core**——那是 Host/UI 的事。 |
| **D4** | hook 语义 | **观察 + 经 context 请求，不改管线**（红线）：hook 返回值**丢弃**、不改用户消息 / 回话；落观察只能走 `submitObservation`（同 observed 规则、不能设授权位）。`requestMemory` 返回"与 query 相关"的召回认知（受 `topK/minSimilarity` 约束）——v2 不按 contentType 细分权限，声明式权限只门控"能不能调 requestMemory"这个能力（信任模型写进文档）。 |
| **D5** | 权限模型 | **声明式**：`permissions` 声明要哪些能力（如 `submitObservation` / `requestMemory`）；Core 按声明**门控** PluginContext 方法（没声明就调不到、抛错或 no-op+日志）。Host UI 据声明**展示 + 启停**。动态 `requestPermission`（弹窗）不做。 |
| **D6** | 注册与接线（**方法层烧·对抗校对重塑**） | `CreateCoreOptions` 加 `plugins?: MemoWeftPlugin[]`；Core 建插件注册表。**hook 全在 `createCore.ts` 方法层烧，不碰 `conversation.ts`/`ingest.ts` 纯逻辑**：`onUserMessage` 在 `handleConversationTurn`（`:207`）拿到 `convo.handle` 的 `TurnOutcome` 后烧（观察"这轮说了啥/回了啥"）；`onObservation` 在 `ingestObservation` 方法（`:194`）拿到 `ingestObservations` 的 `stored` 后、逐条烧；`onLoad` 在工厂返回 core 前烧。每 hook `await`+`try/catch`（出错不崩；因烧在核心工作**之后**，只加尾部延迟、不改已生成的回话/已落的证据）。 |
| **D7** | Host 管理 UI 范围 | **管理已注册插件**：列内置/注册的插件 + 类型 + 声明权限 + 启停 / 换人设。**不做**动态装卸外部包（模块动态加载 = 插件市场，§7.1 说别做）。 |
| **D8** | 7B 采集器 | 采样器**按平台工厂化**（`run.mjs` / sampler 层按 `process.platform` 选）；Windows 采样器留；文档留好加平台口子。**mac/Linux 不写**（本机验不了，诚实优先，不造验不了的代码）。 |
| **D9** | 旧口径更新 | 把 v1 谨慎话术（`plugin.ts` 注释 / §7.1-7.2 / `boundaries.md` 相关）更新成 v2 说法（框架已成熟）。 |
| **D10** | systemPrompt 归属（**消歧·对抗校对**） | 插件**实例**只定义一处 = Host 的 `experiences/`（plain/xingyao 作为 `MemoWeftPlugin` 对象，import Core 的 `MemoWeftPlugin` 类型）。Host **照旧**每轮从这份注册表取 `.systemPrompt` 传给 `handleConversationTurn`（现状不变）；**同一批插件对象**再传给 `createMemoWeftCore(options.plugins)` 供 Core 烧 hook + 管理 UI 枚举。→ **无双份 systemPrompt**：一处定义，Host 读 `.systemPrompt`、Core 读 `.on*` hook。Core 不另存 systemPrompt 副本。 |
| **D11** | PluginContext 绑 subject | v1 单人单宿主：ctx 在**每个 hook 烧点**绑当次 subject——`onUserMessage`→该轮 subject（`input.subjectId ?? config.identity.subjectId`）、`onObservation`→该次摄入 subject、`onLoad`→`config.identity.subjectId`。`submitObservation`/`requestMemory` 用绑定的 subject（不需插件传 subjectId）。 |
| **D12** | onLoad 时序 | 烧在 `createMemoWeftCore` **返回 core 前、stores/retriever/pool 全初始化后**（此时 `submitObservation` 必成、`requestMemory` 可用但新库可能空）。顺序：openStores → retriever → pool → 建 registry → `foreach plugins: await onLoad(ctx)` → return。 |

## 任务清单（6 卡 · 待终审后拆独立施工卡）

| 序 | 卡 | 一句话 | 大小 | 碰核心? | 依赖 |
|---|---|---|---|---|---|
| **T1** | Core 插件契约地基 | `src/plugin/`：`MemoWeftPlugin` / `PluginContext` / `PluginPermissions` / hook 类型 / `PluginUserMessage` / `PluginObservationInput`（不含授权位）；`index.ts` 导出（experimental） | 小-中 | 否（纯类型 + 导出） | 无（奠基） |
| **T2** | Core hook 接线 + 注册 + context 实现（**createCore 为主**） | `CreateCoreOptions.plugins?`；插件注册表；**全在 `createCore.ts` 方法层烧 hook**（`onLoad` 返回前、`onUserMessage` 在 `handleConversationTurn` 后、`onObservation` 在 `ingestObservation` 后）——**`conversation.ts`/`ingest.ts` 不动**；`PluginContext` 闭包实现（`submitObservation`→`core.ingestObservation` 剥授权位、`requestMemory`→recall）+ 声明式权限门控 + 每 hook `try/catch` | 中-大（**最核心**·集中在 createCore） | 邻近·**不动判定算法**·守"观察不改管线" | 依赖 T1 |
| **T3** | Host 迁契约 + 插件管理 UI | plain/xingyao 改成 import Core 的 `MemoWeftPlugin` 类型（实例仍在 Host·D10）；Host 把 plugins 传 `createMemoWeftCore`；插件管理页（列已注册/类型/声明权限/启停/换人设）+ 端点。核对 `experiences.test.ts` 是否随类型迁移要小改 | 中-大（Host） | 否 | 依赖 T1/T2 |
| **T4** | 采集器采样器可插拔（7B） | 新 `createForegroundSampler(): ForegroundSampler \| null` 工厂（按 `process.platform`·非 Windows 回 `null`）；Windows 采样器留；`run.mjs` 改用工厂（`null`→"未支持平台 + 怎么加"提示）；`collector.test` 验非 Windows 回 null + 支持路径；README/boundaries 声明"现只 Windows + 加平台口子 + 禁引 npm 包" | 中（采集器包） | 否 | 独立（可并行 T1/T2/T3） |
| **T5** | 测试 + **活体 demo** | Core：三 hook 各烧到、context 两法通、**权限门控**（没声明调不到）、**安全隔离**（插件够不到 `ctx.store`、`submitObservation` 传 `allowCloudRead:true` 最终仍 cloud=false、hook 返回值被丢弃不改管线）、抛错不崩；**一个能跑的最小 demo 插件**（如 onObservation 计数/日志）证明 hook 端到端活着（不是纯测试桩）；Host：管理 UI 端点；采集器：工厂测试 | 大 | 否 | 依赖 T2/T3/T4 |
| **T6** | 文档 + 契约 + CHANGELOG + 旧口径 | **新建 `docs/plugin-contract.md`**（MemoWeftPlugin/PluginContext/权限/hook 定级 experimental + "pre-1.0 hook 签名可演进"）；`memory-surface-contract.md` 只引用不重复；更新 `plugin.ts` 注释 / §7.1-7.2 / `boundaries.md` 为 v2 口径；CHANGELOG | 中 | 否 | 依赖 T1-T5 |

> **对抗校对确认的诚实前提（作者已知并拍板要做）**：v2 hook 现在**没有生产消费者**——experience 靠 systemPrompt、现采集器走"POST /api/observe"老路（不消费 onObservation）。v2 是给**将来的 tool / hook 型采集器**铺基础设施。T5 的活体 demo 证明基础设施真能跑，但真实消费者待后续。这是作者拍板"框架已成熟、先把能力铺好"的自觉选择，非疏漏。

## 并行冲突图

**热点文件与抢占方**：
- `src/core/createCore.ts`：**T2 全占且集中于此**（options.plugins + 注册表 + 三处方法层烧 hook + PluginContext 闭包实现）。
- `src/pipeline/conversation.ts`、`src/perception/ingest.ts`：**T2 不碰**（hook 改到方法层烧，纯逻辑保持干净——对抗校对重塑）。
- `src/index.ts`：T1（导出契约）。
- `apps/memoweft-host/src/*`：T3 全占。
- `plugins/collector-active-window/*`：T4 全占，与 T1-T3 零冲突（可任意波并行）。

**建议波次**：波1 = **T1**（契约奠基，单独合）**+ T4**（采集器独立，可并行）→ 波2 = **T2**（Core 核心接线，几乎只动 createCore）→ 波3 = **T3**（Host，踩 T2）→ 波4 = **T5**（测试 + 活体 demo，踩成品）**+ T6**（文档）。

## 批次验收（草案 · 全批合完跑一遍）

- [ ] **hook 通**：注册一个带 `onUserMessage`/`onObservation`/`onLoad` 的测试插件，三个 hook 各在对应点被烧到、拿到 `PluginContext`。
- [ ] **context 通**：`submitObservation` 真落成 observed 证据（授权位按 observed 规则）；`requestMemory` 真返召回认知。
- [ ] **权限门控**：没声明 `submitObservation` 权限的插件调它 → 被挡（抛错/no-op+日志），没绕过去。
- [ ] **安全隔离（红线）**：插件**够不到** `ctx.store`/`cognitionStore`（闭包挡住）；`submitObservation({...})` 无授权位入口，就算插件想传 `allowCloudRead:true` 也**落成 cloud=false**（observed 默认）；hook **返回值被丢弃**，返回改后的消息/证据也不影响管线。
- [ ] **纪律守恒（红线）**：插件**无法**改用户消息/回话文本、**无法**绕 observed 规则把证据标成上云或塞进画像；`consolidation`/`confidence.ts`/`cognition/`/`conversation.ts`/`ingest.ts` 在 diff 里零改动（hook 只在 `createCore.ts` 方法层烧）。
- [ ] **兜错**：hook 抛错 → 会话照常回、摄入照常落、不崩进程。
- [ ] **不传 plugins 行为同旧**：`createMemoWeftCore` 不给 plugins → 与本步前逐字节一致。
- [ ] **Host 管理 UI**：列出已注册插件 + 类型 + 声明权限；能启停 / 换人设；apiKey 等敏感项不外泄。
- [ ] **采集器**：`run.mjs` 经工厂选 Windows 采样器照跑；非 Windows 平台走"未支持"分支 + 文档指明怎么加；采集器包三绿。
- [ ] **三绿 + 零依赖**：根 / Host / 采集器三包 typecheck+test（+根 build）全绿；`dependencies` 仍 `{}`；lint 不新增错。

## 本批明确不做

- **不做动态装卸外部插件包**（运行时模块加载 / 插件市场 / 沙箱 / 信任链）——管理已注册插件（D7）。
- **不做会改管线的 hook**（改回话 / 改用户消息 / 回灌返回值）——守纪律红线（D4）。
- **不把 `requestPermission` / `emitUIEvent` 放进 Core PluginContext**——UI 在 Host（D3）。
- **不写 mac/Linux 采样器**（本机验不了，只留工厂口子 + 文档，D8）。
- **不动认知纪律判定算法**、不引 runtime 依赖、不碰 `MemoWeftConfig` 形状。
- **不做动态 permissions 弹窗**（声明式够 v2，D5）。

## 对抗校对纪要（4 路 · 2026-07-06 · 关键项已主线亲验）

**采纳并入（真问题 → 已改任务书）**：
1. **hook 改到 createCore 方法层烧**（→ D6 重塑）：`ingestObservations`/`conversation.handle` 是干净纯逻辑，在方法壳层烧 hook 保住纯度，还一并消掉"Conversation 实例缓存 vs plugins 生命周期"的坑、大幅缩小爆炸半径。
2. **submitObservation 不能设授权位**（→ 红线/D3/D4）：入参剔掉授权位，强制 observed 默认——否则插件传 `allowCloudRead:true` 会因"显式>默认"绕过不上云。
3. **PluginContext 闭包构造、不持 store**（→ 红线）：只交两个绑好的匿名函数，插件够不到 store。
4. **hook 返回值丢弃 + 单测锁**（→ D4/T5）。
5. **systemPrompt 双注册表分裂消歧**（→ D10）：实例只定义在 Host 一处，Host 读 systemPrompt、Core 读 hook，无双份。
6. **onLoad 时序 + PluginContext 绑 subject**（→ D11/D12）。
7. 采集器工厂签名 `createForegroundSampler(): …|null`、契约独立 `plugin-contract.md`、submitObservation originId 幂等由插件负责——全收（T4/T6）。

**诚实前提（非 bug·作者已拍板）**：v2 hook 无生产消费者，是给将来铺路；T5 活体 demo 证明能跑。已在任务书 T6 下方明记。

**降级/暂不做**：`requestMemory` 按 contentType 细分权限——v2 不做（声明式只门控"能不能调"），信任模型写文档；采集器零依赖 CI 守卫（`npm ls --prod`）列为可选加固。

> 备注：4 路独立 Explore agent 读真代码产出（红线/正确性/完整性/可实现性）；主线对最高风险项（hook 烧点纯度、submitObservation 授权绕过、PluginContext 隔离、systemPrompt 归属、onObservation 纯函数）逐条亲验。

## 附 · 现状勘察证据索引（file:line · 已主线亲验）

- **契约 v1**：`apps/memoweft-host/src/experiences/plugin.ts:32-52`（MemoWeftPlugin）、`:54-69`（预留）、`experiences/index.ts:16-45`（REGISTRY）、`server.ts:275-293`（切换）、`src/index.ts`（无 plugin 导出）。
- **设计草案**：`架构归位路线.md:674-709`（§7.1 MemoWeftPlugin/PluginContext）、`:714-736`（§7.2 默认插件 + 后续插件清单）。
- **hook 落点**：`pipeline/conversation.ts:63-101`（handle，`:68` 存证据）、`perception/ingest.ts:55-88`（ingestObservations，`:72-84` 落库）、`core/createCore.ts:39-52`（CreateCoreOptions）、`:155/203/211`（工厂/recall/建 Conversation）。
- **摄入/召回现成**：`ingest.ts:19-34`（Observation stable）、`memory-surface-contract.md:174`（§56 Observation stable）、`retrieval/recall.ts`（recallCognitions）。
- **采集器**：`plugins/collector-active-window/src/win32Foreground.ts:18-54`（Windows 专有）、`activeWindowCollector.ts:38`（ForegroundSampler 接口·平台无关）、`run.mjs:37-40`（平台检查无工厂）、`activeWindow.ts:26-37`（Observation 产出）。
- **口径出处**：`后续批次总纲.md:28`（第 7 步）、`plugin.ts:9-19`（v1 三约束 + "别过早冻接口"）、`memory-surface-contract.md:208`（扩展点 experimental 体例）。
</content>
