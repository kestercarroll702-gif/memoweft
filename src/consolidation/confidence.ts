/**
 * 把握度自算（confidence policy：由规则计算，不采信模型自报）。
 *
 * 关键纪律：**confidence 由 MemoWeft 按规则算，不采信 LLM 自报。**
 * 规则：起步分按形成方式（推测最低）+ 支持证据加分 - 反对证据扣分。参数在 config（运行后校准）。
 *
 * 分型时间策略：临时类（state）置信封顶、永不进"稳定/有限"——
 * 临时情绪重复 ≠ 稳定特质，不能越攒越高；时间衰减与有效期由独立的后台策略处理。
 *
 * 含糊自述策略（hedged）：载体维（`deriveFormedBy`）答的是「**谁的话**」，hedged 答的是
 * 「**这话说得含不含糊**」，两者正交，所以 hedged **不进** `deriveFormedBy`（那个函数的
 * `CarrierInput` 也就不必再多带一维），而是作为 policy 落在这里：`isHedgedStated` 判定 +
 * `hedgeCap` 封顶。
 *   为什么必须封：`assertion_strength` 早已解析并落 semantic_resolution 表，却从没影响过把握度——
 *   于是「我可能不太会做饭」（主动含糊自述，stated 底分 600）比「点头认了 AI 的猜测」
 *   （assistant_proposed + 附和，confirmed 280）还高。**保守性倒置**：含糊自述连命题边界都没定，
 *   却比一个已被钉死的命题拿更高分。封到 `hedgeCap`（= confirmed 底分）就把这个倒置抹平。
 */
import { config, type MemoWeftConfig } from '../config.ts';
import type { ContentType, FormedBy, CredStatus } from '../cognition/model.ts';
import type { AssertionStrength, PropositionOrigin } from '../interaction/model.ts';

export interface ConfidenceInputs {
  contentType: ContentType;
  formedBy: FormedBy;
  supportCount: number;
  contradictCount: number;
  /** 这条认知的支撑话语是不是【含糊自述】（判定见 `isHedgedStated`）→ 封到 `hedgeCap`。
   *  **可选**：省略 = 不封顶。这样既有调用点（以及 parity 夹具里原有的用例）行为逐位不变，
   *  接线是逐个调用点主动加上去的，不是默默改掉所有人的默认值。 */
  hedged?: boolean;
}

function isTransient(contentType: ContentType, cfg: MemoWeftConfig): boolean {
  return cfg.consolidation.transientTypes.includes(contentType);
}

/** 计算 0~1000 的置信度（恒 >0）；含糊自述封顶、临时类封顶。cfg 可注入，省略时使用全局单例。 */
export function computeConfidence(i: ConfidenceInputs, cfg: MemoWeftConfig = config): number {
  const c = cfg.consolidation;
  const base = c.baseByFormedBy[i.formedBy];
  const support = Math.min(Math.max(i.supportCount - 1, 0), c.supportCap) * c.supportStep;
  const penalty = i.contradictCount * c.contradictPenalty;
  let result = Math.max(c.minConfidence, Math.min(1000, Math.round(base + support - penalty)));
  // 含糊自述（stated 但话说得含糊）封顶：拉平「主动含糊 600 > 点头认账 280」的保守性倒置。
  //   放在 transientCap **之前**，但两个都是 min、可交换——真正重要的是两者都用 min 而非赋值：
  //   min 只压不抬（inferred 200 遇 hedged 仍是 200，绝不会被"封"到 280），且可自由叠加
  //   （含糊的 state = min(600, 280, 300) = 280）。
  if (i.hedged) result = Math.min(result, c.hedgeCap);
  // 临时类（如 state）封顶：重复不升成稳定。
  if (isTransient(i.contentType, cfg)) result = Math.min(result, c.transientCap);
  return result;
}

/** `isHedgedStated` 的单条支持证据输入：只要语义解析里的这两维。
 *
 *  故意做得这么窄，是为了**同时服务形成期与重算期**：
 *    - 形成期（consolidate 的 new / 并存 / correct）传内存里 `resolutionOf` 的值；
 *    - 重算期（reinforce / conflict / managementApi 三点）传 `semanticResolutionStore` 回查的行。
 *  两者都结构兼容这个形状，无需各自再造一层适配。对比 `deriveFormedBy` 的 `CarrierInput`
 *  还要 `sourceKind` 与 `precedingAiContext`——那两样在重算期作用域内根本没有现成来源，
 *  这正是「hedged 走 confidence 层」能落地、而「重算期重新派生 formedBy」落不了地的结构原因。 */
export interface HedgeInput {
  propositionOrigin: PropositionOrigin | null;
  assertionStrength: AssertionStrength | null;
}

/**
 * 判定一条认知是不是【含糊自述】：用户主动说的，但话说得含糊。
 *
 * 规则：`formedBy === 'stated'` 且它的支持证据里，`propositionOrigin === 'user_stated'` 的那些
 * **没有一条 explicit** 且 **至少有一条 weak** → true。
 *
 * 逐条说明为什么是这几条边界：
 *  - **非 stated 一律 false**：载体维已经把 confirmed / observed / inferred / ruled 压到低底分了，
 *    再叠一层封顶既无意义、又会把 hedged 变成一个到处生效的隐性扣分项。hedged 只修
 *    「stated 底分 600 太高」这一个具体缺口。
 *  - **没有 resolution（或解析里两维为 null）一律 false**：`deriveFormedBy` 在没解析时会结构兜底成
 *    stated，那种 stated 我们**并不知道**用户说得含不含糊——解析不出就不臆造惩罚。
 *  - **只看 user_stated 那部分证据**：assistant_proposed 的 weak 是「对 AI 猜测的含糊回应」，
 *    它压根不构成 stated 的理由（那条路走 confirmed），不该反过来污染同一认知里真正的自述。
 *  - **explicit 一票否决**：只要用户在某一条证据里把话说明白过，这个命题的边界就定了，
 *    别的含糊话不该再把它拖下来。
 *  - **只拦 weak，不拦 none**：实测（N=10，Wilson 95%CI）4 个显著含糊输入的 weak 率全为
 *    100%[70+,100]、明确断言对照为 0%[0,28]，而 `assertion_strength='none'` 的实测填充率为 **0**——
 *    也就是说 none 在真实数据里只可能来自误标。拦 none 收益为零、假阳风险（把确定陈述错误封顶）实在。
 *    若日后 none 出现了明确语义（例如「疑问句/无断言」），可在此扩展，届时需要重新做一次填充率实测。
 *
 * @param formedBy 该认知的载体/形成方式；调用点传什么，这里就判什么（**不重新派生**）。
 * @param supports 该认知支持证据的语义解析，**必须与该调用点传给 `supportCount` 的是同一个集合**。
 *   （不变式：consolidate 的 reinforce 用全链、并存新认知用本轮 add——两处 support 集合定义本就不同，
 *    hedged 必须跟着各自那一个走，否则并存路的封顶永远触发不了。）拿不到解析的条目传 `null` 即可。
 */
export function isHedgedStated(
  formedBy: FormedBy,
  supports: readonly (HedgeInput | null)[],
): boolean {
  if (formedBy !== 'stated') return false;
  let sawWeak = false;
  for (const r of supports) {
    // 无解析 / 非用户主动提出的命题：不参与判定（理由见上：兜底 stated 与附和都不算数）。
    if (!r || r.propositionOrigin !== 'user_stated') continue;
    if (r.assertionStrength === 'explicit') return false; // 明确断言一票否决。
    if (r.assertionStrength === 'weak') sawWeak = true; // 'none' 与 null 都不算（只拦 weak）。
  }
  return sawWeak;
}

/** 由把握度 + 反对证据 + 内容类型定可信状态。cfg 可注入（缺省=全局单例）。
 *
 *  supportCount 是【中间态判据】：支撑条数多于反证 → `contested`（有争议但仍成立），
 *  否则 `conflicted`（对峙或反证占优，不消解、原样暴露）。此前只要有一条反证就一律
 *  conflicted，于是 6 支撑 1 反证与 1 支撑 1 反证状态完全相同——computeConfidence 早已
 *  算出两者差别，是这里把它抹平了，连带让 revisitConflicts 反复拿明明站得住的认知去打扰用户。
 *
 *  判据不走置信度阈值：`stated` 类支撑加分封顶 200（base 600 + 200 − penalty 120 = 680），
 *  6 支撑 1 反证也够不到 stable 的 750——用阈值做判据在结构上就走不通。
 *
 *  supportCount 省略 → 退回旧行为（保守判 conflicted）。不知道支撑数时【不能假设】
 *  支撑压倒反证；库内调用点一律显式传。 */
export function deriveCredStatus(
  confidence: number,
  contradictCount: number,
  contentType: ContentType,
  cfg: MemoWeftConfig = config,
  supportCount = 0,
): CredStatus {
  // 有反对证据 → 先暴露，不消解；力量对比决定暴露成哪一档。
  if (contradictCount > 0) return supportCount > contradictCount ? 'contested' : 'conflicted';
  // 临时类永不进"稳定/有限"，最多"低置信"。
  if (isTransient(contentType, cfg)) {
    return confidence >= cfg.consolidation.credThresholds.low ? 'low' : 'candidate';
  }
  const t = cfg.consolidation.credThresholds;
  if (confidence >= t.stable) return 'stable';
  if (confidence >= t.limited) return 'limited';
  if (confidence >= t.low) return 'low';
  return 'candidate';
}
