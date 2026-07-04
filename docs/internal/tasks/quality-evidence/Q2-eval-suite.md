# Q2 · eval 套件：约 20 个对话用例断言认知纪律三条

## 背景

评估者问「凭什么信你的认知纪律真生效」。现状：三条纪律各有单点断言（`tests/cognition.test.ts` 断言了情绪封顶 + 冲突、不采信 LLM 自报 `confidence=999`；`tests/attribution.test.ts` 断言 hypothesisCap），但没有成套的「对话输入 → 断言纪律输出」证据。本卡把它们系统化成约 20 个 eval 用例，给每个编号，供 Q3 对比表回链背书。总纲 0.3.0 批次把 eval 套件归后续批次——本卡正是兑现它。

**认知纪律三条 + 源码锚点（断言指向这里）**：
- **情绪封顶**：`src/consolidation/confidence.ts` 的 `isTransient` → `transientCap`（临时类 state 封顶、不进稳定）；`deriveCredStatus` 对临时类最多给 'low'。
- **记≠信 / 低置信候选**：`consolidate` 不采信 LLM 自报置信（`tests/cognition.test.ts` 已断言产出 confidence 不等于 LLM 瞎报的 999）；`formedBy` 区分 stated / inferred，推测类起点更低。
- **冲突暴露不合并**：`deriveCredStatus` 在 contradictCount>0 时给 'conflicted'；`tests/conflict.e2e.ts` 已有真模型场景。

**作者已拍板**：约 20 个用例，三条纪律**各约 6–7 个**；覆盖典型桥段——前后矛盾非纠正、情绪反复、LLM 瞎报高把握、亲口说 vs 推测。

## 改哪里

**两层落法**：

1. **纯函数断言层 → 新建 `tests/eval/*.test.ts`**（被 `npm test` 的 glob `tests/**/*.test.ts` 自动收，进护栏、离线可回归）。装配抄 `tests/cognition.test.ts` 的 `computeConfidence` / `deriveCredStatus` 直调 + `tests/core.test.ts` 的 `stubLLM(replyText)` + `createMemoWeftCore({ dbPath: ':memory:', llm: stubLLM(), retriever: nullRetriever })`。喂脚本化对话、断认知产出。每个用例带编号注释（如 `// EVAL-C01 冲突暴露`）。
2. **端到端观察层 → 新建 `tests/eval/*.eval.e2e.ts`**（走 `test:e2e` 的 `*.e2e.ts` glob，复用 `tests/conflict.e2e.ts` 的 `HAS_LLM` skip 模式：真模型才跑、离线 CI 整组 skip，不进护栏计数）。照 `conflict.e2e.ts` 的「刻意宽松」注释体例，当观察窗、不当硬门。

**用例分配（约 20 个，三条纪律各约 6–7 个）**，覆盖以下桥段：

- **冲突暴露不合并（约 6–7 个，编号 EVAL-C##）**：前后矛盾**非纠正**（先说 A、后说非 A，且不是「我刚才说错了」式更正）→ 两条都留、标 conflicted，不悄悄合成一条、不新的覆盖旧的。含至少一个「显式纠正」对照组（说了「更正一下」→ 允许收敛，验证系统能区分纠正与矛盾）。
- **情绪封顶（约 6–7 个，编号 EVAL-M##）**：情绪反复（今天说讨厌 X、明天说爱 X）→ 临时类 state 的 credStatus 命中 'low' / 'candidate'，且**不随支持次数增加而升为 stable**；情绪即使被反复提到也顶在临时档。
- **记≠信（约 6–7 个，编号 EVAL-T##）**：LLM 瞎报高把握（stub 回复里塞 `confidence: 999` 或「我非常确定」）→ 系统产出的置信度不采信 LLM 自报值；亲口说 vs 推测（`formedBy: stated` 的结论起点高于 `formedBy: inferred` 的推测）→ 推测类落在低置信候选、不冒充亲述事实。

## 不许动

- 不改 `src/consolidation/` 任何算法。eval 只从对话层断言现有行为，**不动 confidence 计算、不动 `deriveCredStatus` 阈值**。若断言跑红说明发现真 bug，记「发现待办」停下问，别改算法迁就测试。
- 不污染默认 `npm test` 计数护栏：真模型端到端用例一律走 `.eval.e2e.ts` 后缀（`HAS_LLM` skip），不进 `tests/**/*.test.ts` glob。
- 不引入新 runtime / devDep（`stubLLM`、`node:test` 都是现成的）。

## 验收（可执行核对）

- [ ] eval 用例总数 ≥20：`grep -rc "EVAL-" tests/eval/` 累加 ≥20。
- [ ] 三条纪律各约 6–7 个：`grep -rc "EVAL-C" tests/eval/`、`grep -rc "EVAL-M" tests/eval/`、`grep -rc "EVAL-T" tests/eval/` 三者各在 6–7 区间。
- [ ] **断言语义而非魔数**：情绪封顶用例断言的是「临时/情绪类结论的 `credStatus` 命中 `'low'` / `'candidate'`，且不随支持数升为 `'stable'`」——**不要把 `transientCap` 的当前配置值（如 300）当验收锚点**（它是 config 可调的，写死数字日后调配置会假性触发「未完成」）。核对：`grep -rl "credStatus\|candidate\|stable" tests/eval/` 命中情绪封顶文件；`grep -r "300" tests/eval/` **不应**作为纪律断言的锚点出现。
- [ ] 记≠信有断言：`grep -rl "999\|inferred\|stated" tests/eval/` 命中。
- [ ] 冲突有断言：`grep -rl "conflicted" tests/eval/` 命中。
- [ ] 纯函数层进护栏：`npm test` 收到 `tests/eval/*.test.ts` 且全绿。
- [ ] 端到端层不阻塞离线 CI：无 `HAS_LLM` 时 `npm run test:e2e` 整组 skip 不红。
- [ ] 每个用例有唯一编号（供 Q3 回链）。
- [ ] 三绿：`npm run typecheck && npm test && npm run build` 全过。

## 发现待办

（eval 若逼出真 bug 记这里，停下问作者，不在本卡改算法。）
