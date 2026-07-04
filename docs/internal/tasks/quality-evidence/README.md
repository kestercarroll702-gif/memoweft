# 质量证据批次 · 任务书总览

> 依据：后续批次总纲第 3 步「质量证据（Quality Evidence）」+ 三路只读清点（2026-07-05）。作者已就 7 项拍板（见下「作者已拍板」）。
> 执行者：任何 AI 会话。开工前必读 `AGENTS.md`，然后只读本目录里自己领的那份任务书和它点名的源码文件。

## 批次目标

回答评估者两问：「凭什么信」和「能撑多少」，把答案落进文档与测试。这批**有代码也有文档**，但**不改核心运行时逻辑、不动认知纪律本身**——只给认知纪律加断言证据、给项目加信任门面与实测数字。

## 作者已拍板（照此执行，别重新权衡）

1. **eval 覆盖度**：约 20 个用例，三条纪律（冲突暴露不合并 / 情绪封顶 / 记≠信）各约 6–7 个；覆盖典型桥段——前后矛盾非纠正、情绪反复、LLM 瞎报高把握、亲口说 vs 推测。
2. **ESLint 严格度**：用**松档**（`eslint` recommended + `@typescript-eslint` recommended）先把关卡立起来；lint 扫出的 `src/` 存量问题一律记「发现待办」，**不在本批修**。
3. **覆盖率**：**只报数字、不设 CI 硬门**。徽章用 shields.io 静态徽章，数字取 coverage 报告末尾 **"all files" 行的 line%**（口径写死，别各写各的）。
4. **perf**：**只报真实数字、不设门**，注明测试环境（Node 版本 / 机器）。
5. **维护声明**：诚实写「单人 + AI 维护、best-effort 响应、无 SLA、安全问题优先」，守 `docs/naming.md`（不吹比较级、只承诺控得住的）。
6. **Q5 provenance 发布：做**（正式任务书，不是可选壳）。**前置条件**：作者需先往 GitHub secrets 托管 npm automation token——这步归作者手动，任务书里标明是执行前提。
7. **lint 与覆盖率只在 Node24 主 job（guardrails）跑一次**，不进 node22 / node20 触达 job。

## 任务清单与顺序

| 序 | 任务书 | 一句话 | 大小 | 依赖 |
|---|---|---|---|---|
| Q1 | [Q1-lint-coverage-gate.md](./Q1-lint-coverage-gate.md) | lint 三件套（松档）+ 原生覆盖率接进 CI guardrails job | 中 | 无 |
| Q2 | [Q2-eval-suite.md](./Q2-eval-suite.md) | ~20 个 eval 用例断言认知纪律三条（各约 6–7 个） | 中 | 无 |
| Q3 | [Q3-trust-docs.md](./Q3-trust-docs.md) | SECURITY + 模板 + 维护声明 + 对比表回链 eval 编号 | 中 | 软依赖 Q2 |
| Q4 | [Q4-perf-benchmark.md](./Q4-perf-benchmark.md) | 灌 1 万条出真实 perf 数字（从 dist import） | 小 | 无 |
| Q5 | [Q5-publish-provenance.md](./Q5-publish-provenance.md) | CI 加 on-tag publish job + provenance（前提：作者托管 npm token） | 小 | 作者先托管 token |

Q1 / Q2 / Q4 可并行（互不碰同一文件）；Q3 排 Q2 之后（回链要 eval 编号）；Q5 待作者托管 token 后开工。

**CI 冲突提醒**：Q1 与 Q5 都动 `.github/workflows/ci.yml`，但改的是不同区块——Q1 往 guardrails job 加 step，Q5 新增独立 publish job。若并行，**Q1 先合**。

## 全局规矩（每份任务书都默认包含，照 0.3.0）

1. **三绿**：`npm run typecheck && npm test && npm run build` 全过才算完成（`AGENTS.md` 铁律）。
2. **不扩范围**：只做任务书写明的事。顺手发现的问题记进任务书末尾「发现待办」，别顺手修。
3. **防偏移三问**：这对应商用五关哪一关？给库加固还是给宿主加戏？动没动灵魂（认知纪律 / 隐私三红线 / 零运行时依赖）？——本批任何任务都**不许动核心运行时逻辑、不动认知纪律判定算法**（只加断言证据）；**lint / coverage / bench 工具一律进 `devDependencies`，runtime `dependencies` 保持 `{}`**。
4. **提交口径**：一个任务一个提交，说明写短，CHANGELOG 有行为变化才记。
5. **兼容红线**：`DLA_*` 环境变量回退与 `'./dla.db'` 默认路径按 `CONTRIBUTING.md` 保留，本批不许动。

## 批次完成的验收（全批合完后跑一遍）

- [ ] `npm run lint` 绿，且 `ci.yml` guardrails job 有 Lint step；`npm run test:coverage` 打印覆盖率数字。
- [ ] eval 用例 ≥20 且系统断言认知纪律三条（冲突暴露不合并 / 情绪封顶 / 记≠信），各约 6–7 个。
- [ ] README「vs plain memory store」四行对比表每行有 eval 编号回链背书。
- [ ] `.github/` 下有 `SECURITY.md`、`ISSUE_TEMPLATE/`、`PULL_REQUEST_TEMPLATE.md`；README 有对外维护声明。
- [ ] perf 脚本跑出 updateProfile 耗时 + recall 延迟真实数字，注明环境，入 README/docs。
- [ ] （作者已托管 token）打 tag 触发 publish job，npm 包页显示 provenance；未托管则 Q5 不合。
- [ ] runtime dependencies 仍为空（`package.json` 的 `dependencies` 字段为 `{}` 未变）。

## 本批明确不做

- 不改 `src/consolidation/` 下任何置信度算法 / 认知纪律判定逻辑（`confidence.ts`、`consolidate.ts`、`model.ts`）。
- 不加任何 runtime 依赖。
- ESLint 不上严格档（strict-type-checked）；lint 扫出的 `src/` 存量问题只记待办、不在本批修。
- 覆盖率、perf 都不设 CI 门（只报数字）。
