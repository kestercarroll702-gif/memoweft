#!/usr/bin/env node
/**
 * test:live — 真实模型三腿编排器（Phase 2 · §15.4 A3）。
 *
 * 消灭 nightly `--if-present` 空跑陷阱：缺 LLM key 不再静默跳过退 0，而是打印【缺哪个 + 怎么配】并 exit 1。
 * 开跑前打印【计划表】（哪条跑 / 跳过 / 为什么），跑完打印【汇总】（逐腿 跑了 / 跳过(原因) / 通过 / 失败）。
 *
 * 三条腿：
 *   腿1 · live e2e        node --test tests/**\/*.e2e.ts（等价 npm run test:e2e）。非零退出 = 失败。
 *   腿2 · 固化真实臂(全量42) node bench/eval-consolidation.mjs --out bench/runs/<date>-<sha>-consolidation-live
 *                          读 <prefix>.json：agg.errored>0 = 失败（崩溃门，非质量门；§15.2 / D-0009 不设质量阈）。
 *                          用 --out 是为了不覆盖 bench/consolidation-baseline.*（那是基线，只有 bench:consolidation 才更新）。
 *   腿3 · 检索真实臂       仅当 embed 配置（MEMOWEFT_EMBED_*，含 DLA_ 回退）存在时跑：
 *                          EVAL_REAL_ARM=1 node bench/eval-retrieval.mjs --ablation --require-real-arm --out <prefix>
 *                          非零退出 = 失败；未配 embed → 大声跳过（不算失败，但进汇总，不静默截断）。
 *
 * 退出码：任一"实际跑了的"腿失败 → 1；否则 0（跳过的腿不计入失败）。
 * 纪律：只读 process.env，绝不打印 api key（脱敏，只显示 base_url 与 model）；不碰 src/tests，只编排既有脚本。
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const RUNS_DIR = resolve(ROOT, 'bench/runs');

// ══════════════════════════════════════════════════════════════════════════
// 纯函数（可单测；不加载 .env、不碰全局 process.env——调用方显式传 env）
// ══════════════════════════════════════════════════════════════════════════

/** 读单个 env 键，双前缀兼容 MEMOWEFT_ / DLA_（与 src/llm/client.ts readEnvWithFallback 同口径：?? 链）。 */
export function readEnvWithFallback(env, name) {
  return env[`MEMOWEFT_${name}`] ?? env[`DLA_${name}`] ?? '';
}

/** 纯函数：LLM 三件套齐否（预测 loadLLMConfig 会不会成功）。返回 { ok, missing:[键名], baseUrl, model }。 */
export function checkLlmConfig(env) {
  const need = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'];
  const missing = need.filter((k) => !readEnvWithFallback(env, k));
  return {
    ok: missing.length === 0,
    missing,
    baseUrl: readEnvWithFallback(env, 'LLM_BASE_URL'),
    model: readEnvWithFallback(env, 'LLM_MODEL'),
  };
}

/** 纯函数：embed 三件套齐否（腿3 触发条件；预测 loadEmbedConfig 会不会返回非 null）。 */
export function checkEmbedConfig(env) {
  const need = ['EMBED_BASE_URL', 'EMBED_API_KEY', 'EMBED_MODEL'];
  const missing = need.filter((k) => !readEnvWithFallback(env, k));
  return {
    ok: missing.length === 0,
    missing,
    baseUrl: readEnvWithFallback(env, 'EMBED_BASE_URL'),
    model: readEnvWithFallback(env, 'EMBED_MODEL'),
  };
}

/** 脱敏：只吐 base_url 与 model，绝不碰 api key。 */
export function maskConfig(cfg) {
  return `base_url=${cfg.baseUrl || '(空)'} · model=${cfg.model || '(空)'}`;
}

// ══════════════════════════════════════════════════════════════════════════
// 编排（有副作用：跑子进程、读产物）
// ══════════════════════════════════════════════════════════════════════════

function tryLoadEnv() {
  try {
    process.loadEnvFile(); // 从 cwd 读 .env（CI 注入 secrets 时无 .env → 抛错，忽略即可）
  } catch {
    /* 无 .env 或已由 --env-file 加载；env 变量优先于文件，不覆盖已注入的 secrets */
  }
}

function shortSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'nogit';
  }
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** 跑一条子进程腿：node <argv…>，stdio 直通。返回 { code }（非零从异常 .status 取，取不到当 1）。 */
function runNodeLeg(argv, env) {
  try {
    execFileSync(process.execPath, argv, { cwd: ROOT, stdio: 'inherit', env });
    return { code: 0 };
  } catch (e) {
    return { code: typeof e?.status === 'number' ? e.status : 1 };
  }
}

async function main() {
  tryLoadEnv();
  const llm = checkLlmConfig(process.env);
  const embed = checkEmbedConfig(process.env);

  // ── 前置检查：缺 LLM key → 打印缺哪个 + 怎么配，exit 1（绝不"缺 key 就静默跳过然后退 0"）──
  if (!llm.ok) {
    console.error('════════════════ test:live 前置检查失败 ════════════════');
    console.error(`缺少必需的 LLM 配置：${llm.missing.join(', ')}`);
    console.error('请在根 .env 或环境变量设置（双前缀：MEMOWEFT_ 优先，回退旧名 DLA_）：');
    for (const k of llm.missing) console.error(`  MEMOWEFT_${k}   （或 DLA_${k}）`);
    console.error('三者齐备才能跑真实模型端到端；test:live 不接受"缺 key 就静默跳过然后退 0"。');
    console.error('（只想离线验逻辑：node bench/eval-consolidation.mjs --selftest）');
    console.error('════════════════════════════════════════════════════════');
    process.exit(1);
  }

  mkdirSync(RUNS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD（产物文件名，非核心逻辑）
  const sha = shortSha();
  const consolidationPrefix = resolve(RUNS_DIR, `${date}-${sha}-consolidation-live`);
  const retrievalPrefix = resolve(RUNS_DIR, `${date}-${sha}-retrieval-live`);

  // ── 计划表（开跑前）──
  console.log('════════════════════ test:live 计划表 ════════════════════');
  console.log(`LLM（必需·已配）  ${maskConfig(llm)}`);
  console.log(`embed（可选）      ${embed.ok ? maskConfig(embed) : '未配置 → 腿3 大声跳过'}`);
  console.log('');
  console.log('腿1 · live e2e            将跑  node --test tests/**/*.e2e.ts（各用例靠 HAS_LLM 自动 skip/run）');
  console.log(`腿2 · 固化真实臂(全量42)  将跑  eval-consolidation --out ${consolidationPrefix}`);
  console.log('                          崩溃门：agg.errored>0 → 失败；不设质量分数阈（§15.2 / D-0009）');
  if (embed.ok) {
    console.log(`腿3 · 检索真实臂          将跑  EVAL_REAL_ARM=1 eval-retrieval --ablation --require-real-arm --out ${retrievalPrefix}`);
  } else {
    console.log('腿3 · 检索真实臂          跳过  未配置 MEMOWEFT_EMBED_*（本地 Ollama 端点在 CI 不可达），不计入失败');
  }
  console.log('==========================================================');
  console.log('');

  const results = [];

  // ── 腿1 · live e2e ──
  console.log('──────── 腿1 · live e2e 起跑 ────────');
  const r1 = runNodeLeg(['--test', 'tests/**/*.e2e.ts'], process.env);
  results.push({
    name: '腿1 · live e2e',
    ran: true,
    passed: r1.code === 0,
    detail: r1.code === 0 ? '通过（含 HAS_LLM 未命中而自动 skip 的用例）' : `node --test 退出码 ${r1.code}`,
  });

  // ── 腿2 · 固化真实臂（全量 42）──
  console.log('');
  console.log('──────── 腿2 · 固化真实臂（全量 42）起跑 ────────');
  const r2 = runNodeLeg(['bench/eval-consolidation.mjs', '--out', consolidationPrefix], process.env);
  if (r2.code !== 0) {
    results.push({ name: '腿2 · 固化真实臂', ran: true, passed: false, detail: `进程崩溃，退出码 ${r2.code}` });
  } else {
    const json = readJsonSafe(`${consolidationPrefix}.json`);
    if (!json) {
      results.push({
        name: '腿2 · 固化真实臂',
        ran: true,
        passed: false,
        detail: `未产出 JSON（${consolidationPrefix}.json）——LLM 未配置 / 语料缺失？`,
      });
    } else {
      const agg = json.agg ?? {};
      const pv = json.meta?.promptVersions ?? {};
      const pvStr = Object.keys(pv).sort().map((k) => `${k}@${pv[k]}`).join(' · ') || '(无)';
      const errored = agg.errored ?? 0;
      results.push({
        name: '腿2 · 固化真实臂',
        ran: true,
        passed: errored === 0,
        detail:
          `errored=${errored}（崩溃门${errored === 0 ? '通过' : '失败'}） · ` +
          `结构 ${agg.structPass}/${agg.structTotal} · 全绿 ${agg.scenariosPassed}/${json.meta?.scenarioCount ?? '?'} · 提示词 ${pvStr}`,
      });
    }
  }

  // ── 腿3 · 检索真实臂（embed 配置存在才跑）──
  if (embed.ok) {
    console.log('');
    console.log('──────── 腿3 · 检索真实臂 起跑 ────────');
    const r3 = runNodeLeg(
      ['bench/eval-retrieval.mjs', '--ablation', '--require-real-arm', '--out', retrievalPrefix],
      { ...process.env, EVAL_REAL_ARM: '1' },
    );
    results.push({
      name: '腿3 · 检索真实臂',
      ran: true,
      passed: r3.code === 0,
      detail: r3.code === 0 ? '通过（真实嵌入臂已跑，非 pending）' : `退出码 ${r3.code}（真实臂 pending / 调用失败，--require-real-arm 判失败）`,
    });
  } else {
    results.push({
      name: '腿3 · 检索真实臂',
      ran: false,
      skipped: true,
      detail: '未配置 MEMOWEFT_EMBED_*（含 DLA_ 回退）；本地 Ollama 端点在 CI 不可达 → 大声跳过，不计入失败',
    });
  }

  // ── 汇总 ──
  console.log('');
  console.log('════════════════════ test:live 汇总 ════════════════════');
  let failed = 0;
  for (const r of results) {
    let status;
    if (r.skipped) status = '跳过';
    else if (r.passed) status = '通过';
    else {
      status = '失败';
      failed++;
    }
    console.log(`[${status}] ${r.name.padEnd(16)} — ${r.detail}`);
  }
  console.log('========================================================');

  if (failed > 0) {
    console.error(`test:live 失败：${failed} 条实际跑了的腿未通过。`);
    process.exit(1);
  }
  console.log('test:live 通过：所有实际跑了的腿均通过（跳过的腿不计入失败）。');
  process.exit(0);
}

// 仅在被直接执行时跑 main；被 import 时只暴露纯函数（供单测/自验单独调用）。
const invoked = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  main().catch((err) => {
    console.error('[test:live] 编排器异常：', err);
    process.exit(1);
  });
}
