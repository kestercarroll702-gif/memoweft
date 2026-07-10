# CURRENT — 当前状态(Integrator 每个工作段落结束更新)

更新于:2026-07-10 | 所在 Phase:0 奠基(tag: `phase-0-start` @ `5a66dcb`)

> 总纲见 `PROJECT_PLAN.md`(Phase 0.5 落地);本文件是 Integrator 的工作状态,每个工作段落结束更新。

## 正在进行

- **0.5 治理文件落地**(PROJECT_PLAN 入仓、AGENTS 升级、CLAUDE 入口、ROADMAP 重置、DECISIONS 新建)。0.1–0.4 已完成(见下)。

## 刚完成(最近 5 条,附证据)

- **0.4 `.claude/` 多智能体包**(附录 I):6 子代理(`.claude/agents/*.md`)+ `settings.json` + `hooks/protect.py`。**stdin 实测 16 场景全过**。两条关键拦截原文:
  - eval Edit → `BLOCKED by protect.py: 铁律1:tests/eval/ 既有测试禁止修改。测试不过=实现有错;新增用例请创建新文件。`
  - npm publish → `BLOCKED by protect.py: 铁律8/9:发布、强推与破坏性命令必须由人类亲自执行。`
  - **两处对文档的合理偏离(D-0004)**:① force-push 原正则漏拦 `git push origin main --force`,已加固为"含 git push + force 标志即拦"(3 变体已验);② stderr 强制 UTF-8(否则 Windows 下拦截理由乱码);③ hook 命令用 `python`(非 `python3`,避 WindowsApps Store 别名)。
  - **hooks 本会话未热加载**(探针 `twine upload` 未被拦):本 harness 下 hooks 需**重启会话**才激活(与文档 I.5.2 一致)。stdin 16 场景为本会话验收证据。
- **0.3 API 冻结机制**(§13):`scripts/api-snapshot.mjs`(TS 编译器 API,零新依赖,过滤 private)+ `tests/api/api-freeze.test.ts` + 首版快照 184 行 + `npm run api:update`/`api:check`。变更流程演练通过(加导出→exit1→回滚→exit0)。全量 **223/223 绿**。
- **0.2 校准侦察**(报告 `docs/internal/phase0-calibration.md`):置信度/衰减精确数值(铁律 3b/3d 成立);**检索真瓶颈在读侧全表余弦扫描**(嵌入侧已增量)→ 改写 Phase 1 打法;适配器只依赖 6 门面方法;5 处文档不符已列。
- **0.1 基线**:222/222 绿(node v24.15.0);FTS5 中文需 ≥3 字符;mimo 连通 OK。
- **工作区清理**:`e10dfc1` 版本同步 0.5.1;`5a66dcb` gitignore 杂物。

## 阻塞(等人类或等依赖)

- 无。

## 下一步(按序)

1. **0.5 治理文件**:`PROJECT_PLAN.md` 入仓;AGENTS.md 升级为 Integrator 章程(diff 给人类过目);新建 CLAUDE.md 入口;ROADMAP.md 重置(第 3 章非目标 → Later);新建 DECISIONS.md(D-0001…D-0005)。
2. **0.6 CI 补强**:核实 `.github/workflows` 现状 → 追加 api-freeze/lint/typecheck、`SKIP_LIVE_LLM`、真 key 用例统一跳过、nightly 骨架。
3. Phase 0 收尾:逐条核对 §12 验收 → 打 `phase-0-done` → 请人类验收。

## 待记决策(0.5 落地 DECISIONS.md)

- D-0001 FTS5 tokenizer:trigram 可用,中文 ≥3 字符阈值;短中文靠向量兜底。
- D-0002 协作模式=务实混合(Agent/Workflow 委派 + .claude 落地供以后会话)。
- D-0003 Phase 4 demo=改造现有 testbench(非新建)。
- D-0004 hook 落地适配:python 解释器 + force-push 正则加固 + stderr UTF-8;hooks 需重启激活。
- D-0005 检索现状修正(向量=JSON 文本、在迁移体系外、嵌入已增量、真瓶颈在读侧全表余弦);mimo 为推理模型。

## 本轮范围冻结(铁律 4)

host、采集插件、perception、asking、attribution、background、graph、portable、memory 管理 API —— 只在某 Phase 明确需要时才碰,否则进 ROADMAP Later。
