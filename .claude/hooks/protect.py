#!/usr/bin/env python3
"""PreToolUse 钩子:铁律 1/2/8/9 与角色权限的机器强制层。对主会话与全部 subagent 生效。
exit 2 = 拦截(stderr 反馈给 Claude);exit 0 = 放行。解析异常一律放行,避免误伤。"""
import json, sys, os, re

# 拦截理由回传给 Claude/人类,强制 UTF-8 避免 Windows(GBK 控制台)下中文乱码。
try:
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool = data.get("tool_name", "")
ti = data.get("tool_input") or {}

def block(msg):
    print("BLOCKED by protect.py: " + msg, file=sys.stderr)
    sys.exit(2)

if tool in ("Edit", "Write", "MultiEdit"):
    p = ti.get("file_path") or ""
    if not p:
        sys.exit(0)
    norm = os.path.abspath(p).replace("\\", "/")
    base = os.path.basename(norm)
    # 铁律 1:宪法目录 tests/eval/ 只增不改
    if "/tests/eval/" in norm:
        if tool in ("Edit", "MultiEdit"):
            block("铁律1:tests/eval/ 既有测试禁止修改。测试不过=实现有错;新增用例请创建新文件。")
        if tool == "Write" and os.path.exists(norm):
            block("铁律1:tests/eval/ 既有文件禁止覆盖;只允许新增新文件。")
    # 铁律 2/8:API 快照禁手改;LICENSE 变更属人类
    if base == "api-surface.snapshot":
        block("铁律2:API 快照禁止手改;走影响面说明+人类批准+npm run api:update。")
    if base == "LICENSE" and (tool in ("Edit", "MultiEdit") or os.path.exists(norm)):
        block("铁律8:LICENSE 变更属人类决定,由人类执行。")
    # 铁律 9:敏感文件禁止写入
    if re.search(r"(^\.env($|\.)|id_rsa|\.pem$|credentials)", base):
        block("铁律9:敏感文件禁止写入;密钥只经环境变量。")
    # 角色级写入限制(钩子输入含 agent_type;字段缺失则跳过本节)
    agent = (data.get("agent_type") or "").lower()
    ROLE_WRITE_DENY = {
        "doc-writer":   ("/src/", "/tests/"),
        "test-author":  ("/src/",),
        "bench-runner": ("/src/", "/tests/", "/docs/"),
    }
    if agent in ROLE_WRITE_DENY:
        for seg in ROLE_WRITE_DENY[agent]:
            if seg in norm:
                block("角色越权:" + agent + " 禁止写入 " + seg + " 路径。")

elif tool == "Bash":
    cmd = ti.get("command") or ""
    # force-push:文档原正则要求 force 标志紧跟 push 首参,漏掉 `git push origin main --force`(D-0004 加固)。
    # 改为:命令含 `git push` 且任意位置含 force 标志(--force / --force-with-lease / -f 短标志)即拦。
    is_git_push = re.search(r"\bgit\s+push\b", cmd)
    force_flag = re.search(r"(--force(-with-lease)?\b|(^|\s)-[A-Za-z]*f($|\s))", cmd)
    dangerous = re.search(r"(npm\s+publish|twine\s+upload|uv\s+publish|rm\s+-rf\s+[/~])", cmd)
    if dangerous or (is_git_push and force_flag):
        block("铁律8/9:发布、强推与破坏性命令必须由人类亲自执行。")

sys.exit(0)
