# Q5 · CI 加 on-tag publish job + npm provenance

## 背景

发布走 CI + provenance 能给 npm 包供应链背书：npm 包页会显示「已验证来源」，证明这个 tarball 确实是从本仓库这次 CI 构建出来的，不是谁本地手动 publish 的。现状 `.github/workflows/ci.yml` 只有测试护栏（`on: push [main]` + `pull_request`），**无 publish job、无 provenance / id-token 配置**。

**作者已拍板：本项做**（正式任务书，不是可选壳）。

### 执行前提（作者手动，先做）

**作者需先往 GitHub repo 的 secrets 托管一个 npm automation token**（Publish 权限的 automation token，存为如 `NPM_TOKEN`）。这是供应链决策、归作者手动一步，**不在本任务书代做**。token 未托管前，publish job 加了也会在 publish step 失败——所以开工顺序是：**作者托管 token → 本卡改 ci.yml**。

## 改哪里

1. **`.github/workflows/ci.yml` 新增独立 `publish` job**（与 guardrails / 两个触达 job 平级，不动它们）：
   - **触发限定 on tag**：只在打版本 tag（如 `v*`）时跑。可用 job 级 `if: startsWith(github.ref, 'refs/tags/')`；若要 push tag 触发，`on:` 需相应加 `push: tags: ['v*']`（与现有 `branches: [main]` 并存，别覆盖掉 PR / main 触发）。
   - **加 `permissions: id-token: write`**（OIDC，`--provenance` 必需）+ 读内容所需 `contents: read`。这是 provenance 的关键：GitHub 用 OIDC 身份签发来源证明，不靠长期密钥。
   - Setup Node（用 registry `https://registry.npmjs.org`）、`npm ci`。
   - **发布用 `npm publish --provenance`**，`NODE_AUTH_TOKEN` 取自作者托管的 secret（如 `${{ secrets.NPM_TOKEN }}`）。
2. **复用现有 `prepublishOnly` 保险丝**：`package.json` 的 `prepublishOnly` 字段已是 `npm run typecheck && npm test && npm run build`——`npm publish` 会自动先跑它，等于发布前再过一遍三绿 + build。**不要绕过它、不要加 `--ignore-scripts`**。

## 不许动

- 不改 guardrails / better-sqlite3-node22 / better-sqlite3-node20 三个已有 job（publish 是新增独立 job）。
- 不改 `prepublishOnly` 字段内容（它就是发布保险丝，复用即可）。
- 不动 `dependencies`（保持 `{}`）。
- token 由作者托管，任务书 / 代码里**不写死任何 token 值**，只引用 secret 名。

## 验收（可执行核对）

- [ ] 作者已在 repo secrets 托管 npm automation token（前提，非本卡产物；未托管则本卡不合）。
- [ ] `grep -c "id-token" .github/workflows/ci.yml` ≥ 1（OIDC 权限已配）。
- [ ] `grep -c "provenance" .github/workflows/ci.yml` ≥ 1（`npm publish --provenance` 已用）。
- [ ] `grep -E "refs/tags|tags:" .github/workflows/ci.yml` 命中（publish 限定 on tag，不在每次 push / PR 跑）。
- [ ] 现有三个 job（guardrails / node22 / node20）名称与 step 未被改动。
- [ ] 打一个测试 tag 触发后，publish job 先跑 `prepublishOnly` 三绿再 publish；npm 包页显示 provenance / 「Built and signed on GitHub Actions」。
- [ ] 三绿：`npm run typecheck && npm test && npm run build` 全过（本卡只加 CI job，本地三绿不受影响）。

## 发现待办

（略）
