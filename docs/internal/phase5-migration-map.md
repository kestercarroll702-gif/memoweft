# Phase 5 文档迁移映射表(§18.2 要求·先过目再动手)

生成于 2026-07-11。来源:5 侦察员并行盘点(getting-started/concepts/internal 三组扎实,readme/recipes 由 Integrator 补齐)。执行前的蓝图——doc-writer 照此动手,旧路径留 301 跳转桩一个版本周期。

## Integrator 拍板的三个决策(§18.2 关卡)

**D-a · 双语政策 = 分层双语**
- **面向用户的页**(README / getting-started / concepts / recipes / glossary)+ **reference/契约**:保留中英双语(仓库现有惯例 + 项目中文根 + 已有双语基础设施)。
- **internals**(architecture 瘦身 / boundaries / perf):**英文单源**(内部/工程师向,降维护;zh 镜像删)。
- 理由:用户第一触点双语值得,内部"怎么建的"单语省一半维护。

**D-b · `internal`(单数) vs `internals`(复数)= 两个目录、职责分明**
- `docs/internals/`(新,复数,§18.2):面向"想了解怎么建的"工程师——architecture(瘦身)、boundaries、perf。
- `docs/internal/`(旧,单数,维护者账本):halumem-feasibility、phase0-calibration、prompt-regression-runbook、publishing(PUBLISHING 移入)、naming 的定位纪律部分。
- 一字之差有 footgun,靠两个 README 明确分区 + 引用一致性管理(死链 CI 会兜底,§18.4)。理由:尊重 §18.2 命名 + 语义清晰(对外"怎么建的" vs 对内账本)。

**D-c · architecture 迁移时修正与源码不符处**(侦察抓到,doc-writer 迁移时改):
- `sourceKind` 3 值 → 4 值(加 `'tool'`,AD-3/D-0013);§8 补 `toolDefaults`;§2.3 cognition 字段补 `archivedAt`。

## 目标结构 ← 来源映射

| 目标(§18.2) | 动作 | 来源 |
|---|---|---|
| `README.md`(双语) | rewrite 成 60 秒电梯稿(§18.1) | 现有 README 精简(4 条重复定位句收敛成 1)+ deployment "README wording" 节素材;长内容外移 |
| `docs/README.md` | rewrite 成三入口索引(上手/概念/适配器 + reference/internals) | 现有 docs/README |
| `docs/getting-started.md`(双语) | new(5 分钟:装→喂一条证据→召回;INSTALL "15 分钟"改回 5) | INSTALL §1-3/7-8 主线 + integration §2/3/5 最小接入 |
| `docs/concepts/`(6 页,双语) | new(六条纪律各一屏 + 可运行片段) | architecture §2/3/4.1-4.5/5/8 提炼 + deployment 授权纪律 + integration §7 |
| `docs/recipes/`(双语) | new(每适配器一篇 5 分钟接入) | adapter-ai-sdk / mcp-server 包内 README 提炼 + integration §6 观察采集;包内 README 保留、recipes 指过去 |
| `docs/reference/memory-surface-contract.md`(双语) | move + 清进度腔 | 现有 contract(删 :121 clock"留后续"、:76 批次流水账;须与 API 快照同步) |
| `docs/internals/architecture.md`(英文单源) | split 瘦身成"概念→文件映射" | architecture 骨架 + deployment 三部署模式/tier 路由 + integration §1/§8 边界;删"未来将 swap Mem0"等 |
| `docs/internals/boundaries.md`(英文单源) | move + 改链 | docs/internal/boundaries.md(改 5 处入链) |
| `docs/internals/perf.md`(英文单源) | move | docs/perf.md(改 docs/README:22 入链) |
| `docs/glossary.md`(双语) | new | naming §3 词表 + §5 把握度定性档 |
| `docs/demo-script.md` | keep(Phase 4 已建) | — |
| `docs/internal/*`(维护者账本) | keep + PUBLISHING move 进来 | halumem/calibration/runbook 原地不动(零入链改动)、PUBLISHING→internal/publishing、naming 定位纪律部分 |
| 根 `CONTRIBUTING.md/.zh` | keep | GitHub 根渲染,贡献者向 |

**待删(内容已拆分/镜像替代,留 301 桩)**:INSTALL.md/.zh、integration.md/.zh、deployment.md、naming.md、architecture.md/.zh、memory-surface-contract 原位、perf 原位、contract.zh(→reference 双语保留)。原文件拆完删,旧路径留跳转桩。

## 执行阶段(过目放行后)
1. 建 docs 新骨架(reference/internals/concepts/recipes 目录 + 301 桩)。
2. 写 getting-started(第一页,验证 5 分钟主线可跑)。
3. concepts 六页(各配可运行片段)+ recipes。
4. README 电梯稿 + docs/README 索引 + glossary。
5. §18.3 snippets 可执行验证进 CI + §18.4 死链/术语 + §18.5 新人视角巡检。

> 详细逐节 notes 见 workflow 盘点原始输出(subagents/workflows/wf_76bfb079-033)。
