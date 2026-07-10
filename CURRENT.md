# CURRENT — 当前状态(Integrator 每个工作段落结束更新)

更新于:2026-07-10 | 所在 Phase:**1 召回更准 已收尾**(将打 tag `phase-1-done`)

> 总纲 `PROJECT_PLAN.md`;决策 `DECISIONS.md`;校准 `docs/internal/phase0-calibration.md`;检索基线/消融 `bench/retrieval-baseline.md`、`bench/retrieval-after.md`。

## 正在进行

- **Phase 1 收尾,待人类验收**。核心结论:hybrid 被数据否决,召回提升来自真实 embedder(见下)。

## Phase 1 诚实结论(先测量,拦住了无用优化)

文档假设"BM25+RRF hybrid → Recall@5 +10%"。**三臂消融实测否决了这个假设**:

| 臂 | overall Recall@5 |
|---|---|
| 确定性 vector(HashEmbedder) | 0.7154(基线) |
| 确定性 hybrid | 0.7154(Δ **0**) |
| 真实 vector(bge-m3) | **0.9667** |
| 真实 hybrid(bge-m3+keyword) | 0.9667(Δ **0**) |

- **hybrid 在确定性与真实臂上都零增益**——keyword(FTS5/BM25)与向量本质同源,RRF 生不出新召回。
- **真正的召回提升 = 真实语义 embedder**(0.9667,比确定性基线 **+35%**,远超 +10% 目标),系统本就支持注入(`Embedder` 扩展点)。
- **决定(D-0008,人类拍板)**:不把 hybrid/`mode` 接进公共 API;`KeywordRetriever`/`HybridRetriever` 作为已测好的 building blocks 留仓(不导出 index.ts),待大语料/稀有词场景重评估(ROADMAP Next)。

## 刚完成(Phase 1,附证据,提交 `0af9dd2`…`b767fff`)

- **1.1 HashEmbedder** + **1.2 黄金集(36/65)+ vector-only 基线**(`bench/retrieval-baseline.md`)。
- **1.3 KeywordRetriever**(FTS5 trigram+BM25,未动 API)+ **1.4a HybridRetriever**(RRF)。
- **1.6 三臂消融**(`bench/retrieval-after.md`)+ **真实 bge-m3 臂**(打通本地 Ollama 端点后实测:0.9667)。
- 全量 **262 绿**;三臂确定性自检通过;api:check 绿(公共 API 全程未动)。

## 阻塞 / 环境备注

- 无阻塞。本地 Ollama(bge-m3 @ 127.0.0.1:11435)现由本会话起着,供真实臂;`.env`(gitignored)用旧 `DLA_*` 前缀,代码兼容。真实臂非确定,不入 CI,由本地/nightly 承担。

## 下一步(按序,待人类确认)

1. **人类验收 Phase 1**(§14 验收核对表,诚实版)→ 打 `phase-1-done`。
2. 选下一 Phase:文档推荐 **Phase 2 固化更可信**(真实模型写路径质量线,mimo 已配、可真跑),或 Phase 3 适配器。
3. 未做/降级项(均记 DECISIONS):14.4b(不接,D-0008)、14.5 10k 增量验证(默认召回路径未变、增量属性已在单测覆盖,视为 N/A)、纯 TS BM25 降级(D-0007 暂缓)。

## 本轮范围冻结(铁律 4)

host、采集插件、perception、asking、attribution、background、graph、portable、memory 管理 API —— 只在某 Phase 明确需要时才碰,否则进 ROADMAP Later。
