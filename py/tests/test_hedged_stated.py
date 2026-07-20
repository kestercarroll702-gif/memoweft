"""含糊自述（hedged）判定与封顶的纯函数层测试；对称于 TS 的 tests/hedgedAssertion.test.ts。

靶心：修掉「保守性倒置」——用户主动说但话说得含糊（assertion_strength=weak）的自述，
原本按 stated 拿 600 底分，比"点头认一个 AI 已经钉死的命题"（confirmed 280）还高。

本仓库有【三次】"TS 修了、Python 移植原样保留"的前科，平价夹具是唯一防线；
夹具只验"拿到 hedged=true 之后 cap 算得对不对"，**不验"hedged 是怎么判出来的"**，
所以判定分支必须由本文件从 Python 侧独立钉住。
"""
from __future__ import annotations

from memoweft.confidence import compute_confidence, is_hedged_stated
from memoweft.config import CONFIG
from memoweft.types import AssertionStrength, ConfidenceInputs, FormedBy, HedgeInput, PropositionOrigin


def _h(origin: PropositionOrigin | None, strength: AssertionStrength | None) -> HedgeInput:
    """造一条支持证据的语义解析（只含 is_hedged_stated 看的两维）。"""
    return HedgeInput(proposition_origin=origin, assertion_strength=strength)


# ── 判定边界逐条（与 TS 侧 test 一一对应）──────────────────────────────


def test_single_hedged_self_report_is_hedged() -> None:
    """本次要修的正例："我可能不太会做饭"。"""
    assert is_hedged_stated("stated", [_h("user_stated", "weak")]) is True


def test_explicit_assertion_not_hedged() -> None:
    """"我是素食者"原样拿 stated 满分。"""
    assert is_hedged_stated("stated", [_h("user_stated", "explicit")]) is False


def test_explicit_vetoes_weak() -> None:
    """用户只要把话说明白过一次，命题边界就定了，别的含糊话不该再把它拖下来。"""
    assert is_hedged_stated("stated", [_h("user_stated", "weak"), _h("user_stated", "explicit")]) is False


def test_all_weak_is_hedged() -> None:
    """含糊说了几遍还是含糊，攒不出确定性。"""
    assert is_hedged_stated("stated", [_h("user_stated", "weak"), _h("user_stated", "weak")]) is True


def test_none_strength_does_not_trigger() -> None:
    """只拦 weak 不拦 none：实测 none 填充率为 0，拦它收益为零、假阳风险却是实的。"""
    assert is_hedged_stated("stated", [_h("user_stated", "none")]) is False
    assert is_hedged_stated("stated", [_h("user_stated", None)]) is False


def test_none_is_not_a_veto() -> None:
    """none 只是不算数，不是否决票。"""
    assert is_hedged_stated("stated", [_h("user_stated", "none"), _h("user_stated", "weak")]) is True


def test_assistant_proposed_weak_does_not_pollute() -> None:
    """对 AI 猜测的含糊回应走的是 confirmed 那条路，压根不构成 stated 的理由。"""
    assert is_hedged_stated("stated", [_h("assistant_proposed", "weak"), _h("user_stated", "explicit")]) is False
    assert is_hedged_stated("stated", [_h("assistant_proposed", "weak")]) is False


def test_missing_resolution_falls_back_to_not_hedged() -> None:
    """derive_formed_by 没解析时会结构兜底成 stated，那种 stated 不知道说得含不含糊 —— 不臆造惩罚。"""
    assert is_hedged_stated("stated", [None]) is False
    assert is_hedged_stated("stated", [_h(None, "weak")]) is False


def test_empty_supports_not_hedged() -> None:
    assert is_hedged_stated("stated", []) is False


def test_non_stated_never_hedged() -> None:
    """hedged 只修「stated 底分 600 太高」这一个缺口；别的载体维底分本就低。"""
    weak = [_h("user_stated", "weak")]
    # 显式声明元组类型：mypy --strict 下 for 变量会被推成 str，与 FormedBy(Literal) 不兼容。
    non_stated: tuple[FormedBy, ...] = ("confirmed", "observed", "ruled", "inferred")
    for fb in non_stated:
        assert is_hedged_stated(fb, weak) is False, fb


# ── 封顶行为（与 TS 侧数值逐位一致）────────────────────────────────────


def test_hedge_cap_applies() -> None:
    plain = ConfidenceInputs(content_type="fact", formed_by="stated", support_count=1, contradict_count=0)
    hedged = ConfidenceInputs(
        content_type="fact", formed_by="stated", support_count=1, contradict_count=0, hedged=True
    )
    assert compute_confidence(plain) == 600
    assert compute_confidence(hedged) == 280


def test_support_cannot_lift_past_cap() -> None:
    """攒满支持也顶不上去：支持加分封顶 200，600+200=800 遇 hedged 仍是 280。"""
    i = ConfidenceInputs(
        content_type="fact", formed_by="stated", support_count=6, contradict_count=0, hedged=True
    )
    assert compute_confidence(i) == 280


def test_hedge_cap_is_min_not_assignment() -> None:
    """min 只压不抬：inferred 的 200 不会被"封"到 280。"""
    i = ConfidenceInputs(
        content_type="hypothesis", formed_by="inferred", support_count=1, contradict_count=0, hedged=True
    )
    assert compute_confidence(i) == 200


def test_composes_with_transient_cap() -> None:
    """含糊的 state = min(600, 280, 300) = 280。"""
    plain = ConfidenceInputs(content_type="state", formed_by="stated", support_count=1, contradict_count=0)
    hedged = ConfidenceInputs(
        content_type="state", formed_by="stated", support_count=1, contradict_count=0, hedged=True
    )
    assert compute_confidence(plain) == 300
    assert compute_confidence(hedged) == 280


def test_omitted_hedged_preserves_old_behavior() -> None:
    """省略 hedged ≡ hedged=False ≡ 旧行为（既有调用点与 parity 旧用例逐位不变）。"""
    omitted = ConfidenceInputs(content_type="fact", formed_by="stated", support_count=3, contradict_count=0)
    explicit_false = ConfidenceInputs(
        content_type="fact", formed_by="stated", support_count=3, contradict_count=0, hedged=False
    )
    assert compute_confidence(omitted) == 680  # 600 + 2*40
    assert compute_confidence(explicit_false) == compute_confidence(omitted)


def test_cap_value_semantics() -> None:
    """封顶值与 confirmed 底分对齐，且封顶后攒满支持仍 < limited。"""
    c = CONFIG.consolidation
    assert c.hedge_cap == 280
    assert c.hedge_cap == c.base_by_formed_by["confirmed"]
    assert c.hedge_cap + c.support_step * c.support_cap < c.cred_thresholds.limited


def test_inversion_is_flattened() -> None:
    """端到端语义：含糊自述不再高于点头认账，倒置被抹平。"""
    hedged_self_report = compute_confidence(
        ConfidenceInputs(
            content_type="trait", formed_by="stated", support_count=1, contradict_count=0, hedged=True
        )
    )
    nod_at_ai_guess = compute_confidence(
        ConfidenceInputs(content_type="trait", formed_by="confirmed", support_count=1, contradict_count=0)
    )
    assert hedged_self_report <= nod_at_ai_guess
