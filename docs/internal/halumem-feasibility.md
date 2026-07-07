# HaluMem 接入 MemoWeft 可行性评估

> **内部探针 · T-D1（采用性加固批次）· 生成于 2026-07-07。** 第 5 节结论是给维护者的合入下一批次的**建议**，不是既定决策。

> 本文为内部评估，供维护者拍板参考。所有关于 HaluMem 的事实性说法都带出处链接；凡是未经核实或缺失的数据，都会明说，不做粉饰。

## 1. HaluMem 的评测对象、任务构成、指标定义

### 1.1 评测对象：它到底在测什么

HaluMem（"Hallucination in Memory Benchmark"）是**首个面向智能体长期记忆系统的"操作级"幻觉基准**。它测的是记忆系统在**存**信息和**取**信息的过程中冒出来的记忆幻觉，分成四类：编造（fabrication）、错误（errors）、冲突（conflicts）、遗漏（omissions）（[arXiv 摘要](https://arxiv.org/abs/2511.03506)；[全文 PDF](https://arxiv.org/pdf/2511.03506)）。

为什么强调"操作级"，而不是像别的基准那样做端到端问答？论文的论点是：现有记忆基准走的是"喂对话→抽记忆→按问题召回→生成答案→按答案对错打分"这一条端到端流水线，一旦最终答案错了，`Acc_e2e` 这个指标**无法定位错误来源**——分不清幻觉是出在抽取阶段 E（引入了编造/错误的记忆）、更新阶段 U（老记忆被错改或没刷新）、还是问答阶段 Q（记忆明明对、生成却没依据）。这种"没法溯源"的毛病"阻碍了针对性缓解策略的开发"。HaluMem 的做法是为 E、U、Q 三个阶段分别定义各自的黄金标准和指标，把幻觉定位到产生它的那一步操作。论文的核心发现是：系统"在抽取和更新阶段生成并累积幻觉，随后把错误传播到问答阶段"（出处：[全文 PDF](https://arxiv.org/pdf/2511.03506) 第 3–4 节。注：以上均从 arXiv 摘要与全文 PDF 核实，非编造）。

### 1.2 任务构成：三个阶段各测什么

| 阶段 | 测什么 | 黄金标准 |
| --- | --- | --- |
| **Memory Extraction（抽取 E）** | 系统能否从一段对话里正确挑出并存下关键信息，同时不编造、不存无关内容。还专门测对"干扰记忆"（distractor，AI 提过但用户从没确认的似是而非的假事实）的抵抗力，模拟真实的信息污染。 | 每个含参考记忆的会话 D_s 有一份黄金记忆集 `G_ext = {m_i}`（本该新增的记忆点）；系统输出 `M_ext = E(D_s)` 与之比对。 |
| **Memory Updating（更新 U）** | 新对话给出更新或矛盾信息时，系统能否正确改写、合并、替换旧记忆，保持一致、不引入幻觉。针对的三类更新幻觉：①错改旧信息 ②漏掉新信息 ③版本冲突/自相矛盾。 | 每个带标注更新的会话有黄金更新集 `G_upd = {(m_old -> m_new)}`——更新前后成对的记忆。 |
| **Memory Question Answering（问答 Q）** | 端到端能力（抽取+更新+召回+生成一起考）：能否给出符合事实、贴合上下文、无幻觉的答案。 | 每个问题 q_j 调系统的 Retrieve API 拿相关记忆，召回集+问题交给外置 answer LLM 生成答案，与黄金答案比对。 |

（三任务出处：[全文 PDF](https://arxiv.org/pdf/2511.03506) 第 5.1 / 5.2 / 5.3 节。）

问答（Q）的题目分六类：Basic Fact Recall（基础事实回忆）、Multi-hop Inference（多跳推理）、Dynamic Update（动态更新）、Memory Boundary（记忆边界，测系统会不会对没提过的细节硬编答案）、Memory Conflict（记忆冲突，题目里埋了与已知记忆矛盾的错误前提，要求系统识别/纠正）、Generalization & Application（泛化与应用）。具体每类数量见下方数据集统计（出处：[全文 PDF](https://arxiv.org/pdf/2511.03506) 第 5.3 节及附录 A.2 / 表 6）。

### 1.3 指标定义

**抽取阶段（E）：**

- **Memory Recall（召回，R）**：`R = N_correct / N_should`，`N_should = |G_ext|`（本该抽出的黄金记忆数），`N_correct` 为正确抽出的数量。衡量"记忆完整性（抗遗忘）"。另有加权版 **Weighted Recall** `= (Σ w_i·s_i)/(Σ w_i)`，`w_i` 为重要性权重，`s_i ∈ {1, 0.5, 0}`（完全/部分/未抽出）。越高越好（[Eq.1，第 5.1 节](https://arxiv.org/pdf/2511.03506)）。
- **Memory Accuracy（准确率，抗幻觉）与 Target Memory Precision（目标精确率，Target P）**：`Memory Accuracy = N_correct / N_extract`（抽出的记忆是否属实）；`Target P = (Σ 目标记忆的 s_j)/|M_T|`，`M_T ⊆ M_ext` 为抽出记忆里与参考匹配的子集，`N_extract = |M_ext|`。越高越好（[Eq.2，第 5.1 节](https://arxiv.org/pdf/2511.03506)）。
- **False Memory Resistance（假记忆抵抗，FMR）**：`FMR = N_miss / N_D`，`N_D` 为干扰记忆总数，`N_miss` 为系统成功忽略掉的干扰数。越高=抗污染越强（[Eq.3，第 5.1 节](https://arxiv.org/pdf/2511.03506)）。
- **Memory Extraction F1**：`F1 = 2·(R·P_tgt)/(R + P_tgt)`，用召回 R 作召回项、目标精确率 P_tgt 作精确项的调和平均，同时反映完整性与正确性（[Eq.4，第 5.1 节](https://arxiv.org/pdf/2511.03506)）。

**更新阶段（U）**（`N_target-upd = |G_upd|`）：Updating Accuracy `= N_correct-upd / N_target-upd`；Updating Hallucination Rate `= N_wrong-upd / N_target-upd`；Updating Omission Rate `= N_missed-upd / N_target-upd`。准确率越高越好，幻觉率、遗漏率越低越好（[Eq.5，第 5.2 节](https://arxiv.org/pdf/2511.03506)）。

**问答阶段（Q）**（`N_total-qa = 问题总数`）：QA Accuracy `= N_correct-qa / N_total-qa`；QA Hallucination Rate `= N_wrong-qa / N_total-qa`（用编造/错误信息作答）；QA Omission Rate `= N_missed-qa / N_total-qa`（因记忆缺失而没答）。答案对错由一个 LLM "Halu Eval" 裁判对照黄金答案判（correct / hallucination / omission / other）；多要素题必须**所有要素齐全**，否则算 Omission。准确率越高越好，另两个越低越好（[Eq.6，第 5.3 节；附录 C](https://arxiv.org/pdf/2511.03506)）。

**结果表缩写对照**（表 3）：`R`=召回，`Weighted R`=加权召回，`Target P`=目标精确率，`Acc.`=准确率，`FMR`=假记忆抵抗，`F1`=抽取 F1（均为抽取项）；`C`=正确率（Accuracy），`H`=幻觉率，`O`=遗漏率（更新与问答两阶段都用这三个报）。这些缩写与上面的正式指标一一对应（出处：[全文 PDF 表 3 标题](https://arxiv.org/pdf/2511.03506)；[HaluMem 仓库 eval/README](https://github.com/MemTensor/HaluMem)）。

**数据集规模**：两个子集，都来自 20 个虚拟用户。HaluMem-Medium 共 30,073 轮对话、人均上下文约 16 万 token（表 6：159,910.95 token/用户）、人均约 69.35 会话、14,948 个记忆点、3,467 个 QA 对。HaluMem-Long 把人均上下文撑到约 100 万 token（表 6：1,007,264.65 token/用户），靠插入无关对话实现，53,516 轮、人均约 120.85 会话，但**记忆点与 QA 黄金标准和 Medium 完全一样**（只是干扰上下文变多）。记忆点构成（两子集相同，表 6）：2,648 干扰、3,122 更新、9,116 画像、4,550 事件、1,282 关系 → 合计 14,948。题型构成（表 6，两子集相同）：基础事实回忆 828、多跳推理 769、动态更新 746、记忆边界 746、记忆冲突 198、泛化应用 180，六类合计 3,467。在 HaluMem-Medium 的 50% 上做过质量校验：准确率 95.70%、相关性 9.58/10、一致性 9.45/10，由 8 名标注员完成（出处：[全文 PDF 第 4 节 + 附录 A.3/表 6](https://arxiv.org/pdf/2511.03506)）。**注：表 6 原文的行标签与数值是交错排布的，上述记忆类型与题型子计数是从原始文本中"最佳匹配"转写而来，内部自洽（分别加总到 14,948 与 3,467），但读者应对照 PDF 里渲染好的表 6 再核一遍标签与数字的对应关系。**

## 2. HaluMem 假设的记忆接口 ↔ MemoWeft 门面方法映射表

| HaluMem 假设的操作 | 对应的 MemoWeft 门面方法 | 缺口说明 |
| --- | --- | --- |
| **Add Dialogue API**（写入/摄入，`run_task='add'`）——喂对话，系统自动抽取 | `createMemoWeftCore` + `ingestUserMessage`（逐条用户 turn）**然后**再调 `updateProfile`（做抽取） | **两步，不是一步。** `ingestUserMessage` 只把每条用户原话落成 spoken 证据（`createCore.ts:277`），它自己**不做抽取**；抽取/建画像发生在稍后的 `updateProfile`（distill→consolidate→attribute，`updateProfile.ts:62`）。HaluMem 期望"喂对话、系统自动抽取"，MemoWeft 拆成了"先存证据"+"后批量沉淀"。适配器每处理完一个 session 的所有 turn，要**显式调一次** `updateProfile` 才有可比对的记忆点。另有一处口径错配：distill 只总结**用户的话**、显式剔除助手回话（`distill.ts:35-49`），而 HaluMem 对话含 AI 说的 distractor——正好落在 MemoWeft 有意不摄入的部分（对基准是好事，但意味着两边对"输入是什么"的定义不同）。计时：MemoWeft 是同步 JS 调用、无 async-only 问题，但抽取延迟主要压在 `updateProfile` 上、要单独计时。 |
| **Get Dialogue Memory API**（按 session 回读，抽取/更新打分的前提） | `memory.listCognitions`（+每条的 `sources: EvidenceLink[]` 溯源链）；**无原生 per-session 过滤** | **最硬的错配。** `listCognitions` 列的是**整个 subject 的全部认知**（`managementApi.ts:426`），不是 `E(D_s)`。MemoWeft 的记忆模型里**根本没有 session 概念**（全 src grep，session 只出现在 `obs/runLog.ts` 的日志文件名里）。要凑出"session X 派生的每条 belief"，适配器必须：①摄入时把 session id 塞进 evidence 的 `originId` 或 `hostId`（自由字段，`evidence/model.ts:22/21`）；②读 `listCognitions`，对每条认知走 `sources` 链拿 evidenceId，再回查这些 evidence 的 session 标记，外部 join 出"本 session 新增的认知"。这套 join 库不提供，适配器自己写。与论文里 Zep 完全不可评、Memobase 得直读底层库同一难度——但 MemoWeft 至少给了 SQLite 库直读的退路（`dbPath` 已知）。另：MemoWeft 是 evidence/event/cognition 三层，gold 的"memory point"约当 cognition，也可能落在 `event.summary` 那层，粒度需人工对齐。 |
| **Retrieve Memory API**（查询时读，`run_task='search'`） | `recall`（`RecallInput{query}`）→ `RecalledCognitionItem[]{content,score,confidence,credStatus}` | **最干净的一对。** `recall` 走共享召回语义、按 topK 相似度排、带 invalid/archived/越界/衰减门控（`recall.ts:36`），正合 HaluMem"只要相关性排序、不打幻觉分"的口径。两处形状小错配：①召回的是**认知/belief** 不是原始证据，若 gold QA 期望原文级片段，粒度偏摘要；②召回长度是 topK **条数**（`config.retrieval.topK`），而非 Memobase 那种 **token 预算**（更新 250 / QA 500）——适配器要把 token 上限翻译成 topK，或截断拼接到目标 token 数。生成/裁判步由 HaluMem 外置 answer LLM 提供，MemoWeft 不参与，无需接。 |
| **Harness 形态**（新系统怎么接：`eval_<system>.py` + `evaluation.py --frame`） | 新增 `eval_memoweft.py`（Python）+ 一个 Node/TS 侧薄服务或 CLI 暴露 `createMemoWeftCore`/`ingest*`/`updateProfile`/`recall`/`listCognitions` | **跨语言边界是隐性成本。** HaluMem 适配器是 Python（`eval_memzero.py` 等），MemoWeft 是 TS/ESM 库（`src/index.ts` 全导出、无 Python 绑定）。`eval_memoweft.py` 不能直接 import，得经①本地 HTTP 薄服务（`testbench/server.mjs` 已是现成雏形，可扩出 `/add` `/getSession` `/search` 三端点），或②每 `run_task` 起一个 node CLI 子进程。`--version/--frame` 约定照抄现有适配器。三根线（ingest→Add、listCognitions+溯源→Get Dialogue Memory、recall→Retrieve）都在稳定门面上（`createMemoWeftCore` 是 [stable]），接线不难，难在上面三行的语义对齐。 |

（HaluMem 侧接口出处：[全文 PDF 第 5 节 + 附录 B](https://arxiv.org/pdf/2511.03506)；[eval/README](https://github.com/MemTensor/HaluMem/blob/main/eval/README.md)，已核对适配器文件清单与运行命令。MemoWeft 侧为本仓库代码引用。）

### 逐条缺口清单

1. **【无 session 边界】** MemoWeft 记忆模型里没有 session id；抽取/更新是**全 subject 批量**（`updateProfile→distill` 扫全部未覆盖证据 `distill.ts:53`，consolidate 从全部事件重算），不是 HaluMem 要的 `E(D_s)` / `G_upd` 的 per-session 单位。这是最大缺口，必须靠适配器把 session id 塞进 `evidence.originId/hostId` 再外部 join 重建。
2. **【抽取非随摄入同步】** `ingestUserMessage/ingestObservation` 只落原始证据、不抽取；belief 要等 `updateProfile` 才出。HaluMem 假设 Add Dialogue 就地自动抽取——两边时序模型不同，适配器要在每 session 末显式触发 `updateProfile` 并单独计这段延迟。
3. **【记忆点粒度三层错位】** HaluMem 的 gold 是扁平 memory-point 集合；MemoWeft 是 evidence（原料）→event（情境摘要）→cognition（判断）三层。gold point 大致对 cognition，但部分事实可能只沉在 `event.summary`，比对粒度要人工定线，否则召回率/精确率被粒度差异污染。
4. **【Memory Updating 打分对不齐】** HaluMem 要 `(m_old→m_new)` 成对。MemoWeft 更新语义是**不硬删、标 `invalidAt`/`conflicted`/用 contradict 链/merge 搬链重算置信**（`managementApi.ts` merge/invalidate）——它保留冲突与旧版本，而非产出干净的"改写前后对"。要从审计表（`management_log`）或认知的 `invalidAt`+`correctsEvidenceId` 反推出 old→new 对，是额外一层重建工作。
5. **【HaluMem 不考核的 MemoWeft 概念】** evidence-vs-cognition 两层分离、冲突**保留**而非消解（`credStatus:'conflicted'`、contradict 链、invalidate 不删）、MemoWeft 自算的 confidence 与时间衰减（`effectiveConfidence`）、隐私授权位（allowCloud/Local/Inference）——这些是 MemoWeft 的核心卖点，但 HaluMem 只做扁平记忆点集合的 diff，完全不 exercise。跑基准时它们要么被拍平、要么是噪声（如 conflicted 认知该不该算"抽取出来"直接影响精确率，需明确口径）。
6. **【生成/裁判非确定性】** QA 端 answer LLM 与 judge 是 HaluMem 外置且 LLM 打分；MemoWeft 的 `updateProfile` 也依赖 LLM 抽取（distill/consolidate 调模型）。两侧都非确定性，有跑间方差，需固定模型/温度并多跑取均，否则分数不可复现。
7. **【跨语言无绑定】** MemoWeft 是 TS/ESM、无 Python 接口；HaluMem 适配器是 Python。必须自建 HTTP 薄服务或子进程桥（`testbench/server.mjs` 可复用），这层胶水不产生记忆能力但占工时。

## 3. 跑通所需适配器的工作量估计

**估计：6–10 人日。**

重心不在"调门面方法"（`createMemoWeftCore`/`ingest*`/`recall` 都是 [stable]、接线约 1 天），而在填第 2 节那几个语义缺口。最吃工时的三块：

- **① per-session 重建（约 2–3 天，含试跑校准）**——MemoWeft 没有 session 概念，要设计一整套 Get-Dialogue-Memory 等价物："session id 经 `evidence.originId/hostId` 承载 → 每 session 末触发 `updateProfile` → 读 `listCognitions` 顺 `sources` 溯源链外部 join 出本 session 新增/变更认知"，并钉死"gold memory point 对 cognition 还是也算 `event.summary`"的粒度口径。
- **② Memory Updating 打分适配（约 1–2 天）**——把 MemoWeft"保留冲突、标 invalid、merge 搬链"的更新语义反推成 HaluMem 要的 `(m_old→m_new)` 成对，得从 `management_log`/`invalidAt` 里重建。
- **③ 跨语言桥（约 1 天）+ 数据集/工作流对接（约 1 天）**——`eval_memoweft.py` 经 HTTP 薄服务或 node 子进程调 TS 库（`testbench/server.mjs` 可复用为雏形）；再加 HaluMem 数据集加载器与 `run_task='add'/'search'` 工作流对接、把 Retrieve 的 token 预算翻译成 topK。

再留 **1–2 天**处理 LLM 抽取/裁判的非确定性（固定模型温度、多跑取均、把 conflicted 认知算不算"已抽取"的口径钉死），以及冒烟数据清理与结果落盘核对。

**区间取舍：** 若只求"能跑出一版数字、不深究更新打分严谨性"，可压到 **6 人日**；要三项任务（E/U/Q）都口径干净、可复现，取 **10 人日**更稳。

## 4. 预计占优 / 吃亏的指标各 3 条

### 预计【占优】

1. **False Memory Resistance（FMR，抽取）** —— 这是结构性优势而非启发式：只有**用户原话**才会变成 evidence（对话层只存 user msg、从不存助手回复），且 consolidate/attribute 会丢弃任何被引 evidence id 不在白名单里的认知（`consolidate.ts:224`、`attribute.ts:193`）——AI 提过但用户没确认的 distractor 没有可引 id，天然被忽略，正是 FMR（`N_miss/N_D`）奖励的行为。
2. **Memory Updating Hallucination Rate（更新幻觉率，H）** —— 一条没有可引用户原话的"correct"会被跳过、不动旧认知（`consolidate.ts:262`），且 confidence 由库自算（`computeConfidence`，忽略模型自报），模型没法编造或吹高一条错内容更新；"这只是把问题挪到 Omission"的反驳只对 conflict 路径成立、对 correct 路径不成立，故幻觉率的优势成立（代价是 Updating Omission 变差，见吃亏项）。
3. **Memory Accuracy（准确率/抗幻觉，抽取）** —— "无可溯源原话→不生成认知"加上推断项低基础置信（`baseByFormedBy inferred=200`），意味着 MemoWeft 输出**更少但更干净**的记忆，正合 `N_correct/N_extract` 的奖励。注意该论断仅限 Memory Accuracy，**不含 Target P**——Target P 是在已匹配子集上做的（`Σ s_j / |M_T|`），"少而干净"策略并不明显推动它，若拿它做优势论断则站不住。

### 预计【吃亏】

1. **Memory Recall / Weighted Recall（召回，抽取）** —— "跳过任何没有真实可引用户原话的认知"这条规则加上保守的 inferred-formedBy，会**漏抽**那些弱蕴含的黄金记忆，相比贪婪抽取一切的系统，`N_correct/N_should` 更低。
2. **Memory QA Omission Rate（问答遗漏率，O）** —— 读路径门控会扣住低置信/已衰减的认知（`minEffectiveConfidence=80`；状态半衰期 1.5 天、假设 2 天，`decay.ts`），而多要素题需**所有要素齐全**，MemoWeft 宁可"记忆不足就不答"、被判为 Omission 而不去猜。
3. **Memory Updating Omission Rate（更新遗漏率，O）** —— conflict 分支会**同时保留两条认知**、用户没显式纠正就拒绝覆盖（`consolidate.ts:280-290`），于是一个期望"新值胜出"的黄金更新对会被计为漏更。

（占优/吃亏的判定基于本仓库代码行为核实；占优三条均标注为"经反驳仍成立"。）

## 5. 结论：是否推荐进下一批次

**建议：有条件推荐。**

一句话判断：门面接线本身不难（`createMemoWeftCore`/`ingest*`/`recall` 都是 [stable]，Retrieve 一对几乎现成），但 HaluMem 的**操作级、per-session、成对更新**假设与 MemoWeft"无 session、批量沉淀、保留冲突"的核心模型存在结构性错配——**能跑，但要靠适配器重建一层等价物**（session join + old→new 反推），且部分 MemoWeft 卖点（冲突保留、置信衰减、隐私位）根本不被 HaluMem 考核。

依据：工作量落在 6–10 人日的可控区间；预计在 **FMR、Updating 幻觉率、抽取准确率**上占优，正好能量化"少而干净"这一设计取向，是有价值的对外证据；但在**召回、QA 遗漏、Updating 遗漏**上会吃亏，需在解读时讲清这是"宁缺毋滥"策略的必然代价、而非能力缺陷。

**建议的进入条件（满足其一即可推进）：**
- 明确本轮目标是"拿占优指标做设计取向的证据"，接受召回/遗漏类指标偏低的解读口径；且
- 先钉死三个口径再动手：①gold memory point 对 cognition 还是也算 `event.summary`；②conflicted 认知算不算"已抽取"；③LLM 抽取/裁判的固定模型+温度+多跑取均方案。

**此为给维护者拍板的建议，非既定结论。** 方向、是否投这 6–10 人日、以及是否接受"操作级基准只能拍平考核 MemoWeft 核心概念"这一前提，请维护者定夺。

## 6. 附注：LoCoMo 与 LongMemEval 接入量级粗估

**LoCoMo**（[ACL 2024, arXiv 2402.17753](https://arxiv.org/abs/2402.17753)；[仓库](https://github.com/snap-research/locomo)）——接入量级**中等**。数据是单个 JSON（`data/locomo10.json`），系统只需摄入带时间戳的会话再回答自由文本问题；但官方 harness 偏基线（`evaluate_gpts.sh` 等绑定具体模型），没有干净的预测文件契约，得自己写驱动循环 JSON、喂对话、收答案，并复用/改它的 F1+judge 打分器。约几百行胶水。

**LongMemEval**（[ICLR 2025, arXiv 2410.10813](https://arxiv.org/abs/2410.10813)；[仓库](https://github.com/xiaowu0162/LongMemEval)）——接入量级**低**。契约干净标准化：系统收到带时间戳会话+问题，只需按 JSONL 每题输出一条 `{question_id, hypothesis}`，`evaluate_qa.py`（GPT-4o 裁判）打分、`print_qa_metrics.py` 汇总，无需自写打分器。约 100 行胶水，是两者中最轻的。

## 参考来源

- [https://arxiv.org/abs/2511.03506](https://arxiv.org/abs/2511.03506)
- [https://arxiv.org/pdf/2511.03506](https://arxiv.org/pdf/2511.03506)
- [https://github.com/MemTensor/HaluMem](https://github.com/MemTensor/HaluMem)
- [https://github.com/MemTensor/HaluMem/blob/main/eval/README.md](https://github.com/MemTensor/HaluMem/blob/main/eval/README.md)
- [https://huggingface.co/papers/2511.03506](https://huggingface.co/papers/2511.03506)
- [https://huggingface.co/datasets/MemTensor/MemOS_eval_result](https://huggingface.co/datasets/MemTensor/MemOS_eval_result)
- [https://arxiv.org/abs/2402.17753](https://arxiv.org/abs/2402.17753)
- [https://github.com/snap-research/locomo](https://github.com/snap-research/locomo)
- [https://github.com/snap-research/locomo/blob/main/README.MD](https://github.com/snap-research/locomo/blob/main/README.MD)
- [https://deepwiki.com/snap-research/locomo/2-locomo-dataset](https://deepwiki.com/snap-research/locomo/2-locomo-dataset)
- [https://www.emergentmind.com/topics/locomo-benchmark](https://www.emergentmind.com/topics/locomo-benchmark)
- [https://arxiv.org/abs/2410.10813](https://arxiv.org/abs/2410.10813)
- [https://github.com/xiaowu0162/LongMemEval](https://github.com/xiaowu0162/LongMemEval)
- [https://xiaowu0162.github.io/long-mem-eval/](https://xiaowu0162.github.io/long-mem-eval/)
- [https://openreview.net/forum?id=pZiyCaVuti](https://openreview.net/forum?id=pZiyCaVuti)
