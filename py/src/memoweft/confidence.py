"""由确定性规则计算把握度，不采信模型自报分数；与 TypeScript 实现保持一致。

跨语言数值契约要求使用 Math.round 的半值向上语义，见 _math.round_half_up。
"""
from __future__ import annotations

from collections.abc import Sequence
from typing import Optional

from ._math import round_half_up
from .config import CONFIG, Config
from .types import ConfidenceInputs, ContentType, CredStatus, FormedBy, HedgeInput


def is_transient(content_type: ContentType, cfg: Config = CONFIG) -> bool:
    return content_type in cfg.consolidation.transient_types


def compute_confidence(i: ConfidenceInputs, cfg: Config = CONFIG) -> int:
    """计算 0~1000 的把握度，并对时效类内容应用上限；语义与 confidence.ts 一致。"""
    c = cfg.consolidation
    base = c.base_by_formed_by[i.formed_by]
    support = min(max(i.support_count - 1, 0), c.support_cap) * c.support_step
    penalty = i.contradict_count * c.contradict_penalty
    result = max(c.min_confidence, min(c.confidence_hard_max, round_half_up(base + support - penalty)))
    # 含糊自述封顶:用户主动说、但说得含糊(assertion_strength=weak)的 stated,封到与 confirmed 底分同档。
    #   为什么是封顶而不是换底分:载体维答"谁的话"、与含糊与否正交,改底分会把两件事揉成一件。
    #   与 transient_cap 同为 min,可叠加(结果取三者最小),先后顺序不影响数值;
    #   这里排在 transient 之前只为与 confidence.ts 的行文顺序逐行对齐,便于两侧对读。
    if i.hedged:
        result = min(result, c.hedge_cap)
    if is_transient(i.content_type, cfg):
        result = min(result, c.transient_cap)
    return result


def is_hedged_stated(formed_by: FormedBy, supports: Sequence[Optional[HedgeInput]]) -> bool:
    """判定一条认知是不是【含糊自述】:用户主动说的,但话说得含糊。语义与 confidence.ts 的
    ``isHedgedStated`` 逐位一致(TS 侧同样放在 confidence 模块,不在 derive_formed_by 那边)。

    规则:``formed_by == "stated"`` 且它的支持证据里,``proposition_origin == "user_stated"``
    的那些【没有一条 explicit】且【至少有一条 weak】→ True。

    逐条说明为什么是这几条边界:
      - **非 stated 一律 False**:载体维已经把 confirmed / observed / inferred / ruled 压到低底分了,
        再叠一层封顶既无意义、又会把 hedged 变成一个到处生效的隐性扣分项。
      - **没有解析(或两维为 None)一律 False**:derive_formed_by 在没解析时会结构兜底成 stated,
        那种 stated 我们并不知道用户说得含不含糊 —— 解析不出就不臆造惩罚。
      - **只看 user_stated 那部分证据**:assistant_proposed 的 weak 是"对 AI 猜测的含糊回应",
        它压根不构成 stated 的理由(那条路走 confirmed),不该反过来污染同一认知里真正的自述。
      - **explicit 一票否决**:用户只要把话说明白过一次,命题边界就定了。
      - **只拦 weak,不拦 none**:实测(N=10,Wilson 95%CI)显著含糊输入的 weak 率 100%[70+,100]、
        明确断言对照 0%[0,28],而 ``assertion_strength="none"`` 的实测填充率为 0 ——
        拦 none 收益为零、假阳风险(把确定陈述错误封顶)却是实的。

    Args:
        formed_by: 该认知的载体/形成方式;调用点传什么就判什么(**不重新派生**)。
        supports: 该认知支持证据的语义解析,**必须与该调用点算 support_count 用的是同一个集合**。
            拿不到解析的条目传 None 即可。
    """
    if formed_by != "stated":
        return False
    saw_weak = False
    for r in supports:
        # 无解析 / 非用户主动提出的命题:不参与判定(理由见上:兜底 stated 与附和都不算数)。
        if r is None or r.proposition_origin != "user_stated":
            continue
        if r.assertion_strength == "explicit":
            return False  # 明确断言一票否决。
        if r.assertion_strength == "weak":
            saw_weak = True  # "none" 与 None 都不算(只拦 weak)。
    return saw_weak


def derive_cred_status(
    confidence: int,
    contradict_count: int,
    content_type: ContentType,
    cfg: Config = CONFIG,
    support_count: int = 0,
) -> CredStatus:
    """根据把握度、反对证据和内容类型确定可信状态；语义与 confidence.ts 一致。

    support_count 是中间态判据：支撑条数多于反证 → "contested"（有争议但仍成立），
    否则 "conflicted"（对峙或反证占优，不消解、原样暴露）。省略 → 退回保守的
    "conflicted"（不知道支撑数时不能假设支撑压倒反证）。
    """
    if contradict_count > 0:
        # 保留冲突可见性，不自动消解反对证据；力量对比决定暴露成哪一档。
        return "contested" if support_count > contradict_count else "conflicted"
    t = cfg.consolidation.cred_thresholds
    if is_transient(content_type, cfg):
        return "low" if confidence >= t.low else "candidate"
    if confidence >= t.stable:
        return "stable"
    if confidence >= t.limited:
        return "limited"
    if confidence >= t.low:
        return "low"
    return "candidate"
