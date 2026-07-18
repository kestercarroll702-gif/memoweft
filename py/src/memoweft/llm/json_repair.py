"""JSON 解析加固 —— 移植自 src/llm/jsonRepair.ts。

**逐字复刻手写 extract_json_object(不用 json-repair 库)**:库宽松度 > 手写会在 TS 需重试处直接成功 →
  吞掉「首坏必重试」契约、llmCalls 分叉(D-0043 偏离说明)。首过严格 json.loads + parse_constant 拒 NaN/Infinity。
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Callable, Optional

from .._jsstr import js_trim, utf16_length
from ..config import resolve_lang
from ..types import Lang
from .client import ChatMessage, LLMClient
from .prompts import json_repair_nudge_text

_logger = logging.getLogger("memoweft.jsonRepair")

_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


def _strip_code_fences(s: str) -> str:
    """去 ```json … ``` / ``` … ``` 围栏,取里面内容(无围栏原样返回)。对齐 jsonRepair.ts:20-23。"""
    m = _FENCE_RE.search(s)
    return m.group(1) if m is not None else s


def extract_json_object(raw: str) -> Optional[str]:
    """去围栏 → js_trim → 从首个 { 起括号配平取【第一个平衡闭合】对象(跳字符串内花括号/转义);抠不到→None。

    对齐 jsonRepair.ts:26-48(比贪婪 lastIndexOf 更抗 reasoning 残留/尾随文本)。
    """
    s = js_trim(_strip_code_fences(raw))
    start = s.find("{")
    if start == -1:
        return None
    depth = 0
    in_str = False
    esc = False
    i = start
    while i < len(s):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
        i += 1
    return None


def _reject_constant(_x: str) -> Any:
    # JS JSON.parse 拒 NaN/Infinity/-Infinity;Python json.loads 默认接受 → 用 parse_constant 抛错对齐。
    raise ValueError("non-standard JSON constant (NaN/Infinity)")


def parse_json_object(raw: str) -> Optional[dict[str, Any]]:
    """抠出对象文本并 parse;只认【对象】(数组/标量/null 都不合法→None),失败→None。对齐 jsonRepair.ts:51-60。"""
    text = extract_json_object(raw)
    if text is None:
        return None
    try:
        v = json.loads(text, parse_constant=_reject_constant)
    except ValueError:
        return None
    return v if isinstance(v, dict) else None


def _default_log(msg: str) -> None:
    _logger.warning("[memoweft/jsonRepair] %s", msg)


def _js_bool(b: bool) -> str:
    return "true" if b else "false"


def _fail_msg(s: str, lang: Lang, *, first: bool) -> str:
    # 只记结构特征(长度用 UTF-16 code unit 对齐 JS .length、是否含围栏/花括号),【不记模型原文】(隐私优先)。
    length = utf16_length(s)
    has_fence = "```" in s
    has_brace = "{" in s
    if lang == "zh":
        head = "首次输出非合法 JSON,重试一次。" if first else "重试后仍非合法 JSON,放弃本轮。"
        return f"{head}解析失败:长度={length}、含代码围栏={_js_bool(has_fence)}、含花括号={_js_bool(has_brace)}"
    head = (
        "First output was not valid JSON, retrying once. "
        if first
        else "Still not valid JSON after retry, giving up this round. "
    )
    return f"{head}Parse failed: length={length}, hasCodeFence={_js_bool(has_fence)}, hasBrace={_js_bool(has_brace)}"


def parse_json_object_with_repair(
    llm: LLMClient,
    messages: list[ChatMessage],
    *,
    log: Optional[Callable[[str], None]] = None,
    lang: Optional[Lang] = None,
) -> Optional[dict[str, Any]]:
    """调模型 → 解析对象;失败则【落日志 + 最多重试一次】(追加 jsonRepairNudge);仍失败→None。对齐 jsonRepair.ts:81-107。

    重试会再调一次模型(call_count +1);调用方统计调用数须在本函数前后取 call_count 差。
    """
    sink = log if log is not None else _default_log
    lg = lang if lang is not None else resolve_lang()

    first = llm.chat(messages)
    parsed = parse_json_object(first)
    if parsed is not None:
        return parsed

    sink(_fail_msg(first, lg, first=True))
    retry_messages = [*messages, ChatMessage(role="user", content=json_repair_nudge_text(lg))]
    second = llm.chat(retry_messages)
    reparsed = parse_json_object(second)
    if reparsed is not None:
        return reparsed

    sink(_fail_msg(second, lg, first=False))
    return None
