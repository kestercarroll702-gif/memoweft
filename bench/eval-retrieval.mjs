/**
 * 检索基线评测（Phase 1 · §14.2）。手动跑、不进 CI、不设门。
 *
 * 量什么：当前 **vector-only** 系统（VectorRetriever + 确定性 HashEmbedder）在黄金集
 *   `tests/retrieval/golden.json` 上的召回。这是 §14.3/14.4 加 BM25+RRF hybrid 之后
 *   做对比的基准——「先测量后优化」，基线入库是后续优化的前提。
 *
 * 直接从 src/tests 的 .ts import（Node ≥24 原生剥类型，无需 build）。只读依赖，绝不改它们。
 *
 * 指标（每条 case，topK=10）：
 *   - top5      = hits.slice(0,5) 的 id
 *   - recall5   = (expect 落在 top5 的个数) / expect.length
 *   - hit5      = expect 中任一 id ∈ top5 ? 1 : 0
 *   - firstRank = expect 中任一 id 在 hits 前 10 的最小 1-based 排名；rr10 = firstRank ? 1/firstRank : 0
 *   汇总 mean：overall + 按 kind(direct/paraphrase/multihop) + 按语言(含 CJK=zh 否则 en)。
 *   latency：全体 P50 / P95（ms，nearest-rank）。
 *
 * 确定性自检：整套评测跑两遍，断言两次【指标】逐位相等（HashEmbedder 确定性、latency 除外）；
 *   不等则 process.exit(1)。
 *
 * 真实臂（opt-in，默认关）：设 EVAL_REAL_ARM=1 或 --real，且 env(.env) 配了 MEMOWEFT_EMBED_* 才额外跑
 *   OpenAICompatEmbedder 臂；默认离线、不打网络（保持复现的确定性，§14.1）。
 *
 * 用法：node bench/eval-retrieval.mjs                 # 默认纯离线确定性臂
 *       EVAL_REAL_ARM=1 node bench/eval-retrieval.mjs # 额外跑真实嵌入臂（需 .env MEMOWEFT_EMBED_* + 联网）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { VectorRetriever } from '../src/retrieval/vectorRetriever.ts';
import { loadEmbedConfig, OpenAICompatEmbedder } from '../src/retrieval/embedder.ts';
import { HashEmbedder, DEFAULT_DIM } from '../tests/retrieval/hashEmbedder.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = resolve(HERE, '../tests/retrieval/golden.json');
const REPORT_PATH = resolve(HERE, 'retrieval-baseline.md');
const GEN_CMD = 'node bench/eval-retrieval.mjs';
const TOP_K = 10;

/** 9 条纯 2 字中文 direct 用例（验证向量 char-bigram 能否兜住 trigram 关键词通道够不着的 2 字词）。 */
const TWO_CHAR_CASES = ['G-004', 'G-008', 'G-009', 'G-010', 'G-013', 'G-015', 'G-016', 'G-018', 'G-019'];

const CJK = /\p{Script=Han}/u;
const langOf = (query) => (CJK.test(query) ? 'zh' : 'en');

/** nearest-rank 百分位（sorted 升序）。P50 of n=65 → rank ceil(.5*65)=33 → idx 32。 */
function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx];
}

/** 一组 case 结果求 mean（Recall@5 / Hit@5 / MRR@10）。 */
function aggregate(results) {
  const n = results.length;
  if (n === 0) return { n: 0, recall5: 0, hit5: 0, mrr10: 0 };
  const mean = (f) => results.reduce((a, r) => a + f(r), 0) / n;
  return {
    n,
    recall5: mean((r) => r.recall5),
    hit5: mean((r) => r.hit5),
    mrr10: mean((r) => r.rr10),
  };
}

/**
 * 用给定 embedder 跑整套黄金集。返回每条 case 的逐项指标 + 分组汇总。
 * latency 用 performance.now() 计 search(query, TOP_K)；latency 不进确定性对比。
 */
async function runEval(embedder, cognitions, cases) {
  const retriever = new VectorRetriever(':memory:', embedder);
  try {
    await retriever.indexAll(cognitions.map((c) => ({ id: c.id, text: c.content })));

    const results = [];
    for (const c of cases) {
      const t0 = performance.now();
      const hits = await retriever.search(c.query, TOP_K);
      const latency = performance.now() - t0;

      const expect = c.expect;
      const top5 = hits.slice(0, 5).map((h) => h.id);
      const top5Set = new Set(top5);
      const inTop5 = expect.filter((id) => top5Set.has(id)).length;
      const recall5 = inTop5 / expect.length;
      const hit5 = expect.some((id) => top5Set.has(id)) ? 1 : 0;

      let firstRank = 0;
      for (let i = 0; i < hits.length; i++) {
        if (expect.includes(hits[i].id)) {
          firstRank = i + 1;
          break;
        }
      }
      const rr10 = firstRank ? 1 / firstRank : 0;

      results.push({
        id: c.id,
        query: c.query,
        kind: c.kind,
        lang: langOf(c.query),
        expect,
        top5,
        recall5,
        hit5,
        firstRank,
        rr10,
        latency,
      });
    }

    const byKind = {};
    for (const kind of ['direct', 'paraphrase', 'multihop']) {
      byKind[kind] = aggregate(results.filter((r) => r.kind === kind));
    }
    const byLang = {};
    for (const lang of ['zh', 'en']) {
      byLang[lang] = aggregate(results.filter((r) => r.lang === lang));
    }
    const overall = aggregate(results);
    const latencies = results.map((r) => r.latency).sort((a, b) => a - b);
    const latency = { p50: percentile(latencies, 50), p95: percentile(latencies, 95) };

    return { results, overall, byKind, byLang, latency };
  } finally {
    retriever.close();
  }
}

/** 抽取【确定性签名】：逐 case 的 recall5/hit5/rr10 + 分组 mean（不含 latency），用于两遍逐位比对。 */
function deterministicSig(run) {
  return JSON.stringify({
    perCase: run.results
      .map((r) => ({ id: r.id, recall5: r.recall5, hit5: r.hit5, rr10: r.rr10 }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    overall: { recall5: run.overall.recall5, hit5: run.overall.hit5, mrr10: run.overall.mrr10 },
    byKind: run.byKind,
    byLang: run.byLang,
  });
}

const f4 = (n) => n.toFixed(4);
const f3 = (n) => n.toFixed(3);

function metricRow(label, agg) {
  return `| ${label} | ${agg.n} | ${f4(agg.recall5)} | ${f4(agg.hit5)} | ${f4(agg.mrr10)} |`;
}

function buildReport(run, meta) {
  const { overall, byKind, byLang, latency } = run;
  const L = [];
  L.push('# 检索基线报告（vector-only）— Phase 1 §14.2');
  L.push('');
  L.push('> 本报告量的是【当前 vector-only 系统】在黄金集上的召回，作为 §14.3/14.4 加 BM25+RRF');
  L.push('> hybrid 后对比的**基准**。先入库基线，才动优化（先测量后优化）。');
  L.push('');
  L.push('## 生成环境');
  L.push('');
  L.push('| 项 | 值 |');
  L.push('| --- | --- |');
  L.push(`| 生成命令 | \`${GEN_CMD}\` |`);
  L.push(`| commit | \`${meta.commit}\` |`);
  L.push(`| Node | ${meta.node} |`);
  L.push(`| 平台 | ${meta.platform}/${meta.arch} |`);
  L.push(`| 生成时间 | ${meta.generatedAt} |`);
  L.push(`| 臂 | HashEmbedder（dim=${DEFAULT_DIM}，确定性词袋哈希） |`);
  L.push(`| topK | ${TOP_K} |`);
  L.push(`| 黄金集 | tests/retrieval/golden.json（${meta.cognitionCount} 条 cognition，${meta.caseCount} 条 case） |`);
  L.push(`| 确定性自检 | ${meta.determinismOk ? '通过（两遍指标逐位相等）' : '失败'} |`);
  L.push(`| 真实臂 | ${meta.realArm} |`);
  L.push('');
  L.push('## 总体指标');
  L.push('');
  L.push('| 分组 | n | Recall@5 | Hit@5 | MRR@10 |');
  L.push('| --- | --- | --- | --- | --- |');
  L.push(metricRow('overall', overall));
  L.push('');
  L.push('## 按 kind 分组');
  L.push('');
  L.push('| kind | n | Recall@5 | Hit@5 | MRR@10 |');
  L.push('| --- | --- | --- | --- | --- |');
  L.push(metricRow('direct', byKind.direct));
  L.push(metricRow('paraphrase', byKind.paraphrase));
  L.push(metricRow('multihop', byKind.multihop));
  L.push('');
  L.push('## 按语言分组（query 含 CJK=zh，否则 en）');
  L.push('');
  L.push('| lang | n | Recall@5 | Hit@5 | MRR@10 |');
  L.push('| --- | --- | --- | --- | --- |');
  L.push(metricRow('zh', byLang.zh));
  L.push(metricRow('en', byLang.en));
  L.push('');
  L.push('## Latency（全体 search，ms）');
  L.push('');
  L.push('| 分位 | ms |');
  L.push('| --- | --- |');
  L.push(`| P50 | ${f3(latency.p50)} |`);
  L.push(`| P95 | ${f3(latency.p95)} |`);
  L.push('');
  L.push('> latency 为本机测量、非确定量，不参与确定性自检；仅供量级参考。');
  L.push('');

  // 重点结论 1：direct vs paraphrase Recall 差
  const dR = byKind.direct.recall5;
  const pR = byKind.paraphrase.recall5;
  const diff = dR - pR;
  L.push('## 重点结论');
  L.push('');
  L.push('### 1. direct vs paraphrase 的 Recall 差');
  L.push('');
  L.push(`- direct Recall@5 = **${f4(dR)}**，paraphrase Recall@5 = **${f4(pR)}**，差值 = **${f4(diff)}**。`);
  L.push('- 预期 direct 高、paraphrase 低：HashEmbedder 只做**词面匹配**（FNV-1a 词袋哈希 + char-bigram），');
  L.push('  paraphrase 靠换词/近义/跨语言表达，词面重叠少，语义召回够不着。');
  L.push('- 这正是 Phase 1 §14.3/14.4 的靶子——paraphrase 的语义缺口要靠**真实嵌入臂**与 **BM25+RRF hybrid** 补。');
  L.push('');

  // 重点结论 2：9 条纯 2 字中文 direct
  const twoChar = run.results.filter((r) => TWO_CHAR_CASES.includes(r.id));
  const twoCharHit = twoChar.filter((r) => r.hit5 === 1).length;
  const twoCharRecall = aggregate(twoChar);
  L.push('### 2. 9 条纯 2 字中文 direct 用例的召回');
  L.push('');
  L.push('验证向量 char-bigram 能否兜住 trigram 关键词通道够不着的 2 字词（G-004/G-008/G-009/G-010/G-013/G-015/G-016/G-018/G-019）。');
  L.push('');
  L.push(`- 命中（Hit@5=1）：**${twoCharHit}/${twoChar.length}**；这组 Recall@5 = **${f4(twoCharRecall.recall5)}**，MRR@10 = **${f4(twoCharRecall.mrr10)}**。`);
  L.push('');
  L.push('| case | query | expect | firstRank | top5 命中? | recall5 | rr10 | top5（截断） |');
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of twoChar) {
    const hitMark = r.hit5 ? '✓' : '✗';
    const rank = r.firstRank ? String(r.firstRank) : '—';
    L.push(
      `| ${r.id} | ${r.query} | ${r.expect.join(', ')} | ${rank} | ${hitMark} | ${f4(r.recall5)} | ${f4(r.rr10)} | ${r.top5.join(', ')} |`,
    );
  }
  L.push('');

  L.push('## 备注');
  L.push('');
  L.push('- **vector-only 基线**：只有 VectorRetriever（余弦）+ 确定性 HashEmbedder，无 BM25、无 hybrid、无 rerank。');
  L.push(`- **真实臂 ${meta.realArmPending ? 'pending' : '已跑'}**：${meta.realArm}`);
  L.push('- **先入库基线，才动优化**：本报告数字是 §14.3/14.4 优化前的对照基准，每个数字可由生成命令复现（HashEmbedder 确定性）。');
  L.push('');
  return L.join('\n');
}

function printConsole(run, meta) {
  const { overall, byKind, byLang, latency } = run;
  console.log('');
  console.log('════════ 检索基线评测（vector-only · Phase 1 §14.2）════════');
  console.log(`commit ${meta.commit} · Node ${meta.node} · ${meta.platform}/${meta.arch} · 臂 HashEmbedder(dim=${DEFAULT_DIM}) · topK=${TOP_K}`);
  console.log(`黄金集：${meta.cognitionCount} cognition / ${meta.caseCount} case`);
  console.log('');
  console.log('── 总体 ──');
  console.log(`overall   n=${overall.n}  Recall@5=${f4(overall.recall5)}  Hit@5=${f4(overall.hit5)}  MRR@10=${f4(overall.mrr10)}`);
  console.log('── 按 kind ──');
  for (const k of ['direct', 'paraphrase', 'multihop']) {
    const a = byKind[k];
    console.log(`${k.padEnd(11)} n=${a.n}  Recall@5=${f4(a.recall5)}  Hit@5=${f4(a.hit5)}  MRR@10=${f4(a.mrr10)}`);
  }
  console.log('── 按语言 ──');
  for (const l of ['zh', 'en']) {
    const a = byLang[l];
    console.log(`${l.padEnd(11)} n=${a.n}  Recall@5=${f4(a.recall5)}  Hit@5=${f4(a.hit5)}  MRR@10=${f4(a.mrr10)}`);
  }
  console.log('── latency（ms）──');
  console.log(`P50=${f3(latency.p50)}  P95=${f3(latency.p95)}`);
  console.log('');
  const dR = byKind.direct.recall5;
  const pR = byKind.paraphrase.recall5;
  console.log(`结论① direct Recall@5=${f4(dR)} vs paraphrase Recall@5=${f4(pR)}，差=${f4(dR - pR)}`);
  const twoChar = run.results.filter((r) => TWO_CHAR_CASES.includes(r.id));
  const twoCharHit = twoChar.filter((r) => r.hit5 === 1).length;
  console.log(`结论② 9 条纯 2 字中文 direct：命中 ${twoCharHit}/${twoChar.length}，Recall@5=${f4(aggregate(twoChar).recall5)}`);
  console.log('════════════════════════════════════════════════════════');
  console.log('');
}

async function main() {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
  const { cognitions, cases } = golden;

  const meta = {
    commit: (() => {
      try {
        return execSync('git rev-parse --short HEAD', { cwd: HERE }).toString().trim();
      } catch {
        return 'unknown';
      }
    })(),
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    generatedAt: new Date().toISOString(),
    cognitionCount: cognitions.length,
    caseCount: cases.length,
  };

  // ── 确定性自检：跑两遍，逐位比对指标（latency 除外）──
  const run1 = await runEval(new HashEmbedder(), cognitions, cases);
  const run2 = await runEval(new HashEmbedder(), cognitions, cases);
  const sig1 = deterministicSig(run1);
  const sig2 = deterministicSig(run2);
  const determinismOk = sig1 === sig2;
  meta.determinismOk = determinismOk;
  if (!determinismOk) {
    console.error('[eval-retrieval] ✗ 确定性自检失败：两遍指标不逐位相等（HashEmbedder 应为确定性）。');
    console.error('run1:', sig1);
    console.error('run2:', sig2);
    process.exit(1);
  }
  console.log('[eval-retrieval] ✓ 确定性自检通过：两遍指标逐位相等。');

  // ── 真实臂（OpenAICompatEmbedder）：opt-in，默认关（默认纯离线、不打网络，§14.1）──
  const wantRealArm = process.env.EVAL_REAL_ARM === '1' || process.argv.includes('--real');
  const embedCfg = wantRealArm ? loadEmbedConfig() : null;
  if (embedCfg) {
    try {
      console.log(`[eval-retrieval] 真实臂：OpenAICompatEmbedder（model=${embedCfg.model}）跑黄金集…`);
      const realRun = await runEval(new OpenAICompatEmbedder(embedCfg), cognitions, cases);
      meta.realArm = `OpenAICompatEmbedder（model=${embedCfg.model}）overall Recall@5=${f4(realRun.overall.recall5)} Hit@5=${f4(realRun.overall.hit5)} MRR@10=${f4(realRun.overall.mrr10)}`;
      meta.realArmPending = false;
      console.log(`[eval-retrieval] 真实臂 overall Recall@5=${f4(realRun.overall.recall5)} Hit@5=${f4(realRun.overall.hit5)} MRR@10=${f4(realRun.overall.mrr10)}`);
    } catch (err) {
      meta.realArm = `配置存在但调用失败（${err instanceof Error ? err.message : String(err)}）— pending`;
      meta.realArmPending = true;
      console.error('[eval-retrieval] 真实臂调用失败：', err instanceof Error ? err.message : err);
    }
  } else if (wantRealArm) {
    console.log('[eval-retrieval] 真实臂已请求，但无 embed 配置（.env 缺 MEMOWEFT_EMBED_*）');
    meta.realArm = '请求（EVAL_REAL_ARM/--real）但无 embed 配置 — pending';
    meta.realArmPending = true;
  } else {
    console.log('[eval-retrieval] 真实臂 off（默认离线；设 EVAL_REAL_ARM=1 或 --real 且有 .env MEMOWEFT_EMBED_* 以启用）');
    meta.realArm = 'off（默认离线确定；设 EVAL_REAL_ARM=1 或 --real 启用真实嵌入臂）';
    meta.realArmPending = true;
  }

  // ── 报告：终端 + 落盘 ──
  printConsole(run1, meta);
  const report = buildReport(run1, meta);
  writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`[eval-retrieval] 报告已写入 ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error('[eval-retrieval] 失败：', err);
  process.exit(1);
});
