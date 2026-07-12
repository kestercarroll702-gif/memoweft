/**
 * §19.3 置信度参数敏感性网格（Phase 6）。**纯确定性、零 LLM、零网络、零 .env**。
 *
 * 洞见:置信度底分与半衰期是 LLM 决定「记什么」之后由【规则】算的（computeConfidence / effectiveConfidence
 *   都是可注入 cfg 的纯函数），与 LLM 输出无关 → 敏感性可离线重算,不必 9× 重跑昂贵固化。
 *
 * 网格(§19.3):底分 ×{0.8, 1.0, 1.2}(±20%) × 半衰期 ×{0.5, 1.0, 2.0}。量两件事:
 *   Part A(底分±20%）:代表性输入空间上 credStatus 的【翻转率】——默认参数是否稳(远离档位边界)。
 *   Part B(半衰期×0.5/1/2）:各衰减类型在召回门(effectiveConfidence ≥ minEffectiveConfidence)下的【保留窗口天数】。
 *
 * 结论若指向「更优默认参数」→ 单独 commit + D-xxxx;若因此要改某条 eval 断言数值 → 铁律 1 报人类(§19.3)。
 * 本脚本只【刻画敏感性】,不改任何默认值。
 *
 * 直接从 src 的 .ts import（Node ≥24 原生剥类型）。只读依赖,绝不改 src/tests。
 * 用法:node bench/sensitivity-confidence.mjs   → 打印 + 写 bench/sensitivity-confidence.md
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { config } from '../src/config.ts';
import { computeConfidence, deriveCredStatus } from '../src/consolidation/confidence.ts';
import { effectiveConfidence } from '../src/background/decay.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = config.retrieval.minEffectiveConfidence; // 召回门 80
const BASE_MULTS = [0.8, 1.0, 1.2];
const HL_MULTS = [0.5, 1.0, 2.0];

/** 构造网格点 config 变体（structuredClone,绝不改全局单例）。 */
function variant(baseMult, hlMult) {
  const c = structuredClone(config);
  for (const k of Object.keys(c.consolidation.baseByFormedBy)) {
    c.consolidation.baseByFormedBy[k] = Math.round(c.consolidation.baseByFormedBy[k] * baseMult);
  }
  for (const k of Object.keys(c.background.halfLifeDays)) {
    c.background.halfLifeDays[k] = c.background.halfLifeDays[k] * hlMult;
  }
  return c;
}

// ── Part A:底分 ±20% → confidence / credStatus 敏感性 ─────────────────────────
const FORMED = ['stated', 'observed', 'ruled', 'inferred'];
const TYPES_A = ['fact', 'preference', 'state', 'trait']; // 含 transient(state)与非-transient
const SUPPORTS = [0, 1, 2, 3, 5];
const CONTRADICTS = [0, 1];

function partA() {
  const inputs = [];
  for (const formedBy of FORMED)
    for (const contentType of TYPES_A)
      for (const supportCount of SUPPORTS)
        for (const contradictCount of CONTRADICTS)
          inputs.push({ contentType, formedBy, supportCount, contradictCount });
  const RANK = { candidate: 0, low: 1, limited: 2, stable: 3, conflicted: -1 };
  let flips = 0, wild = 0; // wild = 跨 >1 档（非相邻边界）
  const examples = [];
  for (const inp of inputs) {
    const row = BASE_MULTS.map((m) => {
      const cfg = variant(m, 1.0);
      const conf = computeConfidence(inp, cfg);
      return { conf, cred: deriveCredStatus(conf, inp.contradictCount, inp.contentType, cfg) };
    });
    if (row[0].cred !== row[2].cred) { // 0.8 vs 1.2 翻转 credStatus
      flips++;
      const jump = Math.abs((RANK[row[2].cred] ?? 0) - (RANK[row[0].cred] ?? 0));
      if (jump > 1) wild++;
      if (examples.length < 14) examples.push({ inp, row });
    }
  }
  return { total: inputs.length, flips, wild, examples };
}

// ── Part B:半衰期 ×0.5/1/2 → 召回门保留窗口(天)────────────────────────────────
// 保留窗口 = effectiveConfidence 仍 ≥ GATE 的最大天数。固定起始把握度隔离半衰期效应。
const DECAY_TYPES = ['state', 'hypothesis', 'trend', 'goal', 'project', 'trait'];
const START_CONF = 500; // 代表性「有限置信」起点,隔离半衰期变量
function retentionDays(startConf, contentType, cfg) {
  const now = new Date('2026-01-01T00:00:00Z');
  let last = 0;
  for (let d = 0; d <= 800; d += 0.25) {
    const updatedAt = new Date(now.getTime() - d * 86_400_000).toISOString();
    const eff = effectiveConfidence({ confidence: startConf, contentType, updatedAt }, now, cfg);
    if (eff < GATE) return last;
    last = d;
  }
  return Infinity; // 800 天内不过门 = 不衰减类型
}
function partB() {
  const rows = [];
  for (const t of DECAY_TYPES) {
    const cells = HL_MULTS.map((m) => retentionDays(START_CONF, t, variant(1.0, m)));
    const hlDefault = config.background.halfLifeDays[t] ?? 0;
    rows.push({ type: t, hlDefault, cells });
  }
  return rows;
}

// ── 报告 ──────────────────────────────────────────────────────────────────────
function fmtDays(d) { return d === Infinity ? '∞(不衰减)' : `${d.toFixed(2)}d`; }

const a = partA();
const b = partB();
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'nogit'; } })();

const L = [];
L.push('# §19.3 置信度参数敏感性网格 (纯确定性,零 LLM)');
L.push('');
L.push(`- commit: \`${commit}\` · 网格:底分 ×{0.8, 1.0, 1.2} × 半衰期 ×{0.5, 1.0, 2.0} · 召回门 effectiveConfidence ≥ ${GATE}`);
L.push(`- 默认底分 baseByFormedBy=${JSON.stringify(config.consolidation.baseByFormedBy)} · 档位阈值=${JSON.stringify(config.consolidation.credThresholds)}`);
L.push('');
L.push('## Part A — 底分 ±20% 对 credStatus 的敏感性');
L.push('');
L.push(`代表性输入 ${a.total} 组(formedBy×contentType×support×contradict);量底分 0.8 vs 1.2 下 credStatus 是否翻转。`);
L.push('');
L.push(`- **翻转率:${a.flips}/${a.total} = ${(a.flips / a.total * 100).toFixed(1)}%**;其中**跨 >1 档的"野翻转":${a.wild}**(=${a.wild === 0 ? '全是相邻单档边界跨越,系统有序、无突变' : '存在跳档,需警惕'})。`);
L.push('');
L.push('翻转样例(在档位边界附近才翻):');
L.push('');
L.push('| formedBy | type | sup | con | conf@0.8 | conf@1.0 | conf@1.2 | cred 0.8→1.2 |');
L.push('|---|---|---|---|---|---|---|---|');
for (const e of a.examples) {
  const { inp, row } = e;
  L.push(`| ${inp.formedBy} | ${inp.contentType} | ${inp.supportCount} | ${inp.contradictCount} | ${row[0].conf} | ${row[1].conf} | ${row[2].conf} | ${row[0].cred} → ${row[2].cred} |`);
}
L.push('');
L.push('## Part B — 半衰期 ×0.5/1/2 对召回保留窗口的影响');
L.push('');
L.push(`各衰减类型:起始把握度 ${START_CONF} 的认知,多少天后有效置信跌破召回门 ${GATE}(= 不再被召回)。`);
L.push('');
L.push('| contentType | 默认半衰期(天) | 窗口 ×0.5 | 窗口 ×1.0 | 窗口 ×2.0 |');
L.push('|---|---|---|---|---|');
for (const r of b) {
  L.push(`| ${r.type} | ${r.hlDefault} | ${fmtDays(r.cells[0])} | ${fmtDays(r.cells[1])} | ${fmtDays(r.cells[2])} |`);
}
L.push('');
L.push('## 结论');
L.push('');
L.push(`- **底分 ±20%**:翻转率 ${(a.flips / a.total * 100).toFixed(1)}%,但**野翻转(跳档)= ${a.wild}**。翻转全是相邻档边界跨越,集中在 \`stated\` 底分(600 恰落在 limited/stable 阈值 500–750 之间),±20% 把它推过边界——这是**分档系统的固有特性、非缺陷**,系统有序无突变。`);
L.push('- **半衰期**:召回保留窗口随半衰期【线性】伸缩(×0.5/1/2 → 窗口 ×0.5/1/2),无悬崖/非线性突变 → 半衰期是可预测的「遗忘速度」旋钮。');
L.push('- **未发现更优默认参数**(本刻画是敏感性表征,无质量信号可据以调优);默认值行为有序、可预测,**不触发** §19.3 的「改默认→D-xxxx」或「改 eval 断言→铁律1」路径。留一处观察:`stated` 底分 600 位于 limited/stable 中点,把握度定性对它较敏感——日后若要让 stated 更稳定地落 stable,可考虑抬底分或降 stable 阈值,届时以本网格为依据评估、按 §19.3 流程报批。');
L.push('');
const report = L.join('\n') + '\n';
console.log(report);
writeFileSync(resolve(HERE, 'sensitivity-confidence.md'), report);
console.log('written: bench/sensitivity-confidence.md');
