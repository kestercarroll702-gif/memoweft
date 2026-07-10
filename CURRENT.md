# CURRENT — 当前状态(Integrator 每个工作段落结束更新)

更新于:2026-07-10 | 所在 Phase:**1 召回更准(进行中)**(tag: `phase-0-done`;Phase 1 未打 start tag,trunk 直推)

> 总纲 `PROJECT_PLAN.md`;决策 `DECISIONS.md`;校准 `docs/internal/phase0-calibration.md`;检索基线 `bench/retrieval-baseline.md`。

## 正在进行

- **14.3 BM25/FTS5 关键词通道**(next)。测量地基(14.1/14.2)已入库、基线已定 —— 满足"先测量后优化",可动优化。

## 刚完成(最近 5 条,附证据)

- **14.2 检索基线入库**:`bench/eval-retrieval.mjs`(双臂脚本,真实臂 opt-in 默认离线)+ `bench/retrieval-baseline.md`。**vector-only 基线**:overall Recall@5 **0.7154** / Hit@5 0.7692 / MRR@10 0.6608;direct **0.962**、paraphrase **0.500**、multihop 0.633;zh 0.810、**en 0.042**;**9 条纯 2 字中文 direct = 1.000**(向量 char-bigram 兜住 trigram 够不着的 2 字词,证 D-0001)。确定性自检通过。
- **14.1 HashEmbedder**(commit `0af9dd2`):确定性词袋哈希(FNV-1a + CJK 单字/bigram + L2 归一化),零网络零成本。
- **黄金集 golden.json**(`0af9dd2`):自包含 36 认知/65 用例(direct/paraphrase/multihop≈40:37:23,中文 57、英文 8 跨语言 ground truth,8 种 ContentType 全覆盖)。
- Phase 0 收尾(`bad79fe`,tag `phase-0-done`)。

## 阻塞(等人类或等依赖)

- 无。真实嵌入臂需联网 + 本地 `.env` 的 `MEMOWEFT_EMBED_*`(仓库已有 gitignored `.env`,model=bge-m3,但当前环境 fetch 失败)→ 联网时 `EVAL_REAL_ARM=1 npm run bench:retrieval` 补真实臂。

## 下一步(按序)

1. **14.3 BM25 关键词通道**(FTS5 trigram):`keywordSearch(query,k)` 与向量检索同签名;失效/过期过滤策略、tokenizer 体积记 DECISIONS(D-0001 补数)。降级链 node:sqlite→better-sqlite3→纯 TS BM25。
2. **14.4 RRF 融合 hybrid + `mode` 开关**:`mode:'vector'|'keyword'|'hybrid'`;若进公共 API 走第 13 章变更流程(**本轮第一个合法 API 变更,正好演练**)。
3. **14.5 增量索引**(嵌入侧已有,重心读侧全表余弦,D-0005)+ 1 万条验证;**14.6 三臂消融** → `bench/retrieval-after.md` 与基线同格式对比。

## Phase 1 靶子(基线 → 目标)

- overall Recall@5 **0.7154 → ≥0.787**(+10%);中文用例组单独达标;P95 延迟劣化 ≤20%。
- 主缺口:**paraphrase 0.500(语义)+ en 0.042(跨语言)** —— 靠真实嵌入臂 + BM25/RRF hybrid 补。

## 本轮范围冻结(铁律 4)

host、采集插件、perception、asking、attribution、background、graph、portable、memory 管理 API —— 只在某 Phase 明确需要时才碰,否则进 ROADMAP Later。
