# Q3 · 信任文档：SECURITY + 模板 + 维护声明 + 对比表背书

## 背景

评估者问「谁维护、怎么报安全问题、响应能指望多少」。现状：`.github/` 下只有 `workflows/ci.yml`，无 `SECURITY.md`、无 `ISSUE_TEMPLATE/`、无 PR 模板（`docs/internal/MAINTENANCE.md` 里两处写「（若已建）」，实际未建）。对外维护声明也没有（README 里 grep 不到单人 / 响应 / best-effort）。内部 `docs/internal/MAINTENANCE.md` 是完整的 AI 维护策略，口径现成可提炼。README「vs plain memory store」对比表已成型（在「Why it's not just another vector memory store」段内的四行表），本卡只给它加 eval 背书回链。

**作者已拍板**：维护声明诚实写「**单人 + AI 维护、best-effort 响应、无 SLA、安全问题优先**」，守 `docs/naming.md`（不吹比较级、只承诺控得住的）。

## 改哪里

1. **新建 `.github/SECURITY.md`**（GitHub 识别此路径）：报告渠道 / 响应预期 / 支持版本。措辞按「单人 + AI 维护」诚实写：**安全问题优先响应、其余 best-effort、不承诺企业级 SLA**。
2. **新建 `.github/ISSUE_TEMPLATE/`**（`bug_report.md` + `feature_request.md`）：结构照 `docs/internal/MAINTENANCE.md` 里「issue 分诊」那节的「背景 + 验收 + 涉及文件」，降 AI 冷启动成本。
3. **新建 `.github/PULL_REQUEST_TEMPLATE.md`**：结构照 `docs/internal/MAINTENANCE.md` 里 PR 那节的「改了什么 / 为什么 / 怎么验的（贴三绿 pass N fail 0）」。
4. **对外维护声明**：加进 `README.md`（中英各一段，位置建议在 Zero runtime dependencies 特性块之后或状态徽章区附近），口径从 `docs/internal/MAINTENANCE.md` 提炼——**单人 + AI 维护、best-effort 响应、无 SLA、安全问题优先**，措辞守 `docs/naming.md`（不吹比较级、只承诺控得住的）。可与 T7 开源承诺段相邻放，形成一致信任叙事。`README.zh-CN.md` 同步。
5. **README 对比表背书**（「Why it's not just another vector memory store」段内的四行对比表 + zh-CN 平行段）：表下加一行「每条结论都有 eval 用例编号支撑」，四行分别回链 Q2 的 eval 编号（冲突暴露 → EVAL-C##、情绪封顶 → EVAL-M##、记≠信 → EVAL-T##，Model guesses / Expiry 各回链对应编号）。**此步依赖 Q2 编号已定**——Q2 未合完前先做本卡前四块，回链行等 Q2 合完再补一个小提交。
   - 注意：对比表上方的认知纪律 bullet 比表格数据行多一条（No self-corroboration / 无自我印证）。表只有 4 行数据、回链 4 组编号即可；若 Q2 也给「无自我印证」编了 eval，是否在 bullet 处一并回链由作者定，别默认漏成 4 条叙事、也别硬塞。
6. **回填 `docs/internal/MAINTENANCE.md`** 里两处「（若已建）」措辞为「已建」（对应新建的 ISSUE_TEMPLATE 与 PULL_REQUEST_TEMPLATE）。

## 不许动

- 不改 `src/` 任何代码（纯文档卡）。
- 不改对比表的结论文字本身（只加背书行 + 回链），认知纪律叙事已定稿。
- 措辞不吹「真正理解你」、不用比较级（守 `docs/naming.md`）。
- 维护声明诚实但别吓跑人：按拍板口径「单人 + AI / best-effort / 无 SLA / 安全优先」写，别自行加码或缩水承诺力度。

## 验收（可执行核对）

- [ ] `test -f .github/SECURITY.md` 存在，含报告渠道 + 响应预期 + 「无 SLA」+「安全问题优先」措辞。
- [ ] `ls .github/ISSUE_TEMPLATE/` 有 ≥1 个模板；`test -f .github/PULL_REQUEST_TEMPLATE.md` 存在。
- [ ] `grep -iE "maintain|best-effort|单人|无 SLA|响应" README.md` 命中维护声明段；`README.zh-CN.md` 同步。
- [ ] 对比表四行每行有 eval 编号回链（`grep "EVAL-" README.md` 命中 ≥4）。
- [ ] `grep "若已建" docs/internal/MAINTENANCE.md` 无命中（已回填为已建）。
- [ ] 三绿：`npm run typecheck && npm test && npm run build` 全过（纯文档也跑一遍确认没碰坏）。

## 发现待办

（略）
