"""可注入时钟 —— 移植自 src/clock.ts。

Clock 只产【时间戳】(铁律 3b),绝不进置信度自算。to_iso_z 复刻 JS Date.toISOString()
(UTC、毫秒 3 位、Z 后缀),让落库时间戳跨语言【格式】一致——Python datetime.isoformat() 默认
微秒 6 位、带 +00:00,与 JS 分叉,故不能直接用。值不做 parity(注入固定 clock 才比)。
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

#: 返回"现在"的函数。注入它即可固定/前进时间(确定性测试 / 时间旅行)。对齐 clock.ts:13。
Clock = Callable[[], datetime]


def system_clock() -> datetime:
    """缺省时钟:真实系统时间(UTC aware)。对齐 clock.ts:16 的 () => new Date()。"""
    return datetime.now(timezone.utc)


def to_iso_z(dt: datetime) -> str:
    """复刻 JS Date.toISOString():UTC、毫秒 3 位、Z 后缀(YYYY-MM-DDTHH:MM:SS.sssZ)。

    毫秒取截断(microsecond // 1000),与 JS Date 的毫秒精度一致(JS Date 无微秒)。
    naive datetime 视为 UTC;aware 先转 UTC。
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    ms = dt.microsecond // 1000
    return f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}T{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}.{ms:03d}Z"
