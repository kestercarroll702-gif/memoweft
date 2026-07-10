# CURRENT — 当前状态(Integrator 每个工作段落结束更新)

更新于:2026-07-10 | 所在 Phase:0 奠基**已收尾**(tag: `phase-0-start` @ `5a66dcb` → `phase-0-done`)

> 总纲见 `PROJECT_PLAN.md`;关键决策 `DECISIONS.md`;校准事实 `docs/internal/phase0-calibration.md`。

## 正在进行

- **Phase 0 收尾,待人类验收**;Phase 1(召回更准)计划待确认后开工(铁律 5)。

## 刚完成(Phase 0 六步,附证据)

- **0.6 CI 补强**(`7cddc03`):ci.yml 加 `API Freeze Check` 步 + workflow 级 `SKIP_LIVE_LLM=1`;新建 `nightly.yml` 骨架(schedule+dispatch,`test:live --if-present` 空跑至 Phase 2);补 `scripts/api-snapshot.d.mts` 修 typecheck。**三绿:typecheck ✓ / test 223/223 ✓ / build ✓;lint exit0(6 个既有 warning,非本轮)**。
- **0.5 治理文件**(`a1eb500`):`PROJECT_PLAN.md` 入仓;AGENTS.md 升级为 Integrator 章程(diff 已展示待人类过目);新建 CLAUDE.md;ROADMAP.md 重置;DECISIONS.md(D-0001…0005)。
- **0.4 `.claude/` 包**(`2ea9b94`):6 子代理 + settings.json + protect.py;**stdin 16 场景全过**;两条拦截原文入库;force-push 加固 + UTF-8(D-0004);hooks 需重启激活。
- **0.3 API 冻结**(`d8cbafa`):api-snapshot.mjs + api-freeze 测试 + 快照 184 行 + api:update/check;变更流程演练通过。
- **0.2 校准**(`71f03db`):`docs/internal/phase0-calibration.md`;检索真瓶颈在读侧(改写 Phase 1 打法);5 处文档不符已列。
- **0.1 基线**:222/222 绿;FTS5 中文 ≥3 字(D-0001);mimo 连通 OK。
- 工作区清理:`e10dfc1` / `5a66dcb`。

## 阻塞(等人类或等依赖)

- 无。等人类:① Phase 0 验收 ② Phase 1 计划确认(GO)③ AGENTS.md 过目。

## 下一步(按序)

1. **人类验收 Phase 0**(§12 核对表已附)。
2. **确认 Phase 1 计划**后开工:先测量后优化——HashEmbedder 确定性臂 + 黄金检索集 + 基线报告,再上 BM25/FTS + RRF hybrid。重心按 D-0005 放**检索读侧**。
3. Phase 1 期间:mimo key 需 live 时放进 gitignored `.env`;若要 hooks 机器强制生效则重启会话。

## 本轮范围冻结(铁律 4)

host、采集插件、perception、asking、attribution、background、graph、portable、memory 管理 API —— 只在某 Phase 明确需要时才碰,否则进 ROADMAP Later。
