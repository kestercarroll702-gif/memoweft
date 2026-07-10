# DECISIONS — ADR-lite

每个有争议的取舍一条。必须记的时机:偏离 PROJECT_PLAN 设计;两个合理方案取舍;修改默认参数;任何 API/schema/权限模型变更(附影响面说明)。

## D-0001 FTS5 tokenizer 选择(trigram)

日期:2026-07-10 / 状态:已采纳(索引体积待 Phase 1 实测补记)
背景:Phase 1 关键词通道用 `node:sqlite` FTS5。
选项:A `trigram`(CJK/拼写变体稳,索引大,查询词需 ≥3 字符才匹配) B `unicode61`(小,不分中文)。
决定:默认 A `trigram`;纯英文场景可配 `unicode61`。
依据/实测(Phase 0.1,node v24):FTS5+trigram 可用;英文 `peanut` MATCH ✓;**中文 2 字词 MATCH 返回 0,3 字才命中**(`饮食`→0、`饮食限`→1)。→ hybrid 里短中文词须靠向量通道兜底,黄金集中文组按此设计。降级链(better-sqlite3 → 纯 TS BM25)本轮未触发。

## D-0002 协作模式 = 务实混合

日期:2026-07-10 / 状态:已采纳(人类拍板)
背景:PROJECT_PLAN 的执行模型是「Integrator 主会话 + 6 个角色锁定子代理(`.claude/agents`)+ hooks 机器强制,重启会话生效」;本会话还能用 Agent/Workflow 即时派子代理并行。
决定:务实混合——Integrator 用 Agent/Workflow 即时委派并行推进;`.claude/` 落地供以后会话用;本会话 hooks 机器强制暂不生效,靠职责分离 + Integrator 守门 + 每次全量测试兜底。

## D-0003 Phase 4 demo = 改造现有 testbench

日期:2026-07-10 / 状态:已采纳(人类拍板)
背景:仓库无 `npm run demo`,有浏览器版 `testbench`/`experience` 与参考宿主 `apps/memoweft-host`。
决定:Phase 4 在现有 testbench/experience 基础上改出「终端四幕、纯文本、无 key、确定性(HashEmbedder + 录制夹具)」demo,而非从零新建。

## D-0004 hook 落地适配(对附录 I.2 的偏离)

日期:2026-07-10 / 状态:已采纳
背景:附录 I.2 的 `protect.py` 逐字落地后 stdin 实测(16 场景)发现三处问题。
决定/偏离:
- ① hook 命令用 `python`(非 `python3`)——避 Windows `WindowsApps` 的 Store 别名 shim。
- ② force-push 正则加固:原 `git\s+push\s+\S*\s*(-f|--force)` 漏拦 `git push origin main --force`(force 标志被参数隔开);改为"命令含 `git push` 且含 force 标志(`--force`/`--force-with-lease`/`-f`)即拦",3 变体已验。
- ③ stderr 强制 UTF-8:否则 Windows GBK 控制台下拦截理由乱码,回传给 Claude/人类不可读。
补充:本 harness 下 hooks **不热加载**(探针实证),需重启会话才激活;角色级写入限制靠 stdin `agent_type` 字段(claude-code-guide 核实当前官方文档确有此字段)。

## D-0005 检索现状修正 + mimo 模型特性(校准结论)

日期:2026-07-10 / 状态:记录(影响 Phase 1/2 设计)
背景:Phase 0.2 校准发现 PROJECT_PLAN §14 对检索现状的描述与代码不符。详见 `docs/internal/phase0-calibration.md`。
修正:
- ① 索引"全量重建"不准确——`VectorRetriever.indexAll` 嵌入侧**已是 sha256 增量 diff**(O(Δ) 嵌入调用);真瓶颈在**读侧**:每次查询 O(N) 读全表 `vectors` + `JSON.parse` + 手写 JS 余弦。→ Phase 1 优化重心在检索侧(FTS/BM25 关键词通道 + RRF + 向量侧 ANN/sqlite-vec),而非重建侧。
- ② 向量以 **JSON 文本**存于独立 `vectors(id,hash,vec)` 表、走独立第二连接、**不纳入 `runMigrations` 版本化**(自带 DROP-重建)——Phase 1 改向量 schema 需单独处理其迁移路径。
- ③ 写路径**非单一事务**:只有 `consolidate`(认知写 + `event.markConsolidated`)那段走共享事务;`evidence.put`、`distill` 的 `event.put`、`attribute` 均无事务。
mimo:`mimo-v2.5-pro` 是**推理模型**(回 `reasoning_tokens`);`client.ts` 不发 `max_tokens` 且自动剥 `<think>…</think>`,天然适配。Phase 2 固化注意给足输出预算。
