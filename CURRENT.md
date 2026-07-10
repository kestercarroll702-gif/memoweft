# CURRENT — 当前状态(Integrator 每个工作段落结束更新)

更新于:2026-07-10 | 所在 Phase:**2 固化更可信(进行中)**(前置 tag `phase-1-done`)

> 总纲 `PROJECT_PLAN.md`;决策 `DECISIONS.md`;固化质量基线 `bench/consolidation-baseline.md`;检索 `bench/retrieval-*.md`。

## 正在进行

- Phase 2 质量线**已能用**:语料库 + 评测器 + **真实基线已入库**。下一步在 15.3(提示词版本化)/ 15.4(live+nightly)/ 修具体质量问题 之间选,待人类定向。

## 刚完成(Phase 2,附证据)

- **2.1 场景语料库**(`7b527c0`):`tests/consolidation-corpus/corpus.json` 42 场景(六类纪律各 7,中文 57%)+ 18 结构校验。
- **2.2 固化质量评测器 + 真实基线**(`7b527c0` / `939695d`):`bench/eval-consolidation.mjs`(结构断言 + LLM-judge 三票多数 + `--selftest`/`--limit`)+ `bench/consolidation-baseline.md`(42/42 真跑 mimo)。
- **基线结果**:结构断言 **88.8%**(198/223)、25/42 全绿、gistRecall 0.37、overInferRate **0.01**。
  - **质量信号(值钱的)**:① **纯闲聊过度记忆**(chitchat 结构仅 21/35=60%,mimo 把闲聊也记成认知)——最清晰的漏洞;② 矛盾能认出(结构 40/42)但**不落新行为认知**(gistRecall 0);③ 亲述事实最稳(35/35)。

## 阻塞 / 环境

- 无阻塞。本地 Ollama(bge-m3 @ 11435)由本会话起着(可停)。真实固化评测慢(约 30s/场景),nightly/本地跑,不进 CI。mimo 会把中文记忆翻成英文存(config.language 默认;评测器已按 lang 设,但提示词语言倾向是 15.3 可看的点)。

## 下一步(待人类定向)

- **A. 完成 Phase 2 管道**:15.3 提示词集中版本化 + 回归流程;15.4 `test:live`/`fixtures:refresh`/nightly 接入。
- **B. 用基线修真问题**:改提示词治"纯闲聊过度记忆",跑 15.2 量前后(需再跑一轮全量,约 90 分钟;触及写路径提示词,认知纪律相关)。
- **C. 暂停**:Phase 2 测量地基 + 基线已入库,收尾本会话。

## 本轮范围冻结(铁律 4)

host、采集插件、perception、asking、attribution、background、graph、portable、memory 管理 API —— 只在某 Phase 明确需要时才碰,否则进 ROADMAP Later。
