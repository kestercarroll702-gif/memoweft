# AGENTS.md · MemoWeft 重构仓 · AI 工作契约

> **任何 AI 接手本仓：先读这份 + [`docs/internal/STATE.md`](docs/internal/STATE.md)（白板·此刻状态）。设计在 [`docs/internal/项目地图.md`](docs/internal/项目地图.md)——按 cell 随用随读，别通读（省 token，见 context-economy skill）。**

## 这是什么项目

MemoWeft = 套在大模型 / Agent **外部**的"用户认知与上下文框架"——把对一个人的理解沉淀成独立于模型、可追溯、可迁移的认知资产，并在需要时提供带置信度和边界的用户上下文。它是**库 / 框架**，被宿主应用 import（体验插件决定语气和角色，如内置的 plain / 星瑶两张脸）。

**文档分层（省 token）**：
- [`docs/internal/STATE.md`](docs/internal/STATE.md) — 白板·此刻状态 + 可用接口 + 下一步（**开工先读，极短**）
- [`docs/internal/项目地图.md`](docs/internal/项目地图.md) — 设计 master（17 格全貌 + 决策），**按 cell 读、别通读**

没有别的 spec/decisions 文件。设计在地图、状态在白板、历史看 git 提交与 `CHANGELOG.md`（仓库不再单独维护逐步磁带）。内部设计参考归在 `docs/internal/`；对外文档在 `docs/` 顶层（architecture / integration / naming / INSTALL / deployment）。

## 当前阶段：框架维护

- 核心重构与架构归位（Core / Host / Plugin 三层）已完成，仓库进入**维护 + 打磨阶段**。方向路线见 [`docs/internal/架构归位路线.md`](docs/internal/架构归位路线.md)。
- `MEMOWEFT_*` 为主名，`DLA_*` 作为旧 env 前缀仅保留向后兼容（见「环境变量」）。

## 合作契约（铁律，违背即停）

1. **方向 / 价值判断归人，执行归 AI。** AI 只摊开选项与权衡，不替用户拍板。
2. **没有定死的规则。** 地图每格都是草稿、可改；做到后面发现问题，回头改、重新定义。
3. **碰到地图没覆盖的、或想改既有方向 / 决策 / 数据结构 → 停下来问人，绝不擅自决定或绕过。**
4. **先出方案 → 人确认 → 再写码。** 动核心机制 / 表结构前必问；写前列"影响面清单"。
5. **小步交付。** 不闷头写一大块。节奏 = 出方案 →（确认）→ 实现 → 自查 → 跑测试台落盘 →（用户 dogfood）→ 同步文档。

## 工作流（横切 context-economy + 5 步一环）

```
context-economy    【每次开工先用·横切】只读 STATE.md + 按 cell 读地图，不通读、不重读
   ↓
task-planning      开工前出方案 + 影响面清单，碰决策停下问
   ↓（人确认）
safe-implementation 按方案小步写，守认知层规则、依赖取向、部件可替换
   ↓
code-review        自查：对照地图规则，查 MemoWeft 特有坑
   ↓
regression-check   跑测试台 + 自动护栏，落盘 log，防废弃物回潮
   ↓（用户 dogfood，AI 读 logs/run-*.jsonl + 证据库 调整）
docs-sync          改写 STATE.md + 决策/历史记进提交说明或 CHANGELOG + 决策变了才改地图对应 cell
```

## 测试台是反馈引擎（务必落盘）

测试台 = 用户视角聊天 + MemoWeft 透视区（实时 log）。**每轮必须把内幕落盘成文件**：`logs/run-*.jsonl`（逐轮全部内幕）+ 数据库 `dla.db`。执行 AI **直接读这些文件**来诊断和调整，不靠用户复述。详见地图 cell 14/15。

## 开发顺序

按地图 cell 5 的分阶段走：**阶段 0 地基 → 1 画像 → 2 纠正闭环 → 3 归因+主动问 → 4 多源扩展**。每阶段对照测试台节奏验收（验收标准是主观的："我自己用着觉得它真在理解我"）。
