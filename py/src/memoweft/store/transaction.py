"""事务执行器 —— 移植自 src/store/{transaction,openStores}.ts。

把一段【同步】写包成一个 SQLite 事务:全成或全滚。可重入:已在事务里再调只直接跑,不嵌套 BEGIN。
⚠️ 只能包同步写:LLM 已在外 await/调完,此闭包内不含网络调用。autocommit(isolation_level=None)下手动 BEGIN/COMMIT/ROLLBACK。
"""
from __future__ import annotations

import sqlite3
from typing import Any, Callable

#: 把一段同步写包成事务:全成或全滚。对齐 transaction.ts:9。
Transaction = Callable[[Callable[[], Any]], Any]


def noop_transaction(fn: Callable[[], Any]) -> Any:
    """不开事务、直接跑(各开各连接的测试场景)。对齐 transaction.ts:12。"""
    return fn()


def make_transaction(db: sqlite3.Connection) -> Transaction:
    """绑定到连接的可重入事务器(对齐 openStores.ts:80-96)。最外层真 BEGIN/COMMIT/ROLLBACK;里层直接跑。"""
    depth = [0]

    def transaction(fn: Callable[[], Any]) -> Any:
        if depth[0] > 0:
            return fn()  # 已在事务里 → 直接跑(SQLite 不支持嵌套 BEGIN)
        depth[0] += 1
        db.execute("BEGIN")
        try:
            r = fn()
            db.execute("COMMIT")
            return r
        except BaseException:
            db.execute("ROLLBACK")  # 任一步抛错 → 整段回滚
            raise
        finally:
            depth[0] -= 1

    return transaction
