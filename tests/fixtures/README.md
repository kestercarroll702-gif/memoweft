# tests/fixtures

## `memoweft-0.1.0.db` — 冻结的 0.1.0 schema fixture（**不要重新生成**）

一个由 **0.1.0 版 schema** 创建的真实 SQLite 库：`user_version = 0`（0.1.0 还没有版本化），含 6 张表（evidence / event / event_evidence / cognition / cognition_evidence / management_log）+ 若干条 demo 数据（subject `demo`：2 条 evidence、2 条 cognition）。

`tests/migrations.test.ts` 用它验证 **"0.1.0 老库经 openStores 打开 → 无损升级、数据不丢"**，以及 fresh 库与"从本 fixture 迁上来的库" **schema 签名一致**（防"新库靠 store SCHEMA、老库靠迁移"两条路悄悄跑偏）。

**这是钉死的基线，必须冻结**：绝不能用当前代码重新生成它——否则将来改了 `SCHEMA` 常量后，"0.1.0 fixture" 会悄悄变成新 schema，测试名字没变、实测内容却漂了（正是它要防的东西）。当年 2026-07-04 用等价于 0.1.0 的 store 代码一次性生成，之后只读。
