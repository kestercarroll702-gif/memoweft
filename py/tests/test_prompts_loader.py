"""prompts loader:载入 shared/prompts.json 8 条受治理提示词 + get + versions + jsonRepairNudge。"""
from __future__ import annotations

from memoweft.llm.prompts import get_prompt, json_repair_nudge_text, prompt_text, prompt_versions


def test_prompts_loaded() -> None:
    versions = prompt_versions()
    assert len(versions) == 8
    assert set(versions) == {
        "attribute", "consolidate", "distill", "jsonRepairNudge",
        "proposeAsk", "reply", "revisitConflicts", "trends",
    }
    assert versions["consolidate"] == "v7"  # 与 prompt-hashes.snapshot 一致
    assert versions["distill"] == "v2"


def test_get_prompt_and_text() -> None:
    p = get_prompt("distill")
    assert p.id == "distill" and p.version == "v2"
    assert p.text["zh"] and p.text["en"]
    assert prompt_text("distill", "zh") == p.text["zh"]


def test_json_repair_nudge() -> None:
    zh = json_repair_nudge_text("zh")
    en = json_repair_nudge_text("en")
    assert "JSON" in zh and "JSON" in en
    assert zh != en
