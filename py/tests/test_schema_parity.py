"""schema parity:Python 建的库结构与 TS(shared/parity/schema.json)逐表逐列一致。"""
from __future__ import annotations

from typing import Any

from conftest import parity

from memoweft.store import open_db, user_version


def _table_info(db: Any, table: str) -> list[dict[str, Any]]:
    rows = db.execute(f"SELECT name, type, \"notnull\" AS nn, dflt_value AS dflt, pk FROM pragma_table_info('{table}')").fetchall()
    return [{"name": r[0], "type": r[1], "notnull": int(r[2]), "dflt": r[3], "pk": int(r[4])} for r in rows]


def test_schema_matches_ts() -> None:
    want = parity("schema.json")
    db = open_db(":memory:")
    try:
        assert user_version(db) == want["userVersion"], "user_version 应与 TS 一致(LATEST_SCHEMA_VERSION)"
        got_tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()]
        assert got_tables == sorted(want["tables"].keys()), f"表清单分叉:{got_tables} vs {sorted(want['tables'].keys())}"
        for table, want_cols in want["tables"].items():
            got_cols = _table_info(db, table)
            assert got_cols == want_cols, f"表 {table} 列结构分叉:\n got:  {got_cols}\n want: {want_cols}"
    finally:
        db.close()
