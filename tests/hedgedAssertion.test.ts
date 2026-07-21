/**
 * 含糊自述（hedged）封顶的纯函数层对抗测试。
 *
 * 靶心：修掉「保守性倒置」——用户主动说但话说得含糊（assertion_strength=weak）的自述，
 *   原本按 stated 拿 600 底分，比"点头认一个 AI 已经钉死的命题"（confirmed 280）还高。
 *   含糊自述连命题边界都没定，不该比后者更有把握。
 *
 * 本文件从【纯函数层】钉四件事（接线层——consolidate 与 managementApi 的 8 个 computeConfidence
 * 调用点漏接导致 hedged 蒸发——由端到端测试另钉，那是本方案真正的最大风险面）：
 *   ① isHedgedStated 的判定边界：非 stated 恒 false / 无解析兜底 false / explicit 一票否决 /
 *      至少一条 weak 才 true / **只拦 weak 不拦 none** / assistant_proposed 的 weak 不污染自述；
 *   ② hedgeCap 封顶生效：含糊 stated 无论攒多少支持都上不去；
 *   ③ 两个 cap 用 min 而非赋值 —— 只压不抬（inferred 200 不会被"封"到 280），
 *      且与 transientCap 可组合（含糊的 state = min(600,280,300) = 280）；
 *   ④ hedged 可选 ⇒ 省略时行为逐位不变（这是既有调用点与 parity 夹具旧用例不动的契约）。
 * 全离线纯函数，不碰 store、不碰 LLM。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeConfidence,
  isHedgedStated,
  type HedgeInput,
} from '../src/consolidation/confidence.ts';
import { config } from '../src/config.ts';
import type { PropositionOrigin, AssertionStrength } from '../src/interaction/model.ts';

/** 造一条支持证据的语义解析（只含 isHedgedStated 看的两维）。 */
const r = (
  propositionOrigin: PropositionOrigin | null,
  assertionStrength: AssertionStrength | null,
): HedgeInput => ({ propositionOrigin, assertionStrength });

// ── ① isHedgedStated：判定边界逐条 ──────────────────────────────────────

test('只有一条含糊自述 → hedged（本次要修的正例："我可能不太会做饭"）', () => {
  assert.equal(isHedgedStated('stated', [r('user_stated', 'weak')]), true);
});

test('明确断言 → 不 hedged（"我是素食者"原样拿 stated 满分）', () => {
  assert.equal(isHedgedStated('stated', [r('user_stated', 'explicit')]), false);
});

test('explicit 一票否决：同一认知里既有明确断言又有含糊话 → 不 hedged', () => {
  // 用户只要把话说明白过一次，命题边界就定了，别的含糊话不该再把它拖下来。
  assert.equal(
    isHedgedStated('stated', [r('user_stated', 'weak'), r('user_stated', 'explicit')]),
    false,
  );
});

test('多条全 weak → hedged（含糊说了几遍还是含糊，攒不出确定性）', () => {
  assert.equal(
    isHedgedStated('stated', [r('user_stated', 'weak'), r('user_stated', 'weak')]),
    true,
  );
});

test('【只拦 weak 不拦 none】assertion_strength=none 不触发封顶', () => {
  // 实测 none 的填充率为 0：真实数据里它只可能来自误标。拦它收益为零，
  // 假阳风险（把确定陈述错误封顶）却是实的。日后 none 有了明确语义再扩展。
  assert.equal(isHedgedStated('stated', [r('user_stated', 'none')]), false);
  assert.equal(isHedgedStated('stated', [r('user_stated', null)]), false);
});

test('none 与 weak 并存 → 仍 hedged（none 只是不算数，不是否决票）', () => {
  assert.equal(
    isHedgedStated('stated', [r('user_stated', 'none'), r('user_stated', 'weak')]),
    true,
  );
});

test('assistant_proposed 的 weak 不污染自述：user_stated 那条是 explicit → 不 hedged', () => {
  // 对 AI 猜测的含糊回应走的是 confirmed 那条路，压根不构成 stated 的理由。
  assert.equal(
    isHedgedStated('stated', [r('assistant_proposed', 'weak'), r('user_stated', 'explicit')]),
    false,
  );
});

test('assistant_proposed 的 weak 单独存在也不足以判 hedged', () => {
  assert.equal(isHedgedStated('stated', [r('assistant_proposed', 'weak')]), false);
});

test('【结构兜底】没有 resolution → 不 hedged（解析不出就不臆造惩罚）', () => {
  // deriveFormedBy 在没解析时会结构兜底成 stated，那种 stated 我们并不知道说得含不含糊。
  assert.equal(isHedgedStated('stated', [null]), false);
  assert.equal(isHedgedStated('stated', [r(null, 'weak')]), false);
});

test('空支持集 → 不 hedged', () => {
  assert.equal(isHedgedStated('stated', []), false);
});

test('【非 stated 恒 false】四种非 stated 形成方式带 weak 也不 hedged', () => {
  // hedged 只修「stated 底分 600 太高」这一个缺口；别的载体维底分本就低，再叠封顶既无意义
  // 又会把 hedged 变成一个到处生效的隐性扣分项。
  for (const fb of ['confirmed', 'observed', 'inferred', 'ruled'] as const) {
    assert.equal(isHedgedStated(fb, [r('user_stated', 'weak')]), false, fb);
  }
});

// ── ② hedgeCap 封顶 ────────────────────────────────────────────────────

test('含糊 stated 被封到 hedgeCap：600 → 280', () => {
  const plain = computeConfidence({
    contentType: 'fact',
    formedBy: 'stated',
    supportCount: 1,
    contradictCount: 0,
  });
  const hedged = computeConfidence({
    contentType: 'fact',
    formedBy: 'stated',
    supportCount: 1,
    contradictCount: 0,
    hedged: true,
  });
  assert.equal(plain, 600);
  assert.equal(hedged, 280);
});

test('攒满支持也顶不上去：支持封顶的 800 遇 hedged 仍是 280', () => {
  assert.equal(
    computeConfidence({
      contentType: 'fact',
      formedBy: 'stated',
      supportCount: 6, // 支持加分封顶：min(5,5)*40 = 200
      contradictCount: 0,
      hedged: true,
    }),
    280,
  );
});

test('封顶后不超过 limited：hedgeCap + 支持满分 = 480 < 500，含糊自述顶天"低置信"', () => {
  const c = config.consolidation;
  assert.equal(c.hedgeCap, 280);
  assert.equal(c.hedgeCap, c.baseByFormedBy.confirmed, 'hedgeCap 应与 confirmed 底分对齐');
  assert.ok(c.hedgeCap + c.supportStep * c.supportCap < c.credThresholds.limited);
});

test('封顶值落进 asking.confidenceBand → 含糊自述会被主动澄清，而不是被当事实用', () => {
  const band = config.asking.confidenceBand;
  assert.ok(config.consolidation.hedgeCap >= band.min && config.consolidation.hedgeCap <= band.max);
});

// ── ③ min 而非赋值：只压不抬 + 与 transientCap 可组合 ────────────────────

test('hedged 是 min 不是赋值：inferred 的 200 不会被"封"到 280', () => {
  assert.equal(
    computeConfidence({
      contentType: 'hypothesis',
      formedBy: 'inferred',
      supportCount: 1,
      contradictCount: 0,
      hedged: true,
    }),
    200,
  );
});

test('与 transientCap 组合：含糊的 state = min(600, 280, 300) = 280', () => {
  const plain = computeConfidence({
    contentType: 'state',
    formedBy: 'stated',
    supportCount: 1,
    contradictCount: 0,
  });
  const hedged = computeConfidence({
    contentType: 'state',
    formedBy: 'stated',
    supportCount: 1,
    contradictCount: 0,
    hedged: true,
  });
  assert.equal(plain, 300, '非含糊的 state 走 transientCap');
  assert.equal(hedged, 280, '两个 cap 都是 min，取更小的 hedgeCap');
});

test('与反证扣分组合：600-120=480，hedged 后仍压到 280（反驳过后不该反而暴涨）', () => {
  assert.equal(
    computeConfidence({
      contentType: 'fact',
      formedBy: 'stated',
      supportCount: 1,
      contradictCount: 1,
      hedged: true,
    }),
    280,
  );
});

test('封顶值可注入：cfg.hedgeCap 改了就按新值封', () => {
  const cfg = {
    ...config,
    consolidation: { ...config.consolidation, hedgeCap: 400 },
  };
  assert.equal(
    computeConfidence(
      {
        contentType: 'fact',
        formedBy: 'stated',
        supportCount: 1,
        contradictCount: 0,
        hedged: true,
      },
      cfg,
    ),
    400,
  );
});

// ── ④ 可选字段的兼容契约 ────────────────────────────────────────────────

test('省略 hedged ≡ hedged:false ≡ 旧行为（既有调用点与 parity 旧用例逐位不变）', () => {
  const omitted = computeConfidence({
    contentType: 'fact',
    formedBy: 'stated',
    supportCount: 3,
    contradictCount: 0,
  });
  const explicitFalse = computeConfidence({
    contentType: 'fact',
    formedBy: 'stated',
    supportCount: 3,
    contradictCount: 0,
    hedged: false,
  });
  assert.equal(omitted, 680); // 600 + 2*40
  assert.equal(explicitFalse, omitted);
});

test('端到端语义：含糊自述(280) 不再高于点头认账(confirmed 280)，倒置被抹平', () => {
  const hedgedSelfReport = computeConfidence({
    contentType: 'trait',
    formedBy: 'stated',
    supportCount: 1,
    contradictCount: 0,
    hedged: true,
  });
  const nodAtAiGuess = computeConfidence({
    contentType: 'trait',
    formedBy: 'confirmed',
    supportCount: 1,
    contradictCount: 0,
  });
  assert.ok(hedgedSelfReport <= nodAtAiGuess, '含糊自述不该比"认一个已钉死的命题"更有把握');
});
