# 检索基线报告（vector-only）— Phase 1 §14.2

> 本报告量的是【当前 vector-only 系统】在黄金集上的召回，作为 §14.3/14.4 加 BM25+RRF
> hybrid 后对比的**基准**。先入库基线，才动优化（先测量后优化）。

## 生成环境

| 项 | 值 |
| --- | --- |
| 生成命令 | `node bench/eval-retrieval.mjs` |
| commit | `0af9dd2` |
| Node | 24.15.0 |
| 平台 | win32/x64 |
| 生成时间 | 2026-07-10T03:08:31.348Z |
| 臂 | HashEmbedder（dim=256，确定性词袋哈希） |
| topK | 10 |
| 黄金集 | tests/retrieval/golden.json（36 条 cognition，65 条 case） |
| 确定性自检 | 通过（两遍指标逐位相等） |
| 真实臂 | off（默认离线确定；设 EVAL_REAL_ARM=1 或 --real 启用真实嵌入臂） |

## 总体指标

| 分组 | n | Recall@5 | Hit@5 | MRR@10 |
| --- | --- | --- | --- | --- |
| overall | 65 | 0.7154 | 0.7692 | 0.6608 |

## 按 kind 分组

| kind | n | Recall@5 | Hit@5 | MRR@10 |
| --- | --- | --- | --- | --- |
| direct | 26 | 0.9615 | 0.9615 | 0.9269 |
| paraphrase | 24 | 0.5000 | 0.5000 | 0.3444 |
| multihop | 15 | 0.6333 | 0.8667 | 0.7056 |

## 按语言分组（query 含 CJK=zh，否则 en）

| lang | n | Recall@5 | Hit@5 | MRR@10 |
| --- | --- | --- | --- | --- |
| zh | 57 | 0.8099 | 0.8596 | 0.7491 |
| en | 8 | 0.0417 | 0.1250 | 0.0313 |

## Latency（全体 search，ms）

| 分位 | ms |
| --- | --- |
| P50 | 0.212 |
| P95 | 0.430 |

> latency 为本机测量、非确定量，不参与确定性自检；仅供量级参考。

## 重点结论

### 1. direct vs paraphrase 的 Recall 差

- direct Recall@5 = **0.9615**，paraphrase Recall@5 = **0.5000**，差值 = **0.4615**。
- 预期 direct 高、paraphrase 低：HashEmbedder 只做**词面匹配**（FNV-1a 词袋哈希 + char-bigram），
  paraphrase 靠换词/近义/跨语言表达，词面重叠少，语义召回够不着。
- 这正是 Phase 1 §14.3/14.4 的靶子——paraphrase 的语义缺口要靠**真实嵌入臂**与 **BM25+RRF hybrid** 补。

### 2. 9 条纯 2 字中文 direct 用例的召回

验证向量 char-bigram 能否兜住 trigram 关键词通道够不着的 2 字词（G-004/G-008/G-009/G-010/G-013/G-015/G-016/G-018/G-019）。

- 命中（Hit@5=1）：**9/9**；这组 Recall@5 = **1.0000**，MRR@10 = **1.0000**。

| case | query | expect | firstRank | top5 命中? | recall5 | rr10 | top5（截断） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| G-004 | 搬家 | cog-005 | 1 | ✓ | 1.0000 | 1.0000 | cog-005, cog-003, cog-010, cog-025, cog-035 |
| G-008 | 团子 | cog-009, cog-010 | 1 | ✓ | 1.0000 | 1.0000 | cog-010, cog-009, cog-036, cog-035, cog-020 |
| G-009 | 咖啡 | cog-013, cog-014 | 1 | ✓ | 1.0000 | 1.0000 | cog-013, cog-014, cog-028, cog-024, cog-001 |
| G-010 | 口味 | cog-015 | 1 | ✓ | 1.0000 | 1.0000 | cog-015, cog-019, cog-002, cog-016, cog-034 |
| G-013 | 饮食 | cog-019 | 1 | ✓ | 1.0000 | 1.0000 | cog-019, cog-026, cog-009, cog-005, cog-028 |
| G-015 | 吉他 | cog-021 | 1 | ✓ | 1.0000 | 1.0000 | cog-021, cog-012, cog-004, cog-018, cog-025 |
| G-016 | 睡眠 | cog-024 | 1 | ✓ | 1.0000 | 1.0000 | cog-024, cog-034, cog-023, cog-009, cog-025 |
| G-018 | 疲惫 | cog-025 | 1 | ✓ | 1.0000 | 1.0000 | cog-025, cog-009, cog-013, cog-001, cog-005 |
| G-019 | 烦躁 | cog-026 | 1 | ✓ | 1.0000 | 1.0000 | cog-026, cog-003, cog-010, cog-035, cog-018 |

## 备注

- **vector-only 基线**：只有 VectorRetriever（余弦）+ 确定性 HashEmbedder，无 BM25、无 hybrid、无 rerank。
- **真实臂 pending**：off（默认离线确定；设 EVAL_REAL_ARM=1 或 --real 启用真实嵌入臂）
- **先入库基线，才动优化**：本报告数字是 §14.3/14.4 优化前的对照基准，每个数字可由生成命令复现（HashEmbedder 确定性）。
