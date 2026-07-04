# Q1 · lint 三件套（松档）+ 原生覆盖率接进 CI

## 背景

评估者看一个库信不信得过，先看有没有 lint 关卡和覆盖率。现状（清点）：无任何 ESLint / Prettier / EditorConfig 配置，无覆盖率跑法，CI 三绿护栏成熟但没有 lint step、没有 coverage step。本机 node v24.15.0 原生支持 `--experimental-test-coverage`，可零依赖出覆盖率。lint 工具进 `devDependencies` 不破零运行时依赖戒律（`package.json` 的 `_comment` 字段已界定 devDeps 允许）。

**作者已拍板**：ESLint 用**松档**（`eslint` recommended + `@typescript-eslint` recommended）先把关卡立起来；lint 扫出的 `src/` 存量问题一律记「发现待办」，**不在本批修**。覆盖率**只报数字、不设 CI 硬门**，徽章数字取报告末尾 "all files" 行的 line%。lint / coverage **只在 Node24 主 job（guardrails）跑一次**，node22 / node20 触达 job 不重复。

## 改哪里

1. **新建 `eslint.config.js`**（flat config）：
   - extends `eslint` 的 `recommended` + `@typescript-eslint` 的 `recommended`（松档，别上 `strict-type-checked` / `recommended-type-checked`，避免逼出大量 src 存量修改）。
   - `ignores` 把 `dist/`、`node_modules/`、`testbench/`、`apps/`、`plugins/` 等非 core 目录排掉，先只关 `src/` 与 `tests/`。
2. **新建 `.prettierrc`**（或 `prettier.config.js`）+ **新建 `.editorconfig`**（静态文件，无依赖）。
3. **`package.json`**：
   - `devDependencies` 加 `eslint`、`typescript-eslint`（或 `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`）、`prettier`——**只进 `devDependencies`，不碰 `dependencies`（保持 `{}`）**。
   - `scripts` 加：
     - `"lint": "eslint ."`
     - `"format": "prettier --check ."`
     - `"test:coverage": "node --test --experimental-test-coverage \"tests/**/*.test.ts\""`
4. **`.github/workflows/ci.yml` 的 guardrails job**（改这一个 job，别碰另外两个触达 job）：
   - 在现有 **Core Typecheck** step 之前，插一个 **Lint** step（`run: npm run lint`）。lint 只放这里跑一次。
   - **把现有 Core Test step 整体替换成带覆盖率的版本**（`run: npm run test:coverage`）——**是替换，不是追加**。追加会让 `tests/**/*.test.ts` 被跑两遍（普通一遍 + coverage 一遍），平白翻倍 CI 时长。替换后覆盖的仍是 Node24 默认的内置 `node:sqlite` 零依赖路径（它排在 Remove optional better-sqlite3 step 之后，语义不变）。
   - **不动 Host Typecheck / Host Test / Collector Plugin Typecheck / Collector Plugin Test 这几步，不重排 job 内 step 顺序**——只在 Core Typecheck 前插 Lint、把 Core Test 换成 coverage 版。
5. **README 徽章区**（`README.md` 顶部徽章段 + `README.zh-CN.md` 平行段）：加覆盖率徽章。
   - 用 shields.io **静态**徽章手填真实数字（无动态源不挂假动态徽章，守 `docs/internal/MAINTENANCE.md` 的徽章诚实口径）。
   - **数字取法写死**：跑 `npm run test:coverage`，取报告末尾 **"all files" 汇总行的 line%**，把这个百分比手填进静态徽章。不要自己按文件加权另算、不要用 branch% 或 funcs%。
   - 两个 README 同步改。

## 不许动

- 不动 `src/` 下任何运行时代码。lint 若报出 src 里的问题，记进「发现待办」，别顺手改逻辑。可改纯格式，但认知纪律相关文件（`src/consolidation/confidence.ts`、`consolidate.ts`、`src/cognition/model.ts`）连格式也先不碰，避免 diff 噪音掩盖。
- 不动 `dependencies`（保持 `{}`）。lint / prettier 只进 `devDependencies`。
- 不动 node22 / node20 触达 job（lint / coverage 只在 Node24 guardrails job 跑）。
- 不动 guardrails job 里 Host / Collector 的 typecheck / test step，不重排 step 顺序。

## 验收（可执行核对）

- [ ] `npm run lint` 退出码 0（绿）。
- [ ] `npm run format` 退出码 0。
- [ ] `npm run test:coverage` 跑完打印按文件的覆盖率表格，含末尾 "all files" 汇总行。
- [ ] `grep -c "npm run lint" .github/workflows/ci.yml` ≥ 1（Lint step 已进 guardrails job）。
- [ ] `grep -c "test:coverage" .github/workflows/ci.yml` = 1（Core Test 已替换为 coverage 版，不是新增第二个测试步）。
- [ ] `grep -c "experimental-test-coverage" package.json` = 1。
- [ ] `grep -c "npm test" .github/workflows/ci.yml` 未因本改动增多——确认没有额外多出一遍普通 Core Test。
- [ ] `grep -i "coverage" README.md` 命中覆盖率徽章；`README.zh-CN.md` 同步。徽章数字等于报告 "all files" 行的 line%。
- [ ] `node -e "console.log(JSON.stringify(require('./package.json').dependencies))"` 输出 `{}`（runtime 依赖仍空）。
- [ ] 三绿：`npm run typecheck && npm test && npm run build` 全过。

## 发现待办

（lint 扫出的 `src/` 存量问题记这里，不在本卡修——按松档 recommended 跑出来的告警，逐条列出文件与规则，另开卡处理。）
