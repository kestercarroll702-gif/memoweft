# MemoWeft 三层边界（Core / Host / Plugin）

本文只记录长期职责边界，不记录实施批次或项目进度。

架构总览见 [`architecture.md`](./architecture.md)，插件权限见 [`plugin-contract.md`](../plugin-contract.md)，公开 API 稳定性见 [`memory-surface-contract.md`](../reference/memory-surface-contract.md)。

## 一句话边界

> **Core 负责记忆怎么正确存在，Host 负责用户怎么使用和管理，Plugin 负责可选扩展。**

## Core

Core 是被宿主 `import` 的记忆库。

Core 负责：

- evidence、event、cognition 三层数据与溯源关系；
- 摄入、整理、召回与受控记忆管理 API；
- 置信度计算、冲突处理、纠正、衰减与分型过期；
- 模型与检索抽象；
- schema migration、完整性检查与便携记忆包；
- evidence 级本地与云端读取边界。

Core 不负责：

- 聊天产品、UI、人设或语气；
- 隐私政策、同意界面或用户提示；
- 操作系统级采集；
- 插件市场或动态模块加载；
- 决定宿主何时回复、何时整理画像。

Core 的认知纪律不能由 Host 或 Plugin 绕过：记下不等于相信，冲突不能静默覆盖，置信度由库计算，临时状态按类型衰减。

## Host

Host 是使用 Core 的应用壳。`apps/memoweft-host` 是本仓库提供的参考实现。

Host 负责：

- Core 生命周期、模型配置与数据目录；
- 聊天、会话、UI、人设与语气；
- 用户同意、隐私提示与证据授权流程；
- 何时调用 `updateProfile()`、如何使用召回结果；
- 记忆管理确认、备份恢复与错误展示；
- 插件注册、权限判断与 observation 审核。

Host 不应：

- 直接写 SQL 或绕过 `core.memory.*` 修改记忆；
- 重新定义 Core 的置信度与冲突规则；
- 把插件输入直接写入 store；
- 将一个 subject 的记忆泄露给另一个 subject。

## Plugin

Plugin 提供可选能力，例如体验提示词、工具集成或观察采集。

Plugin 可以：

- 观察受支持的生命周期 hook；
- 通过受限 `PluginContext` 请求记忆；
- 在声明权限后提交 observation；
- 向 Host 提供体验或工具能力。

Plugin 不可以：

- 持有或直接访问 Core store；
- 修改 Core 管线或认知判定结果；
- 自行提升 evidence 的云端授权；
- 绕过 Host 的同意与权限检查；
- 直接删除、合并或稳定化 cognition。

## 标准交互

```text
User / UI
   ↓
Host ── public API ──→ Core
 ↑                       │
 └──── result / recall ──┘
```

```text
Collector Plugin
   ↓ observation request
Host policy and consent check
   ↓ core.ingestObservation()
Core evidence pipeline
```

```text
User memory-management action
   ↓ confirmation and reason
Host
   ↓ core.memory.*
Core validation, mutation, and audit metadata
```

任何跨层能力都应沿这些公开入口流动。新增捷径如果让 Host 或 Plugin 绕过 Core 规则，就违反本边界。
