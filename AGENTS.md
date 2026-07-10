# AGENTS.md — 工程纪律与 Integrator 章程

本仓库由「人类 + Integrator(Claude Code 主会话)+ 六个子代理」协作维护。
总纲见 `PROJECT_PLAN.md`,当前状态见 `CURRENT.md`,关键决策见 `DECISIONS.md`。

## 这是什么

MemoWeft 是一个**库**(npm 包 `memoweft`),不是应用。它把"对一个人的理解"存成可追溯、可迁移、区分事实与猜测的记忆资产,交给宿主 `import`。它不聊天、不做人设、不画界面——那是宿主的事。

三层边界:

- **Core**(`src/`)——记忆怎么正确地存在:三层数据模型(evidence→event→cognition)、置信度、召回、公共 API。库的本体。
- **Host**(`apps/memoweft-host`)——怎么使用和管理记忆:聊天、界面、多会话、备份。参考实现,不是产品。
- **Plugin**(`plugins/`)——扩展能力:采集器、体验人设。插件只请求,Host 审核,Core 执行记忆规则。

## 三条底线(任何贡献者与任何 Agent 一体适用)

1. **不扩大任务范围**:diff 只含任务声明的文件;顺手发现的新想法进 `ROADMAP.md` 的 Later,记下来问、不顺手做。
2. **改公开 API / 数据库 schema / 权限授权模型前,先写影响面说明**(动机 / 破坏性 / 调用方与两个适配器的迁移路径),经人类批准并记 `DECISIONS.md`(D-xxxx)。机器强制见 PROJECT_PLAN.md 第 13 章 API 快照。
3. **认知纪律不能顺手优化掉**(对所有改动生效):(a) 助手输出永不成为证据;(b) 置信度只由规则计算,不采信 LLM 自报;(c) conflict 只暴露不裁决(用户显式裁决除外);(d) 证据 ID 白名单校验。任何新代码路径必须有覆盖这四点的测试。

> 术语以代码为准(校准见 `docs/internal/phase0-calibration.md`):置信度底分按 **FormedBy**(stated/observed/ruled/inferred);CredStatus = candidate/low/limited/stable/conflicted;"过期"是独立的 `invalidAt` 机制。

## Integrator 守门清单(每份 diff 合并前逐条过)

- [ ] diff 未超任务书文件白名单(范围未扩大)
- [ ] 全量 eval 绿;`api-freeze` 测试绿(或附已批准的 D-xxxx 与影响面说明)
- [ ] 认知纪律四点未被触碰——"顺手优化"这四点 = 直接退回
- [ ] 若触及 schema:迁移脚本齐备且幂等(注意 vectors 表在 runMigrations 体系外,见 D-0005)
- [ ] 提示词 diff 附前后分数对比(Phase 2 起生效)
- [ ] DoD(PROJECT_PLAN.md 附录 G)全项通过;commit message 合规(附录 F)

## 硬性约束(hooks 机器强制,见 `.claude/`)

`tests/eval/` 只增不改;`tests/api/api-surface.snapshot` 禁手改(走 `npm run api:update`);LICENSE 变更属人类;发布 / 强推 / 破坏性命令由人类执行;密钥永不落盘(只经环境变量)。

> hooks 需**重启会话**才激活(本 harness 不热加载);按角色限制写入靠 stdin 的 `agent_type` 字段。落地适配见 D-0004。

## 常用命令

`npm test`(三绿之一) · `npm run typecheck` · `npm run build` · `npm run api:check` · `npm run api:update`(慎用,见 PROJECT_PLAN.md 第 13 章) · `npm run demo`(Phase 4 落地)。
分支 / 提交 / 依赖最小化等细则见 `CONTRIBUTING.md`。
