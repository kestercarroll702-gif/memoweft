/**
 * 关键词召回（Phase 1 · §14.3：抄 SQLite FTS5 的 BM25 全文检索，做向量通道的互补臂）。
 * FTS5 虚表存文本、trigram 分词、bm25() 排序——无嵌入成本、无网络，与 VectorRetriever 同接口，
 * 供 §14.4 的 RRF hybrid 融合（两臂各出一份 {id, score}，越大越相关，口径一致）。
 *
 * indexAll 对外是"替换式重建"语义（调用后索引 = 传入集合），内部走 **sha256 增量 diff**
 * （照 VectorRetriever：每条文本记 sha256，与影子表 kw_meta 已有 (id, hash) 比对，只对
 * "新增 + 内容变更"的条目重建 FTS 行、对"库里有但这次没传"的条目删除）。FTS 无嵌入成本，
 * 但仍走 diff 以满足 §14.5 的增量精神、并让写放大最小。
 *
 * 失效/过期过滤：KeywordRetriever 只索引 indexAll 交给它的条目（与 VectorRetriever 一致）——
 * invalidAt / archivedAt 的门控是**下游 recall 的活**，本类不看认知状态，只做纯文本召回。
 *
 * 时间无关：FTS/BM25 不涉及"当前时间"，故本文件不接触系统时钟（认知纪律：核心逻辑禁直取 now）。
 *
 * ⚠ 本类**不导出到 src/index.ts**（公共 API 冻结面不动）；§14.3b 的工厂据 FtsUnavailableError
 *   在此文件内 import 后决定是否降级——探测点见构造函数。
 */
import { createHash } from 'node:crypto';
import { DatabaseSync } from '../store/nodeSqliteDriver.ts';
import { BUSY_TIMEOUT_MS } from '../store/busyTimeout.ts';
import type { Retriever, RetrievalHit } from './retriever.ts';

/** FTS5 分词器：默认 trigram（CJK 稳，≥3 字符才匹配）；纯英文场景可配 unicode61（见 D-0001）。 */
export type KeywordTokenizer = 'trigram' | 'unicode61';

export interface KeywordRetrieverOptions {
  /** FTS5 分词器，默认 'trigram'。 */
  tokenizer?: KeywordTokenizer;
}

/**
 * FTS5 不可用（当前 SQLite 驱动未编译进 fts5 模块）时构造抛出的**具名错误**。
 * §14.3b 的工厂据它 catch 后降级（better-sqlite3 → 纯 TS BM25），本任务只留探测点、不实现降级。
 */
export class FtsUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FtsUnavailableError';
  }
}

/** 影子表：存每条文本的 sha256 指纹，做增量 diff（FTS 虚表本身不便直接读回"原文 hash"）。 */
const KW_META_SCHEMA = `CREATE TABLE IF NOT EXISTS kw_meta (id TEXT PRIMARY KEY, hash TEXT NOT NULL);`;

/** 允许的分词器白名单：tokenizer 会拼进建表 SQL，必须先校验，绝不让任意串进 DDL。 */
const ALLOWED_TOKENIZERS = new Set<KeywordTokenizer>(['trigram', 'unicode61']);

/** 文本内容指纹：sha256（node:crypto 内置，零依赖）。判断"同 id 内容是否变了"。 */
function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * FTS5 查询语法元字符：双引号 / 前缀星 / 括号 / 列限定冒号 / NEAR 脱字号。
 * 这些是 MATCH 语法报错（及语义误解析）的根源，消毒时**先整串剔除**（替换为空白）。
 */
const FTS5_SYNTAX_CHARS = /["*():^]/g;

/**
 * 把用户 query 消毒成安全的 FTS5 MATCH 串（"去掉 + 转义"双保险，任意输入都不触发 MATCH 语法错）：
 *   1. **去掉**：剔除 FTS5 语法元字符（`" * ( ) : ^`），替换成空白——顺带把 `peanut*`、`foo(bar)`
 *      这类粘连拆成干净 term（避免 `*`/`(` 混进 trigram 序列反而打不中）。
 *   2. 按空白切成 term。
 *   3. **转义**：每个 term 用双引号包成**短语**（phrase）——引号内一切按字面处理，中和残留特殊字符；
 *      term 内部若还有 `"`（①已剔除，这里兜底）转义为 `""`。
 *   4. 多个 term 以 `OR` 连接（OR-of-terms，而非 FTS5 默认隐式 AND，否则多词 query 召回过窄）。
 * query 全空白 / 全是元字符 → 返回空串，调用方据此直接返回 []（空 MATCH 串会让 FTS5 报语法错）。
 */
function toMatchQuery(query: string): string {
  const cleaned = query.replace(FTS5_SYNTAX_CHARS, ' ');
  const terms = cleaned.split(/\s+/).filter((t) => t.length > 0);
  const phrases = terms.map((t) => `"${t.replace(/"/g, '""')}"`);
  return phrases.join(' OR ');
}

export class KeywordRetriever implements Retriever {
  private readonly db: DatabaseSync;

  constructor(dbPath: string, opts: KeywordRetrieverOptions = {}) {
    const tokenizer = opts.tokenizer ?? 'trigram';
    if (!ALLOWED_TOKENIZERS.has(tokenizer)) {
      throw new Error(`未知的 FTS5 tokenizer：${String(tokenizer)}（仅支持 trigram / unicode61）`);
    }

    this.db = new DatabaseSync(dbPath);
    // 并发保底：与主库同一个文件、又独开这第二条连接，多进程下写路径靠它等锁而非裸抛（同 VectorRetriever）。
    this.db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);

    // FTS5 探测点（§14.3b 工厂据此降级）：建虚表若抛错 = 当前驱动未编译 fts5 → 抛具名错误。
    try {
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS cognition_fts USING fts5(` +
          `cognition_id UNINDEXED, text, tokenize='${tokenizer}')`,
      );
    } catch (err) {
      // 探测失败即销毁本连接，别泄漏；把底层错误挂 cause 供诊断。
      try {
        this.db.close();
      } catch {
        /* 关闭失败无所谓，主错误是 FTS 不可用 */
      }
      throw new FtsUnavailableError(
        `当前 SQLite 驱动未编译进 FTS5 模块，关键词召回不可用（tokenize='${tokenizer}'）。` +
          `§14.3b 工厂应据此降级（better-sqlite3 → 纯 TS BM25）。`,
        { cause: err },
      );
    }

    this.db.exec(KW_META_SCHEMA);
  }

  async indexAll(items: Array<{ id: string; text: string }>): Promise<void> {
    // 边界：空集合 = 清空全表（替换式语义，与 VectorRetriever 一致）。
    if (items.length === 0) {
      this.db.exec('DELETE FROM cognition_fts');
      this.db.exec('DELETE FROM kw_meta');
      return;
    }

    // 读出影子表现有 (id, hash)，与传入集合做 diff。
    const existing = new Map<string, string>();
    const rows = this.db.prepare('SELECT id, hash FROM kw_meta').all() as unknown as Array<{
      id: string;
      hash: string;
    }>;
    for (const r of rows) existing.set(r.id, r.hash);

    // 分三集：新增（库无此 id）/ 变更（id 同 hash 异）→ 重建 FTS 行；删除（库有但 items 无）。
    const hashed = items.map((it) => ({ ...it, hash: contentHash(it.text) }));
    const toWrite = hashed.filter((it) => existing.get(it.id) !== it.hash);
    const keepIds = new Set(hashed.map((it) => it.id));
    const toDelete = [...existing.keys()].filter((id) => !keepIds.has(id));

    if (toWrite.length > 0) {
      // FTS5 无 cognition_id 唯一约束、不能 upsert：变更条目先按 cognition_id 删旧行再插新行。
      const delFts = this.db.prepare('DELETE FROM cognition_fts WHERE cognition_id = ?');
      const insFts = this.db.prepare('INSERT INTO cognition_fts (cognition_id, text) VALUES (?, ?)');
      const upsertMeta = this.db.prepare(
        'INSERT INTO kw_meta (id, hash) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET hash = excluded.hash',
      );
      for (const it of toWrite) {
        delFts.run(it.id); // 新增条目匹配 0 行、无害；变更条目清掉旧文本行。
        insFts.run(it.id, it.text);
        upsertMeta.run(it.id, it.hash);
      }
    }

    if (toDelete.length > 0) {
      const delFts = this.db.prepare('DELETE FROM cognition_fts WHERE cognition_id = ?');
      const delMeta = this.db.prepare('DELETE FROM kw_meta WHERE id = ?');
      for (const id of toDelete) {
        delFts.run(id);
        delMeta.run(id);
      }
    }
  }

  async search(query: string, topK: number): Promise<RetrievalHit[]> {
    // 空/纯空白 query → 空召回（也避免空 MATCH 串触发 FTS5 语法错）。
    if (query.trim().length === 0) return [];
    const match = toMatchQuery(query);
    if (match.length === 0) return [];

    // bm25() 越小越相关；ORDER BY rank 升序即"最相关在前"。
    // score 取正向（-rank）：越大越相关，与向量余弦口径一致，供 §14.4 RRF 融合。
    const rows = this.db
      .prepare(
        'SELECT cognition_id, bm25(cognition_fts) AS rank FROM cognition_fts ' +
          'WHERE cognition_fts MATCH ? ORDER BY rank LIMIT ?',
      )
      .all(match, topK) as unknown as Array<{ cognition_id: string; rank: number }>;
    return rows.map((r) => ({ id: r.cognition_id, score: -r.rank }));
  }

  close(): void {
    this.db.close();
  }
}
