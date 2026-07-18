"""validate_bundle parity:好/坏例的 ValidateResult 与 TS(shared/parity/bundle-validate.json)逐字一致(含消息)。"""
from __future__ import annotations

from conftest import parity

from memoweft.portable import validate_bundle


def test_validate_bundle_matches_ts() -> None:
    cases = parity("bundle-validate.json")["cases"]
    assert len(cases) >= 10
    for case in cases:
        got = validate_bundle(case["bundle"]).as_dict()
        assert got == case["expected"], f"validateBundle 分叉 @ {case['label']}:\n got:  {got}\n want: {case['expected']}"
