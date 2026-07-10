# ROADMAP

MemoWeft 是 **library-first** 的可移植 AI 长期记忆库。公共 API 稳定分层与破坏性变更策略见 [`docs/memory-surface-contract.md`](./docs/memory-surface-contract.md)。具体推进见 `PROJECT_PLAN.md` 与 `CURRENT.md`。

## Now(本轮升级,对应 PROJECT_PLAN.md Phase 1–6)

- 召回更准(Phase 1)· 固化更可信(Phase 2,真实模型质量线)· 适配器更稳(Phase 3)· demo 更锋利(Phase 4)· 文档更不绕(Phase 5)· 公开基准(Phase 6,常态化)

## Next(本轮之后优先考虑)

- 更多适配器(OpenAI Agents / LangChain / LlamaIndex),待 adapter-kit 被证明后批量做
- Reranker 实装(Phase 1 若时间紧,`Reranker` 接口先留 no-op,实装下放此处)
- **keyword / hybrid 召回重评估**(building blocks 已建:`KeywordRetriever` FTS5/BM25 + `HybridRetriever` RRF,未接 API,见 D-0008):当前黄金集上 hybrid 零增益、召回提升全来自真实 embedder;待**大语料 / 稀有精确词 / 错拼 / OOV / 代码标识符**这类 keyword 有利的 workload 出现时,以对应黄金集重评估是否接入
- 纯 TS BM25 降级(D-0007,FtsUnavailableError 探测点已留,待无 FTS5 环境出现)
- 召回质量 v2:相似度阈值、purpose/content 过滤、召回解释、负反馈
- 保持 Core / Host / Plugin 权限边界的新插件

## Later(明确不在本轮;想法只进不丢)

- Python 移植与跨语言一致性
- REST server、多租户、pgvector / Postgres 后端
- 托管 SaaS、Web 管理界面、多模态证据、CRDT 同步
- 大规模新增适配器(本轮至多新增一个作为契约套件试金石)
- 把参考宿主做成产品 / 扩成桌面产品路线
- 拆分开源 / 闭源功能分层
- IDEA-xxx <一句话>(来源 Phase/日期)

## Non-goals(纪律)

不把参考宿主变成产品;不把本仓库扩成桌面产品路线图;不为便利削弱认知纪律;不拆分开闭源分层。
