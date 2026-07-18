"""OpenAICompatClient:chat via httpx MockTransport(请求体/响应/usage/reasoning 兜底)+ load_llm_config env 解析。"""
from __future__ import annotations

import json
from typing import Any, Callable

import httpx
import pytest

from memoweft.llm.client import ChatMessage, LLMConfig, OpenAICompatClient, load_llm_config


def _client(handler: Callable[[httpx.Request], httpx.Response], cfg: LLMConfig) -> OpenAICompatClient:
    return OpenAICompatClient(cfg, transport=httpx.MockTransport(handler))


def test_chat_request_and_response() -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("authorization")
        captured["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": "回答"}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
            },
        )

    cfg = LLMConfig(base_url="http://x/v1/", api_key="k", model="m", temperature=0.7)
    client = _client(handler, cfg)
    out = client.chat([ChatMessage(role="user", content="问")])
    assert out == "回答"
    assert captured["url"] == "http://x/v1/chat/completions"  # 去尾斜杠 + 拼接
    assert captured["auth"] == "Bearer k"
    assert captured["body"] == {"model": "m", "messages": [{"role": "user", "content": "问"}], "temperature": 0.7}
    assert client.call_count == 1
    assert client.usage.prompt_tokens == 10 and client.usage.total_tokens == 15 and client.usage.calls_with_usage == 1


def test_chat_temperature_default_and_no_usage() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert body["temperature"] == 0.3  # 缺省 0.3
        return httpx.Response(200, json={"choices": [{"message": {"content": "x"}}]})  # 无 usage

    client = _client(handler, LLMConfig(base_url="http://x", api_key="k", model="m"))
    client.chat([ChatMessage(role="user", content="q")])
    assert client.usage.calls_with_usage == 0  # 无 usage 不计


def test_chat_total_tokens_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "x"}}], "usage": {"prompt_tokens": 3, "completion_tokens": 4}},
        )  # 无 total_tokens → 回退 p+c

    client = _client(handler, LLMConfig(base_url="http://x", api_key="k", model="m"))
    client.chat([ChatMessage(role="user", content="q")])
    assert client.usage.total_tokens == 7


def test_chat_reasoning_fallback_and_think_strip() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "", "reasoning_content": "<think>思考</think>真答案"}}]},
        )

    client = _client(handler, LLMConfig(base_url="http://x", api_key="k", model="m"))
    # content 空 → 回落 reasoning_content → strip_reasoning 剥 think
    assert client.chat([ChatMessage(role="user", content="q")]) == "真答案"


def test_chat_http_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="server error")

    client = _client(handler, LLMConfig(base_url="http://x", api_key="k", model="m"))
    with pytest.raises(RuntimeError):
        client.chat([ChatMessage(role="user", content="q")])


def test_load_llm_config_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEMOWEFT_LLM_BASE_URL", "http://e")
    monkeypatch.setenv("MEMOWEFT_LLM_API_KEY", "key")
    monkeypatch.setenv("MEMOWEFT_LLM_MODEL", "gpt")
    monkeypatch.setenv("MEMOWEFT_LLM_TEMPERATURE", "0")
    monkeypatch.setenv("MEMOWEFT_LLM_TIER", "Local")
    cfg = load_llm_config()
    assert cfg.base_url == "http://e" and cfg.api_key == "key" and cfg.model == "gpt"
    assert cfg.temperature == 0.0  # '0' 合法 → 0.0(非 None)
    assert cfg.tier == "local"  # 大小写不敏感


def test_load_llm_config_invalid_temp_and_tier(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MEMOWEFT_LLM_BASE_URL", "http://e")
    monkeypatch.setenv("MEMOWEFT_LLM_API_KEY", "key")
    monkeypatch.setenv("MEMOWEFT_LLM_MODEL", "gpt")
    monkeypatch.setenv("MEMOWEFT_LLM_TEMPERATURE", "abc")  # 非法 → None
    monkeypatch.setenv("MEMOWEFT_LLM_TIER", "typo")  # 拼错 → None(绝不误当 local)
    cfg = load_llm_config()
    assert cfg.temperature is None
    assert cfg.tier is None


def test_load_llm_config_dla_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MEMOWEFT_LLM_BASE_URL", raising=False)
    monkeypatch.setenv("DLA_LLM_BASE_URL", "http://legacy")  # 回退旧前缀
    monkeypatch.setenv("MEMOWEFT_LLM_API_KEY", "key")
    monkeypatch.setenv("MEMOWEFT_LLM_MODEL", "gpt")
    cfg = load_llm_config()
    assert cfg.base_url == "http://legacy"


def test_load_llm_config_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("MEMOWEFT_LLM_BASE_URL", "DLA_LLM_BASE_URL"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("MEMOWEFT_LLM_API_KEY", "key")
    monkeypatch.setenv("MEMOWEFT_LLM_MODEL", "gpt")
    with pytest.raises(ValueError):
        load_llm_config()
