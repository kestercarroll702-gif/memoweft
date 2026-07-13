# MemoWeft 文档

[English](./README.md) | **简体中文**

> 本文档**以英文版为准**；中文为尽力同步，如有出入以 [英文版](./README.md) 为准。

MemoWeft 是一个为 AI 应用提供可移植长期记忆的库——它把事实、猜测、冲突和陈旧状态彼此分开。

## 从这里开始

- **[快速上手（Getting started）](./getting-started.zh-CN.md)** — 安装、存入一条证据、再读回来。五分钟，第一步无需 API key。[English](./getting-started.md)
- **[概念（Concepts）](./concepts/README.zh-CN.md)** — 让 MemoWeft 值得信任的六条认知纪律规则，每条一屏。[English](./concepts/README.md)
- **配方（Recipes）** — 五分钟把 MemoWeft 接入你的技术栈：[Vercel AI SDK](./recipes/vercel-ai-sdk.zh-CN.md) [English](./recipes/vercel-ai-sdk.md) · [MCP 服务器](./recipes/mcp-server.zh-CN.md) [English](./recipes/mcp-server.md)。

## 参考

- **[记忆面契约（Memory surface contract）](./reference/memory-surface-contract.zh-CN.md)** — 每一个面向宿主的方法与数据形状；API 的唯一事实来源。[English](./reference/memory-surface-contract.md)
- **[术语表（Glossary）](./glossary.zh-CN.md)** — 每一个核心术语：代码名称、定义，以及面向用户的通俗表述。[English](./glossary.md)
- **[Demo 演练（Demo walkthrough）](./demo-script.md)** — `npm run demo` 用 90 秒展示四大差异化亮点。
- **[插件契约（Plugin contract）](./plugin-contract.zh-CN.md)** — 插件钩子与权限边界。[English](./plugin-contract.md)

## 它是如何构建的

- **[架构（Architecture）](./internals/architecture.md)** — 证据 → 事件 → 认知，读取与写入路径。
- **[部署（Deployment）](./deployment.md)** — 云优先、云端守护、本地，以及混合。
- **[安装细节（Install details）](./INSTALL.zh-CN.md)** — 驱动、Node 版本、环境。[English](./INSTALL.md)
- **[性能（Performance）](./internals/perf.md)** — 实测数据，可复现。

## 面向贡献者

- [CONTRIBUTING](../CONTRIBUTING.zh-CN.md) · [AGENTS](../AGENTS.md) · [CURRENT](../CURRENT.md) · [ROADMAP](../ROADMAP.md) · [PUBLISHING](./PUBLISHING.md)
- 仅维护者可见的说明位于 `docs/internal/` 下。
