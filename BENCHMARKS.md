# BENCHMARKS — MemoWeft 公开基准成绩(Phase 6 · §19)

> 维护者账本,非营销页。原则:**每个数字都可复现、条件写清、不做不对等比较**。
> 数据许可:LoCoMo 为 **CC BY-NC 4.0**(仅研究、非商用)——数据文件**绝不入库**,本页只发**聚合分数**。
> 环境:本机 RTX 3090;答题/固化模型 = 小米 MiMo `mimo-v2.5-pro`(云端 OpenAI 兼容);嵌入 = 本地 `bge-m3`(1024 维,经 llama.cpp GPU)。
> 状态:Phase 6 进行中,以下为**方向性快照**(未打 `phase-6-done`);LongMemEval 数据+harness 就绪,待有配额的 gpt-4o judge(见 §4)。

---

## 1. LoCoMo-10 · §19.2 检索矩阵(Recall@15)

三种检索 × 两种嵌入,evidence 层,全 10 sample、1536 道有-gold 题(排除 category 5 adversarial);dry 跑(只量检索命中,不调答题 LLM)。

| 类别 | n | keyword | vector-hash | **vector-bge** | hybrid-hash | hybrid-bge |
|---|---|---|---|---|---|---|
| multi-hop | 282 | 39.4% | 18.1% | **77.0%** | 31.9% | 69.1% |
| temporal | 321 | 54.8% | 39.3% | **83.2%** | 57.0% | 81.0% |
| open-domain | 92 | 30.4% | 15.2% | **51.1%** | 27.2% | 48.9% |
| single-hop | 841 | 63.6% | 34.5% | 80.5% | 57.0% | **82.4%** |
| **overall** | **1536** | 55.3% | 31.3% | **78.6%** | 50.6% | 77.7% |

- **臂**:vector = VectorRetriever(余弦);keyword = KeywordRetriever(FTS5 trigram/BM25);hybrid = HybridRetriever(RRF 融合)。
- **嵌入**:`hash` = HashEmbedder(确定性 char-bigram,占位/基线);`bge-m3` = 真实语义嵌入。
- **结论**:① 真实 bge-m3 压倒性(+47pt vs 确定性向量);② **强嵌入下 hybrid≡vector**(77.7≈78.6)——坐实 D-0008「hybrid 不进公共 API」;③ **弱嵌入下 hybrid≫vector**(50.6 vs 31.3)、keyword-only 55.3% 也不弱——验证 D-0008 caveat「keyword 大语料被低估」。

## 2. LoCoMo-10 · 端到端 F1(evidence 层 vs cognition 层 · 会话日期 A/B)

单 sample(conv-26)· 全 419 轮 · 前 30 题;答题经 mimo,partial-match F1。**方向性小样本**,非最终分。

| 臂 | multi-hop | temporal | open-domain | 全程 token |
|---|---|---|---|---|
| evidence·关键词·日期开 | 0.133 | 0.613 | 0.263 | 45.4k |
| evidence·语义 bge-m3·日期开 | **0.407** | **0.658** | **0.277** | 39.8k |
| evidence·关键词·**日期关** | 0.133 | **0.131** | 0.222 | 31.9k |
| cognition·日期开 | 0.343 | 0.025 | 0.281 | 87.3k |

- **会话日期注入对 temporal 决定性**:F1 0.131→0.613(×4.7)——修了 temporal「已知偏差」。
- **cognition 层不适合逐句 episodic 题**:temporal F1 0.025、成本≈2×——消化丢细节,是「画像级 recall vs 逐句事实召回粒度落差」的量化(定位使然,非缺陷)。

## 3. 置信度参数敏感性 · §19.3(纯确定性网格)

底分 ×{0.8,1.0,1.2} × 半衰期 ×{0.5,1.0,2.0},零 LLM 重算(见 `bench/sensitivity-confidence.md`)。

- **底分 ±20%**:credStatus 翻转率 28.1%,但**跨 >1 档的野翻转 = 0**——全是相邻档边界跨越,集中在 `stated` 底分(600 恰在 limited/stable 阈值中点)。分档系统固有特性,系统有序无突变。
- **半衰期**:召回保留窗口随半衰期**线性**伸缩(×0.5/1/2 → 窗口 ×0.5/1/2),无悬崖。
- **结论**:未发现更优默认参数,默认值行为有序可预测,不触发「改默认→D-xxxx」或「改 eval 断言→铁律1」。

## 4. LongMemEval_S · 状态:数据 + harness 就绪,待有配额的 gpt-4o judge

`bench/longmemeval-eval.mjs`(loader/检索/答题/LLM-judge/弃权,`--selftest` 离线全绿)。

- **数据 ✅**:LongMemEval_S(**500 题**·平均 haystack **494 回合/245 user**·最多 66 会话)已取本地(278MB,经 `LONGMEMEVAL_PATH`;**不入库**)。
- **harness 真实数据端到端验证 ✅**:dry 结构验证 + 小样本(6 题 single-session-user)mimo-answer + mimo-judge 全链路跑通。
- **标准 judge 仍阻塞**:官方用 `gpt-4o`;所提供的 key **配额/计费未启用(exceeded quota)**,无法作标准 judge。→ 待有余额的 gpt-4o key(设 `MEMOWEFT_JUDGE_BASE_URL/API_KEY/MODEL`),即可跑标准分。
- **非标准直读(仅供参考,不可对外比)**:mimo-as-judge · keyword 检索 · 前 6 题 single-session-user → 正确率 50%。
- **原则性限制**:铁律 3a 只摄入 user 回合 → `single-session-assistant`(56/500)按设计答不出。
- **全量成本预估**:500 题 ×(ingest ~245 回合 + mimo 答题 + judge)≈ **3–5 小时** + 大量 mimo token;建议先跑子集。跑大样本用 per-item 进程隔离(同 §19.2,避 node:sqlite 累积 native 崩)。

## 5. 复现命令

```bash
# 数据(CC BY-NC,不入库):把 locomo10.json 放本地,LOCOMO_PATH 指向它
export LOCOMO_PATH=bench/data/locomo10.json

# §19.2 完整矩阵:逐 sample 独立进程(规避 node:sqlite 全量单进程 native 崩)+ 合并
for i in $(seq 0 9); do node bench/locomo-eval.mjs --matrix --offset $i --limit 1; done
node bench/locomo-eval.mjs --merge-matrix          # → bench/runs/<date>-<commit>-locomo-matrix-merged.md

# §2 端到端 F1 对比(接 mimo)
node bench/locomo-eval.mjs --limit 1 --qa 30                     # evidence·关键词
node bench/locomo-eval.mjs --limit 1 --qa 30 --retriever semantic # evidence·bge-m3
node bench/locomo-eval.mjs --limit 1 --qa 30 --layer cognition    # cognition
node bench/locomo-eval.mjs --limit 1 --qa 30 --no-dates           # 日期 A/B

# §19.3 参数敏感性(零 LLM)
node bench/sensitivity-confidence.mjs              # → bench/sensitivity-confidence.md

# LongMemEval:先验管线(无数据/无 key),数据到位后去掉 --selftest 并设 LONGMEMEVAL_PATH
node bench/longmemeval-eval.mjs --selftest
```

嵌入端点(bge-m3 @ 127.0.0.1:11435)需在跑语义/cognition 臂前起(本机经 llama.cpp GPU)。

## 6. 条件与对比纪律

- **不做不对等比较**:与 Mem0 / 其他记忆库的公开数字对照前,须对齐 top-k、检索层(evidence vs cognition)、嵌入模型、judge 模型、是否含 adversarial。本页数字的条件已在各节写明。
- **模型非确定**:mimo 是推理模型、有输出漂移;F1/judge 数字是某次快照,不做 CI 断言。
- **摄入纪律差异**:MemoWeft 只把 user 亲口当证据(铁律 3a),不摄入助手输出——这会让「问助手说过什么」类题结构性偏低,是定位差异而非弱点。

---

*本页随 Phase 6 推进更新;历史快照见 `bench/runs/`(gitignore,仅本地)。*
