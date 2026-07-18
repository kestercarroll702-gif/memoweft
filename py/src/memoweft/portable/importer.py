"""导入便携记忆包 → schema 同构的 SQLite 库(字段映射 camelCase→snake_case,bool→0/1)。

移植自 src/portable/importBundle.ts 的核心(merge/id 去重);此阶段做 interop 往返验证所需的插入,
dryRun/duplicates 明细等完整 ImportPlan 语义按需再补。跨语言 interop 证据:TS 生成的合法包 → Python 建同构库导入 → 保真。
"""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class ImportCounts:
    evidence: int = 0
    events: int = 0
    event_evidence: int = 0
    cognitions: int = 0
    cognition_evidence: int = 0
    interaction_contexts: int = 0
    semantic_resolutions: int = 0


def _b(v: Any) -> int:
    return 1 if v else 0


def import_bundle(db: sqlite3.Connection, bundle: dict[str, Any]) -> ImportCounts:
    """把 bundle.data 插进库(带 PK 的表 INSERT OR IGNORE 去重)。返回各表新插入条数。"""
    data = bundle["data"]
    c = ImportCounts()

    for e in data["evidence"]:
        cur = db.execute(
            "INSERT OR IGNORE INTO evidence (id, subject_id, source_kind, host_id, origin_id, occurred_at, recorded_at, "
            "raw_content, summary, allow_local_read, allow_cloud_read, allow_inference, corrects_evidence_id, preceding_ai_context) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (e["id"], e["subjectId"], e["sourceKind"], e["hostId"], e.get("originId"), e["occurredAt"], e["recordedAt"],
             e["rawContent"], e["summary"], _b(e["allowLocalRead"]), _b(e["allowCloudRead"]), _b(e["allowInference"]),
             e.get("correctsEvidenceId"), e.get("precedingAiContext")),
        )
        c.evidence += cur.rowcount

    for ev in data["events"]:
        cur = db.execute(
            "INSERT OR IGNORE INTO event (id, subject_id, summary, occurred_at, created_at, consolidated) VALUES (?,?,?,?,?,?)",
            (ev["id"], ev["subjectId"], ev["summary"], ev["occurredAt"], ev["createdAt"], _b(ev["consolidated"])),
        )
        c.events += cur.rowcount

    for link in data["eventEvidence"]:
        db.execute("INSERT INTO event_evidence (event_id, evidence_id) VALUES (?,?)", (link["eventId"], link["evidenceId"]))
        c.event_evidence += 1

    for cog in data["cognitions"]:
        cur = db.execute(
            "INSERT OR IGNORE INTO cognition (id, subject_id, content, content_type, formed_by, confidence, cred_status, "
            "scope, valid_at, invalid_at, asked_at, archived_at, muted_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (cog["id"], cog["subjectId"], cog["content"], cog["contentType"], cog["formedBy"], cog["confidence"], cog["credStatus"],
             cog.get("scope"), cog.get("validAt"), cog.get("invalidAt"), cog.get("askedAt"), cog.get("archivedAt"), cog.get("mutedAt"),
             cog["createdAt"], cog["updatedAt"]),
        )
        c.cognitions += cur.rowcount

    for link in data["cognitionEvidence"]:
        db.execute("INSERT INTO cognition_evidence (cognition_id, evidence_id, relation) VALUES (?,?,?)",
                   (link["cognitionId"], link["evidenceId"], link["relation"]))
        c.cognition_evidence += 1

    for ic in data.get("interactionContexts") or []:
        cur = db.execute(
            "INSERT OR IGNORE INTO interaction_context (id, subject_id, conversation_id, episode_id, context_json, context_hash, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (ic["id"], ic["subjectId"], ic["conversationId"], ic["episodeId"], json.dumps(ic["context"], ensure_ascii=False), ic["contextHash"], ic["createdAt"]),
        )
        c.interaction_contexts += cur.rowcount

    for sr in data.get("semanticResolutions") or []:
        cur = db.execute(
            "INSERT OR IGNORE INTO semantic_resolution (id, evidence_id, resolved_content, response_act, prompt_act, "
            "proposition_origin, assertion_strength, required_context, resolver_version, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (sr["id"], sr["evidenceId"], sr["resolvedContent"], sr.get("responseAct"), sr.get("promptAct"),
             sr.get("propositionOrigin"), sr.get("assertionStrength"), sr.get("requiredContext"), sr["resolverVersion"], sr["createdAt"]),
        )
        c.semantic_resolutions += cur.rowcount

    db.commit()
    return c
