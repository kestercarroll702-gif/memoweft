/**
 * deriveFormedBy —— 从支持证据集派生认知的【载体维】来源强度（v0.6 Phase 3 · D-0035）。
 *
 * 规范 = `docs/internal/v0.6-impact-report.md:84-96` 的派生表（含 2026-07-16 补拍的 select 行）。
 * 本文件是那张表的代码实现，**不听 LLM 自报 formed_by**（D-0034 决策②）。
 *
 * ## 只算载体维（D-0035 拍板①：决策② 由「全面接管」收缩为「接管载体维」）
 * 只回答**「这条信息是谁的话」**：`stated` / `confirmed` / `observed`。
 * **不算 `inferred`** —— 那是另一个维度:「这条认知**离原话有多远**」(推断距离)，仍由模型报。
 *   理由（风险不对称）：把 `confirmed`(280) 说成 `stated`(600) 是**往高了骗**——这是铁律 3a 要防的，
 *   必须代码接管；而模型说「这是我推断的」(`inferred`/200) 是**往低了报**、没有骗人的动机，且推断
 *   距离本来就只有模型知道（它才知道这条认知是不是从原话推出来的）。
 *   反例（派生表照字面实现就会踩）：「怎么找女朋友」是 spoken ∧ user_stated ∧ explicit，按表得
 *   stated/600，但它推出的「用户单身」其实该是 inferred/200 —— 差 3 倍，且所有推断型认知都中招。
 *
 * ## 多证据取最弱（D-0035 拍板②）
 * `support_evidence_ids` 是数组，而派生表逐条给规则、对聚合**一字未提**。取最弱的依据：
 *   「支持集里有一条是附和 ⇒ 这条认知至少有一环是附和」是**蕴含**；取最强隐含的反向命题**不是**。
 * 取最强被否有实证：`pickSupport`（consolidate.ts）**只查 id 白名单、不查相关性**，`validEvidence`
 *   覆盖整批（生产 batchSize=12 轮对话），「只引真正相关的」今天只由提示词软判 → 取最强时，
 *   「AI 诱导 + 用户附和」的认知**只要顺带引一条同批的无关主动陈述**就得 stated：600+40=640≥limited；
 *   引 5 条 → 800≥stable。不需要恶意模型，一个「过度引用」的模型就够。
 * ⚠ 已知盲区：eval 语料**异质支持集 0/49** → 全量 eval 对这个选择**零鉴别力**，只能靠单测钉。
 *
 * ## 兜底：spoken 但没解析
 * 探针实测（2026-07-16 全量 49 场景）：spoken 证据的解析覆盖率 **82.5%**（40 条里 33 条有解析；
 *   emotion-cap 仅 50%、chitchat-negative 71%）→ **兜底真的会被用到，不是理论情形**。
 * 派生表 :93 的「其它 / 无法解析 → `inferred`(200)」写的是「**解析失败**」的情形；照字面套到
 *   「spoken 无解析」会把旧盘本该 stated(600) 的认知打成 200 → **全盘塌**（且拍板②的取最弱会放大它）。
 * 本实现改用**结构事实**兜底，不是猜：**没有 AI 上一句，就不存在可附和的命题** →
 *   `proposition_origin` 结构上只可能是 `user_stated` → 正是派生表第 3 行 → `stated`。
 *   有 AI 上文但没解析 → 可能是附和 → 保守取 `confirmed`（与拍板②的取最弱同一品味）。
 * 这不是新规范，是**派生表 + 结构事实的推论**。探针实证：旧 42 盘 `assistant_proposed` 计数为 0
 *   （它们无一条带 precedingAiContext，CORP-20 强制）→ 兜底对旧盘恒取 `stated` → **零回归**。
 *
 * ## 边界
 * - **只贴标签、不删认知**：派生表第 5 行「`confirmed`(弱)或**不形成**」里的「不形成」**不归本函数**
 *   —— 产不产认知永远是模型的事（否则就是代码在删认知 = 新行为）。本函数只回答「这条的载体是谁」。
 * - **不从 index.ts 导出**（铁律 4：无外部消费者）。这与 `computeConfidence` 导出了的先例不一致，
 *   是刻意的：那两个是宿主可能要复算的，本函数纯属 consolidate 内部件（同 `sourceLabel` 的处理）。
 * - 本函数**不碰 confidence**（铁律 3b）：formedBy 是分类，分数由 `computeConfidence` 按规则算。
 */
import type { SourceKind } from '../evidence/model.ts';
import type { ResponseAct, PropositionOrigin } from '../interaction/model.ts';

/** 载体维的三个取值——`FormedBy` 的子集（不含 `inferred`/`ruled`，见文件头）。 */
export type CarrierFormedBy = 'stated' | 'confirmed' | 'observed';

/** 逐条支持证据的派生输入：来源 + 有没有 AI 上一句 + 它的语义解析（可无）。 */
export interface CarrierInput {
  sourceKind: SourceKind;
  /** 该证据的 preceding_ai_context（经 `evidenceStore.precedingAiContextOf` 取）。空 = 没有 AI 上一句。 */
  precedingAiContext: string | null;
  /** 该证据的语义解析。模型没产 / 没接 store → null，走兜底（见文件头【兜底】）。 */
  resolution: { responseAct: ResponseAct | null; propositionOrigin: PropositionOrigin | null } | null;
}

/**
 * 载体维强弱序，锚定 `config.baseByFormedBy` 的底分：confirmed(280) < observed(350) < stated(600)。
 * 取最弱 = rank 最小。**改 config 底分时须同步核对本序**（否则「取最弱」会名不副实）。
 */
const CARRIER_RANK: Record<CarrierFormedBy, number> = { confirmed: 0, observed: 1, stated: 2 };

/** 单条证据 → 载体维。规则逐条对应派生表，见文件头。 */
function deriveOne(e: CarrierInput): CarrierFormedBy {
  // 派生表前两行：observed / tool 不是用户在说话 → observed（**绝不 stated**）。这两行不需要 resolution。
  //   sourceKind='inferred'（AI 推测型证据，罕见）一并归此：它同样不是用户亲口说的。
  if (e.sourceKind !== 'spoken') return 'observed';

  const hasAiContext = (e.precedingAiContext ?? '').trim().length > 0;
  const r = e.resolution;

  // 兜底：没解析、或解析里 propositionOrigin 收敛成了 null（非法枚举）——见文件头【兜底】。
  if (!r || r.propositionOrigin === null) return hasAiContext ? 'confirmed' : 'stated';

  // 派生表第 3 行：用户自己说出来的内容 → stated。
  if (r.propositionOrigin === 'user_stated') return 'stated';

  // assistant_proposed：命题是 AI 提的、载体不是用户 → 至多 confirmed（表第 4/5/6 行：affirm / weak / select）。
  //   唯一例外是 negate（表 :90 + 提示词 v5 的【附和·否认】分支）：用户否认 AI 的猜测时，被断言的是
  //   那个【否定命题】，而那是用户自己的明确表达 → stated。
  if (r.responseAct === 'negate') return 'stated';

  // 其余 response_act（affirm / select / elaborate / ask / none / other / null）在 assistant_proposed 下
  //   一律 confirmed —— 保守：命题既然是 AI 提的，载体就不是用户，绝不可升到 stated。
  //   （表只明确议定了 affirm / weak / select / negate；elaborate / ask / none / other 属表未覆盖的组合，
  //     按「assistant_proposed ⇒ 载体不是用户」这条上位原则收敛，不另立规则。）
  return 'confirmed';
}

/**
 * 支持证据集 → 载体维来源强度（取最弱）。
 *
 * @returns 空集时返回 `null` —— 调用方按「算不出」处理，**不要瞎猜一个默认值**。
 */
export function deriveFormedBy(evidences: readonly CarrierInput[]): CarrierFormedBy | null {
  let weakest: CarrierFormedBy | null = null;
  for (const e of evidences) {
    const c = deriveOne(e);
    if (weakest === null || CARRIER_RANK[c] < CARRIER_RANK[weakest]) weakest = c;
  }
  return weakest;
}
