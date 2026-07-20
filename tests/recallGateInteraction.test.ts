/**
 * 召回门控 × topK 的【交互】覆盖。
 *
 * 既有测试覆盖的是各道门的机械行为（archived 的不返回、跨 subject 的不返回……），
 * bench/eval-retrieval.mjs 覆盖的是 Retriever 层的排序质量（recall@5 / mrr@10）。
 * 两者之间有一条缝没人测过，而产品每轮对话都走它：
 *
 *   topK 是【在门控之前】取的 —— `retriever.search(query, cfg.retrieval.topK)` 先拿回 K 条，
 *   再逐条过六道门。所以门控只会让结果变少，【永远不会往回补】。库里明明还有合格的记忆，
 *   却因为前 K 名里大半被过滤而拿不到。recall.ts 的注释承认"可能欠填"，但没有任何
 *   测试或评测衡量这个欠填。
 *
 * 本文件固定这条缝的当前行为，并量化欠填幅度。全离线、确定性（词序检索器 + 注入 clock）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqliteCognitionStore } from '../src/cognition/store.ts';
import { recallCognitions } from '../src/retrieval/recall.ts';
import { config } from '../src/config.ts';
import type { Retriever } from '../src/retrieval/retriever.ts';
import type { Cognition } from '../src/cognition/model.ts';

/** 确定性检索器：按插入顺序返回前 topK，score 递减。不做真检索——本文件测的是【门控】不是排序。 */
function orderedRetriever(ids: string[]): Retriever {
  return {
    async indexAll() {},
    async search(_query, topK) {
      return ids.slice(0, topK).map((id, i) => ({ id, score: 1 - i * 0.01 }));
    },
  };
}

interface SeedSpec {
  content: string;
  confidence?: number;
  credStatus?: Cognition['credStatus'];
  contentType?: Cognition['contentType'];
  subjectId?: string;
  invalid?: boolean;
  archived?: boolean;
  muted?: boolean;
}

function seed(store: SqliteCognitionStore, specs: SeedSpec[]): string[] {
  const ids: string[] = [];
  for (const s of specs) {
    const c = store.put({
      subjectId: s.subjectId ?? 'owner',
      content: s.content,
      contentType: s.contentType ?? 'preference',
      formedBy: 'stated',
      confidence: s.confidence ?? 900,
      credStatus: s.credStatus ?? 'stable',
    });
    if (s.invalid) store.update(c.id, { invalidAt: new Date().toISOString() });
    if (s.archived) store.update(c.id, { archivedAt: new Date().toISOString() });
    if (s.muted) store.update(c.id, { mutedAt: new Date().toISOString() });
    ids.push(c.id);
  }
  return ids;
}

test('欠填：topK 在门控之前取——前 K 名被过滤后不会用库里剩下的合格认知补位', async () => {
  const store = new SqliteCognitionStore(':memory:');
  try {
    const topK = config.retrieval.topK;
    // 前 topK 条全部会被门控挡掉，其后紧跟着 topK 条完全合格的认知。
    const blocked: SeedSpec[] = Array.from({ length: topK }, (_, i) => ({
      content: `blocked ${i}`,
      archived: true,
    }));
    const healthy: SeedSpec[] = Array.from({ length: topK }, (_, i) => ({
      content: `healthy ${i}`,
    }));
    const ids = seed(store, [...blocked, ...healthy]);

    const got = await recallCognitions('q', 'owner', {
      retriever: orderedRetriever(ids),
      cognitionStore: store,
    });

    // 当前行为：检索器只被问了 topK 条，那 topK 条全被挡 → 返回空。
    //   库里还有 topK 条完全合格的认知，一条都没被取到。
    assert.equal(got.length, 0, '前 K 名全被门控挡掉 → 召回为空');
    assert.equal(store.active('owner').length, topK, '而库里明明还有这么多合格认知没被取到');
  } finally {
    store.close();
  }
});

test('欠填幅度：门控挡掉几条就少几条，不补位', async () => {
  const store = new SqliteCognitionStore(':memory:');
  try {
    const topK = config.retrieval.topK;
    // 前 K 名里交替放"会被挡"和"合格"的，其后再放一批合格的。
    const head: SeedSpec[] = Array.from({ length: topK }, (_, i) =>
      i % 2 === 0 ? { content: `muted ${i}`, muted: true } : { content: `ok ${i}` },
    );
    const tail: SeedSpec[] = Array.from({ length: topK }, (_, i) => ({ content: `tail ${i}` }));
    const ids = seed(store, [...head, ...tail]);

    const got = await recallCognitions('q', 'owner', {
      retriever: orderedRetriever(ids),
      cognitionStore: store,
    });

    const blockedInHead = head.filter((s) => s.muted).length;
    assert.equal(
      got.length,
      topK - blockedInHead,
      `前 K 名里被挡 ${blockedInHead} 条 → 结果就少 ${blockedInHead} 条（不从 tail 补）`,
    );
    assert.ok(
      got.every((g) => g.content.startsWith('ok ')),
      '返回的都是 head 里合格的那些，tail 一条都没进来',
    );
  } finally {
    store.close();
  }
});

test('六道门逐一生效，且互不遮蔽（同一批里各挡各的）', async () => {
  const store = new SqliteCognitionStore(':memory:');
  try {
    const ids = seed(store, [
      { content: 'healthy' },
      { content: 'invalid one', invalid: true },
      { content: 'archived one', archived: true },
      { content: 'muted one', muted: true },
      { content: 'other subject', subjectId: 'someone-else' },
    ]);

    const got = await recallCognitions('q', 'owner', {
      retriever: orderedRetriever(ids),
      cognitionStore: store,
    });

    assert.deepEqual(
      got.map((g) => g.content),
      ['healthy'],
      'invalid / archived / muted / 跨 subject 四道门各挡各的，只剩健康的那条',
    );
  } finally {
    store.close();
  }
});

test('衰减门控：同一条认知随 clock 前进跌出召回（有效置信低于门槛）', async () => {
  const store = new SqliteCognitionStore(':memory:');
  try {
    // state 是 transient 类型（半衰期短），置信刚过门槛 → 前进时间后应跌出。
    const ids = seed(store, [
      { content: 'fleeting mood', contentType: 'state', confidence: 300, credStatus: 'low' },
    ]);
    const deps = { retriever: orderedRetriever(ids), cognitionStore: store };

    const now = new Date();
    const fresh = await recallCognitions('q', 'owner', deps, config, now);
    assert.equal(fresh.length, 1, '刚落库时能召回');

    const later = new Date(now.getTime() + 90 * 86400000); // 90 天后
    const decayed = await recallCognitions('q', 'owner', deps, config, later);
    assert.equal(decayed.length, 0, '90 天后有效置信跌破 minEffectiveConfidence → 不再注入');
  } finally {
    store.close();
  }
});

test('相似度门控在最前：低于 minSimilarity 的连认知都不取', async () => {
  const store = new SqliteCognitionStore(':memory:');
  try {
    const ids = seed(store, [{ content: 'a' }, { content: 'b' }]);
    const lowScore: Retriever = {
      async indexAll() {},
      async search() {
        return ids.map((id) => ({ id, score: -1 })); // 恒低于任何阈值
      },
    };
    const cfg = { ...config, retrieval: { ...config.retrieval, minSimilarity: 0.5 } };
    const got = await recallCognitions(
      'q',
      'owner',
      { retriever: lowScore, cognitionStore: store },
      cfg,
    );
    assert.equal(got.length, 0, '相似度不足 → 一条都不注入');
  } finally {
    store.close();
  }
});
