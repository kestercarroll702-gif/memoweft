# 提示词回归流程 Runbook(Phase 2 · §15.2–15.4)

> 写给三个月后接手的人(很可能就是你自己)。命令都能直接粘贴,每步都说清「你会看到什么」。
> 路径、脚本、数字均以**代码为准**(与 `phase0-calibration.md` 同一铁律)。发现对不上,以本仓当前代码为准并回报。
> 环境:根目录跑命令;临时文件写 `tmp/`(已在 `.gitignore`,不脏 git)。

---

## 0. 三十秒地图:三道闸门,各防一种漂移

| 会漂的东西 | 防它的闸门 | 在哪触发 |
| --- | --- | --- |
| **模型漂移**(换模型 / 模型更新后固化质量变差) | 42 场景固化评测(结构硬判 + 要点软判) | 手动 / nightly:`node bench/eval-consolidation.mjs` |
| **提示词漂移**(改了措辞却没记版本) | 提示词哈希快照闸门 | `npm test` 里的 `tests/prompts/registry.test.ts` |
| **schema 漂移**(改了建表却悄悄破坏老库升级) | 冻结的 0.1.0 数据库 fixture | `npm test` 里的 `tests/migrations.test.ts`(读 `tests/fixtures/memoweft-0.1.0.db`) |

**为什么没有 `fixtures:refresh` 脚本?** 因为确定性不是靠「录制夹具」来的,而是 19 个测试文件里的内联手写 fake + 一个冻结只读的 `.db`。刻意不给「一键重生成」,免得哪天手滑把基线冲掉。完整论证见 `DECISIONS.md` **D-0010**(不建 fixtures:refresh)。

---

## 1. 改一条提示词的完整流程(§15.3)

一句话:**改内容 → bump 版本 → 刷快照 → 跑全量拿 after → 和 before 对比 → 掉分就去 DECISIONS 交代。**

### 1.1 提示词住在哪

8 条受治理提示词都收敛在各模块的 `prompts.ts`,由 `src/prompts/registry.ts` 聚合成一张表:

| id | 文件 |
| --- | --- |
| `consolidate` | `src/consolidation/prompts.ts`(当前 **v2**) |
| `distill` | `src/distillation/prompts.ts` |
| `attribute` | `src/attribution/prompts.ts` |
| `reply` | `src/pipeline/prompts.ts` |
| `trends` | `src/background/prompts.ts` |
| `proposeAsk` / `revisitConflicts` | `src/asking/prompts.ts` |
| `jsonRepairNudge` | `src/llm/prompts.ts` |

每条形如 `{ id, version, text: { zh, en } }`。除 `consolidate=v2` 外其余都还是 `v1`。

### 1.2 改内容 → 必须 bump version

假设你要改 `consolidate`。在 `src/consolidation/prompts.ts` 里改 `text.zh` / `text.en`,**同一次改动**把 `version: 'v2'` 抬成 `'v3'`。

不 bump 会怎样,见 1.4。

### 1.3 不需要改测试(版本值由快照钉,不是第二本账)

`tests/prompts/registry.test.ts` **故意不**硬编码 id→version 的期望表。版本值已经被哈希快照钉死了——快照每行形如:

```
consolidate@v2  zh=sha256:ed9486ec…  en=sha256:8ec53b28…
```

版本一动,这行就变,快照不同步就红。测试只管**格式**(`/^v\d+$/`)与**自洽**(`promptVersions()` 逐条等于注册表)。所以合法 bump 的动作只有:改 `prompts.ts` → `npm run prompts:update`。**不用改测试。**

### 1.4 刷新哈希快照

```
npm run prompts:update
```

**你会看到**:

```
已写入 …/tests/prompts/prompt-hashes.snapshot(8 条)

⚠️  提示词哈希快照已刷新。§15.3 / D-0009:改提示词内容属【受治理变更】——
    必须 bump 该条 version、重跑 bench/eval-consolidation.mjs 全量,并在 commit 正文附前后分数对比。
```

这条命令重算每条 zh/en 的 sha256,写进机读快照 `tests/prompts/prompt-hashes.snapshot`(`.gitattributes` 已把它钉成 LF)。

### 1.5 不 bump 会怎样:`npm test` 立刻红

如果你改了内容却**没 bump version、没刷快照**,`npm test` 里的 `tests/prompts/registry.test.ts` 会红,信息长这样:

```
提示词内容变了(registry 现算哈希 ≠ 快照)。
第 2 行差异:
  - 快照: consolidate@v2  zh=sha256:…旧…  en=sha256:…
  + 现算: consolidate@v2  zh=sha256:…新…  en=sha256:…

若是【有意】改动:bump version → 跑 `npm run prompts:update` → 重跑 `bench/eval-consolidation.mjs` 全量 → …
```

这就是哈希闸门:**内容动了、版本没动 = 红**,逼你走完整流程。

### 1.6 跑全量固化评测,拿 after

```
node bench/eval-consolidation.mjs
```

**你会看到**:逐场景打印「固化中… → 结构断言 X/Y → 用时 Ns」,最后一张总分表 + 按 discipline 分组表。

- **慢**:实测 82–141s/场景,全量 42 场景约 **77 分钟**(外加每场景的 judge 调用)。找个能等的时候跑,或交给 nightly。
- **前置**:根 `.env` 要有 `MEMOWEFT_LLM_BASE_URL` / `_API_KEY` / `_MODEL`(被测 = mimo)。没配会打印「BLOCKED:LLM 未配置」并 **exit 0**(不算失败,提示你去配)。
- **产物**:全量跑会**覆盖**已提交的 `bench/consolidation-baseline.md` 和 `bench/consolidation-baseline.json`——这份新文件就是你的 **after**。

> 只想验脚本逻辑、不烧 77 分钟:`node bench/eval-consolidation.mjs --selftest`(离线 mock,秒出,必须 exit 0)。

### 1.7 取 before,出前后对比

**before = 上一版基线的机读 JSON**。改提示词**之前**的那版基线在 git 里,取出来放进 `tmp/`:

```
mkdir -p tmp
git show HEAD:bench/consolidation-baseline.json > tmp/before.json
```

> ⚠ **前提**:上一版基线的 `.json` 已入库。**当前仓库只提交了 `consolidation-baseline.md`,还没提交同名 `.json`**(见文末「已知缺口」)。第一次跑对比前,需要先有一版带 `.json` 的全量基线入库,`git show` 才取得到。

然后纯离线对比(**不调模型、不读 .env、秒出**):

```
node bench/eval-consolidation.mjs --compare tmp/before.json bench/consolidation-baseline.json
```

参数顺序固定:**第一个是 before(a),第二个是 after(b)**。

**你会看到**:可比性警示 → 提示词版本变更(`consolidate: v2 → v3`)→ 总体硬指标 Δ → 总体软判 Δ → 按 discipline 明细。最底下这段可直接粘进 commit 正文:

```
── commit 正文摘要(可直接粘贴)──
结构断言 88.8%→94.2%(198→210/223);全绿 25→30;chitchat-negative 21/35→33/35
```

### 1.8 分数下降 → 必须去 DECISIONS 交代取舍

只要 after 的**结构硬指标**较 before 有下降(某类 discipline 掉了、全绿场景变少、errored 变多),就不能默默合。去 `DECISIONS.md` 新开一条,写清:改了什么、哪项掉了、为什么这个取舍值得(§15.3)。软判掉分怎么读,见 §2。

---

## 2. 软判 vs 硬判:怎么读,别被单跑忽悠(D-0009)

评测出两类数,**分量完全不同**:

| | 硬判 | 软判 |
| --- | --- | --- |
| 指标 | 结构断言(结构通过率、全绿场景、errored) | `gistRecall`(要点召回)、`overInferRate`(过度推断率) |
| 谁判的 | 程序判(和模型无关) | LLM-as-judge(温度 0、3 次取多数) |
| 可信度 | 高、稳定 | **单跑高方差** |
| 怎么用 | **结论以它为准** | 只看趋势,要多跑取势 |

**为什么软判不能拿单跑下结论**:D-0009 实测,`emotion-cap` 的 `gistRecall` 曾单跑掉到 **0.14**,同一版提示词**复跑回 0.57**——而同期结构硬指标全程稳在 32–34/35。judge 已用「温度 0 + 3 次多数」压抖,但仍非逐位可复现。

**判读纪律**:提示词回归**以结构硬指标为准**;软判只作趋势参考,**须多跑取势**,不据单跑软分下「回退」结论。对比报告里每一行软判都带了 `(软判·单跑高方差…D-0009)` 的提醒。完整背景见 `DECISIONS.md` D-0009。

---

## 3. 只想快速迭代一类纪律(不烧 77 分钟)

调 chitchat 相关提示词时,只跑那一类的 7 个场景:

```
node bench/eval-consolidation.mjs --discipline chitchat-negative
```

**你会看到**:只跑 7 个场景(约十几分钟),报告**顶部一条醒目的 PARTIAL 警示**:

```
> ⚠ PARTIAL RUN:只跑了 7/42 场景(filter=discipline=chitchat-negative)。
> 这不是基线,不可与全量基线直接比较。
```

- **产物落 `bench/runs/`**(形如 `2026-07-10-<sha>-consolidation-chitchat-negative.{md,json}`),已被 `.gitignore` 忽略,**绝不碰 `bench/consolidation-baseline.*`**。
- **不可**拿这份 PARTIAL 和全量基线直接比——样本不同,`--compare` 会在可比性警示里直接喊「不可直接比」。
- 起跑快扫时也可 `--limit N` 只跑前 N 个场景。

可选的 discipline(各 7 场景,共 42):`conflict` · `correct` · `emotion-cap` · `fact-vs-belief` · `no-over-inference` · `chitchat-negative`。

---

## 4. live 双轨:CI 主干管确定性,nightly + 本地管真实(§15.4)

分工:

- **CI 主干(`.github/workflows/ci.yml`)= 确定性**。**不注入任何 LLM secrets**;两个 live e2e(`tests/conflict.e2e.ts`、`tests/eval/cognition-discipline.eval.e2e.ts`)靠 `HAS_LLM`(检测 `MEMOWEFT_LLM_BASE_URL` 是否存在)**自动跳过**。CI 从不跑真实模型。
- **nightly + 本地 = 真实模型**,一条命令:

```
npm run test:live
```

### test:live 的三条腿

| 腿 | 跑什么 | 判失败的门 |
| --- | --- | --- |
| 腿1 · live e2e | `node --test tests/**/*.e2e.ts` | 进程非零退出 |
| 腿2 · 固化真实臂(全量 42) | `eval-consolidation --out bench/runs/…-consolidation-live` | `agg.errored > 0`(**崩溃门,不设质量分数阈** — §15.2 / D-0009) |
| 腿3 · 检索真实臂 | `EVAL_REAL_ARM=1 eval-retrieval --ablation --require-real-arm --out …` | 真实臂 pending / 调用失败 → 失败 |

开跑前先打印**计划表**(哪条跑 / 跳过 / 为什么),跑完打印**逐腿汇总**(跑了 / 跳过(原因) / 通过 / 失败)。腿2 用 `--out` 落 `bench/runs/`,**故意不碰** `bench/consolidation-baseline.*`(基线只有 §1.6 的全量跑才更新)。

### 缺 key 会 exit 1,不静默跳过

没配 LLM 三件套时,`test:live` **在跑任何腿之前**就 exit 1:

```
════════════════ test:live 前置检查失败 ════════════════
缺少必需的 LLM 配置:LLM_BASE_URL, LLM_API_KEY, LLM_MODEL
请在根 .env 或环境变量设置(双前缀:MEMOWEFT_ 优先,回退旧名 DLA_):
  MEMOWEFT_LLM_BASE_URL   (或 DLA_LLM_BASE_URL)
  …
```

这是**有意**的:`test:live` 不接受「缺 key 就静默跳过然后退 0」。脱敏只印 `base_url` 和 `model`,绝不打印 api key。

### embed 没配 → 腿3 大声跳过

腿3 只在 `MEMOWEFT_EMBED_*`(含 `DLA_` 回退)配齐时才跑。没配就在汇总里**大声跳过、不计入失败**(本地 Ollama 端点在 GitHub Actions 不可达,这是常态):

```
[跳过] 腿3 · 检索真实臂 — 未配置 MEMOWEFT_EMBED_*…大声跳过,不计入失败
```

「大声跳过」≠「静默变绿」:它照样进汇总、留痕。

---

## 5. nightly 上线前,人类要做的一次性动作

nightly(`.github/workflows/nightly.yml`)每天 UTC 18:00 自动跑 `npm run test:live`,真实 key 从 GitHub secrets 注入。**第一次上线前**,去仓库 **Settings → Secrets and variables → Actions** 添加:

| Secret 名 | 必需? |
| --- | --- |
| `MEMOWEFT_LLM_BASE_URL` | ✅ 必需 |
| `MEMOWEFT_LLM_API_KEY` | ✅ 必需 |
| `MEMOWEFT_LLM_MODEL` | ✅ 必需 |
| `MEMOWEFT_EMBED_BASE_URL` / `_API_KEY` / `_MODEL` | ⭕ 可选(不配 → 腿3 跳过) |

**没加这三个必需 secret 之前,nightly 会红**——这是**有意设计**:红着提醒「真实线还没接通」,好过绿着其实什么真实模型都没跑(旧的 `--if-present` 空跑就是那个坑,已拆)。产物无论成败都由 `upload-artifact` 传到 run 的 Artifacts(`bench/runs/`),失败也能下载来看。

---

## 6. 已知缺口 / 备注

- **baseline JSON 尚未入库**:当前仓库只提交了 `bench/consolidation-baseline.md`,**没有** `bench/consolidation-baseline.json`(它未被 `.gitignore` 忽略,只是从没 commit 过)。因此 §1.7 的 `git show HEAD:bench/consolidation-baseline.json` 现在取不到。**修法**:在当前 HEAD 上跑一次 §1.6 的全量评测,把生成的 `.md` **和** `.json` 一起提交,之后前后对比就一路通了。这一步归 Integrator。
- **`SKIP_LIVE_LLM` 已删**(D-0011):它曾在 `ci.yml` 里设着,但**全仓无任何代码读它**。真正的 live 门是 e2e 里的 `HAS_LLM`。别再照着旧文档去找它。`PROJECT_PLAN.md §20` 的环境变量表仍陈旧(列 `ANTHROPIC_API_KEY` 等旧抽象),订正已进 ROADMAP。
- **`eval-retrieval.mjs` 的报告「生成命令」行**:在 `--out` 模式下仍印硬编码的 `node bench/eval-retrieval.mjs`(略不精确,不影响数字)。属报告逻辑,留待后续。
