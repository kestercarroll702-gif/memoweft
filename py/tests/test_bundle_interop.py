"""便携包互通:TS 生成的合法包(shared/parity/bundle.json)→ Python 建同构库导入 → 保真(id/时间戳/溯源链)。

这是 1.3 最强的跨语言证据:TS 侧产出的记忆包,Python 侧原样读回、数据不丢。
"""
from __future__ import annotations

from typing import Any

from conftest import parity

from memoweft.portable import import_bundle, validate_bundle
from memoweft.store import open_db


def _load() -> Any:
    return parity("bundle.json")


def test_ts_bundle_is_valid_to_python() -> None:
    # Python 的 validate 也认这个 TS 包合法(交叉印证 validate parity)。
    assert validate_bundle(_load()).valid


def test_import_roundtrip_preserves_data() -> None:
    bundle = _load()
    db = open_db(":memory:")
    try:
        counts = import_bundle(db, bundle)
        # 计数与包 metadata 一致。
        assert counts.evidence == bundle["metadata"]["counts"]["evidence"] == 2
        assert counts.events == bundle["metadata"]["counts"]["events"] == 1
        assert counts.cognitions == bundle["metadata"]["counts"]["cognitions"] == 1
        assert counts.event_evidence == 2
        assert counts.cognition_evidence == 1
        assert counts.interaction_contexts == 1

        # 逐条保真:原 id / 时间戳 / 关键字段读回来一致。
        ev1 = db.execute("SELECT id, subject_id, source_kind, raw_content, allow_cloud_read, occurred_at FROM evidence WHERE id='ev-1'").fetchone()
        assert ev1 == ("ev-1", "owner", "spoken", "原话 ev-1", 0, "2026-01-01T00:00:00.000Z")
        cog = db.execute("SELECT id, content, content_type, formed_by, confidence, cred_status FROM cognition WHERE id='cog-1'").fetchone()
        assert cog == ("cog-1", "用户喜欢 X", "preference", "stated", 600, "limited")
        # 溯源链保真:event→2 证据、cognition→1 证据。
        evev = {r[0] for r in db.execute("SELECT evidence_id FROM event_evidence WHERE event_id='evt-1'").fetchall()}
        assert evev == {"ev-1", "ev-2"}
        cogev = db.execute("SELECT evidence_id, relation FROM cognition_evidence WHERE cognition_id='cog-1'").fetchone()
        assert cogev == ("ev-1", "support")

        # 幂等:再导一次,带 PK 的表 INSERT OR IGNORE → 0 新增。
        again = import_bundle(db, bundle)
        assert again.evidence == 0 and again.cognitions == 0 and again.events == 0
    finally:
        db.close()
