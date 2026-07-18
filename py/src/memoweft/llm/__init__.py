"""LLM 层(v0.6 Phase 2)—— OpenAI 兼容客户端 + JSON 解析加固 + 受治理提示词载入。移植自 src/llm/。"""
from __future__ import annotations

from .client import (
    ChatMessage,
    LLMClient,
    LLMConfig,
    OpenAICompatClient,
    UsageStats,
    load_llm_config,
    read_reply_text,
    strip_reasoning,
)
from .json_repair import extract_json_object, parse_json_object, parse_json_object_with_repair
from .prompts import VersionedPrompt, get_prompt, json_repair_nudge_text, prompt_text, prompt_versions

__all__ = [
    "ChatMessage",
    "LLMClient",
    "LLMConfig",
    "OpenAICompatClient",
    "UsageStats",
    "load_llm_config",
    "read_reply_text",
    "strip_reasoning",
    "extract_json_object",
    "parse_json_object",
    "parse_json_object_with_repair",
    "VersionedPrompt",
    "get_prompt",
    "json_repair_nudge_text",
    "prompt_text",
    "prompt_versions",
]
