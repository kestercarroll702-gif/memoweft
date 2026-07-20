/**
 * content_type 兜底的计量仪表（计量契约 · 只观测，不改变行为）。
 *
 * 靶心：`pickCognition` 对非法/缺失 content_type 一律静默改写成 `fact`
 * （consolidate.ts 的 `VALID_TYPES.includes(...) ? ... : 'fact'`），而 `fact` 恰是
 * 「永不衰减（config.background.halfLifeDays 无 fact 键）+ 永不自动失效
 * （expireAfterDays 无 fact 键）+ 不受 transientCap 封顶」那一档 —— 兜底方向偏向【最持久】的类型。
 *
 * 三种触发因的严重度完全不同，混在一起就没法判断该不该动语义，所以必须分开计：
 *   - missing    模型压根没给这个字段；
 *   - invalid    给了但不在六值内（拼错 / 幻觉值）；
 *   - outOfScope 给了 `hypothesis` / `trend` —— 这两值在 `ContentType`（model.ts）里【合法】，
 *                只是 consolidate 的 `VALID_TYPES` 不收。这是三者里唯一的【语义降级】：
 *                一条本应受 `attribution.hypothesisCap`(250) 与 2 天半衰期约束、
 *                且应进 proposeAsk 求证队列的推测，被洗成永久 fact 并永久退出该队列。
 *                提示词 prompts.ts 专门警告过模型别输出 hypothesis —— 反证作者见过它这么干。
 *
 * 本测试【只钉计数】，不断言行为改变：兜底仍然落 fact，这是现状、不在本次改动范围内。
 * 全离线（脚本 LLM，不依赖网络）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteEvidenceStore } from '../src/evidence/store.ts';
import { SqliteEventStore } from '../src/event/store.ts';
import { SqliteCognitionStore } from '../src/cognition/store.ts';
import { consolidate } from '../src/consolidation/consolidate.ts';

interface Stores {
  ev: SqliteEvidenceStore;
  evt: SqliteEventStore;
  cog: SqliteCognitionStore;
}
function fresh(): Stores {
  return {
    ev: new SqliteEvidenceStore(':memory:'),
    evt: new SqliteEventStore(':memory:'),
    cog: new SqliteCognitionStore(':memory:'),
  };
}
function closeAll(s: Stores) {
  s.ev.close();
  s.evt.close();
  s.cog.close();
}

/** 造一条用户主动说的证据 + 覆盖它的事件；返回证据 id。 */
function seed(s: Stores, word: string): string {
  const e = s.ev.put({
    subjectId: 'u',
    sourceKind: 'spoken',
    hostId: 'h',
    rawContent: word,
    occurredAt: '2026-07-20T10:00:00.000Z',
  });
  s.evt.put({
    subjectId: 'u',
    summary: `用户说"${word}"`,
    occurredAt: '2026-07-20T10:00:00.000Z',
    evidenceIds: [e.id],
  });
  return e.id;
}

/** 用给定的 new[] 原始 JSON 片段跑一轮 consolidate。 */
async function runWith(newItems: string) {
  const s = fresh();
  try {
    const eId = seed(s, '我住在北京');
    const llm = {
      callCount: 0,
      async chat() {
        this.callCount++;
        return `{"new":${newItems.replaceAll('__E__', eId)}}`;
      },
    };
    const r = await consolidate('u', {
      eventStore: s.evt,
      evidenceStore: s.ev,
      cognitionStore: s.cog,
      llm,
    });
    return { r, cognitions: s.cog.active('u') };
  } finally {
    closeAll(s);
  }
}

test('content_type 缺失 → 计入 missing，且仍然落 fact（行为不变）', async () => {
  const { r, cognitions } = await runWith(
    `[{"content":"用户住在北京","formed_by":"stated","support_evidence_ids":["__E__"]}]`,
  );
  assert.equal(r.contentTypeFallback.missing, 1);
  assert.equal(r.contentTypeFallback.invalid, 0);
  assert.equal(r.contentTypeFallback.outOfScope, 0);
  // 行为未变：仍落 fact
  assert.equal(cognitions.length, 1);
  assert.equal(cognitions[0]!.contentType, 'fact');
});

test('content_type 是六值外的幻觉值 → 计入 invalid', async () => {
  const { r, cognitions } = await runWith(
    `[{"content":"用户住在北京","content_type":"locaton","formed_by":"stated","support_evidence_ids":["__E__"]}]`,
  );
  assert.equal(r.contentTypeFallback.invalid, 1);
  assert.equal(r.contentTypeFallback.missing, 0);
  assert.equal(r.contentTypeFallback.outOfScope, 0);
  assert.equal(cognitions[0]!.contentType, 'fact');
});

test('content_type=hypothesis → 计入 outOfScope（这是语义降级，不是拼写错误）', async () => {
  const { r, cognitions } = await runWith(
    `[{"content":"用户可能不太会做饭","content_type":"hypothesis","formed_by":"inferred","support_evidence_ids":["__E__"]}]`,
  );
  assert.equal(r.contentTypeFallback.outOfScope, 1);
  assert.equal(r.contentTypeFallback.missing, 0);
  assert.equal(r.contentTypeFallback.invalid, 0);
  // 现状留证：受 hypothesisCap 与 2 天半衰期约束的推测，被洗成了永久 fact。
  assert.equal(cognitions[0]!.contentType, 'fact');
});

test('content_type=trend 同样计入 outOfScope', async () => {
  const { r } = await runWith(
    `[{"content":"用户最近常熬夜","content_type":"trend","formed_by":"ruled","support_evidence_ids":["__E__"]}]`,
  );
  assert.equal(r.contentTypeFallback.outOfScope, 1);
});

test('content_type 合法 → 三个计数全为 0', async () => {
  const { r, cognitions } = await runWith(
    `[{"content":"用户住在北京","content_type":"fact","formed_by":"stated","support_evidence_ids":["__E__"]}]`,
  );
  assert.deepEqual(r.contentTypeFallback, { missing: 0, invalid: 0, outOfScope: 0 });
  assert.equal(cognitions[0]!.contentType, 'fact');
});

test('多条候选混合触发 → 按因分别累计', async () => {
  const { r } = await runWith(
    `[{"content":"用户住在北京","content_type":"fact","formed_by":"stated","support_evidence_ids":["__E__"]},` +
      `{"content":"用户喜欢面食","formed_by":"stated","support_evidence_ids":["__E__"]},` +
      `{"content":"用户可能怕冷","content_type":"hypothesis","formed_by":"inferred","support_evidence_ids":["__E__"]},` +
      `{"content":"用户爱喝茶","content_type":"beverage_pref","formed_by":"stated","support_evidence_ids":["__E__"]}]`,
  );
  assert.deepEqual(r.contentTypeFallback, { missing: 1, invalid: 1, outOfScope: 1 });
});

test('无新材料早退时计数为 0 而非 undefined（与 profileSize/promptChars 的 0 语义一致）', async () => {
  const s = fresh();
  try {
    const llm = {
      callCount: 0,
      async chat() {
        this.callCount++;
        return '{"new":[]}';
      },
    };
    const r = await consolidate('u', {
      eventStore: s.evt,
      evidenceStore: s.ev,
      cognitionStore: s.cog,
      llm,
    });
    assert.deepEqual(r.contentTypeFallback, { missing: 0, invalid: 0, outOfScope: 0 });
  } finally {
    closeAll(s);
  }
});
