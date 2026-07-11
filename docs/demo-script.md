# MemoWeft 四幕 demo · 录屏脚本（Phase 4 · §17）

90 秒讲清 MemoWeft 的差异点：**说过的话被记住、纠正有痕、矛盾被看见、情绪会过去而事实会留下**。
无 API key、无网络、确定性复现。demo 只经公共 API（`import 'memoweft'`）调用核心——它同时是 API 的活体验收。

## 一条命令

```bash
npm run demo                      # 顺序演完四幕（先 build，再 node examples/demo.ts）
npm run demo -- --act 4           # 只演第 4 幕（自动前置第 1 幕建基础事实）
npm run demo -- --fast-forward 30d  # 第 4 幕快进的时长（缺省 7d）
```

确定性靠三件套：注入**固定可前进的 clock**（`CreateCoreOptions.clock`）+ 离线 stub LLM（脚本内写死输出）+ 简易词匹配召回器。真实宿主插自己的模型与向量召回器。

## 逐幕讲稿

### 幕 1 · 记住 —— *说过的话被记住，且带置信度*
- 输入：`I am allergic to peanuts.`
- 动作：`ingest → updateProfile(distill → consolidate)` 固化为 `fact`。
- 画面：认知状态表出现 `The user is allergic to peanuts · fact · 600 · limited`；`recall("allergic peanuts")` 把它带回，**置信度由 MemoWeft 自算、不采信 LLM 自报**。

### 幕 2 · 纠正 —— *纠正有痕，历史可溯*
- 输入：`Actually it is not me — my sister is the one allergic to peanuts.`
- 动作：`consolidate.correct` 把旧「user allergic」标 `invalidAt`（**失效但不删除**），采纳新「sister allergic」。
- 画面：旧认知带 `(invalidated, kept)` 仍在表上——历史可溯，不是被悄悄覆盖。

### 幕 3 · 矛盾 —— *矛盾不是被谁悄悄赢了，而是被看见*
- 输入：`I love americano.` → 行为：`ordered milk tea again`。
- 动作：`consolidate.conflict` 把「likes americano」标 `conflicted`，两条都留、不裁决任何一方。
- 画面：`The user likes americano · preference · 600 · conflicted !! CONFLICT`。

### 幕 4 · 时间 —— *情绪会过去，事实会留下*
- 输入：`I have been really stressed and in a low mood this week.` → `--fast-forward 7d`。
- 动作：注入 clock 前进 → 读路径 now 前进 → 情绪 `state` 的有效置信衰减到门槛下、不再被召回；`fact`/`preference` 不衰减、留存。
- 画面：`recall(now)` 有「stressed / low mood」，`recall(+7d)` 里它淡出，花生（sister）与偏好留下。

## 确定性验收（§17.2）

同一环境连跑两次，输出逐字一致：

```bash
npm run build
node examples/demo.ts > /tmp/run1.txt
node examples/demo.ts > /tmp/run2.txt
diff /tmp/run1.txt /tmp/run2.txt   # 期望：无输出（diff 为空）
```

## README GIF 位

README 顶部预留一段 demo GIF：录制 `npm run demo` 的四幕终端输出（约 90 秒）。实际录制由人类执行（如 `asciinema` / `vhs`）。生成后把 GIF 放 `docs/assets/`，在 README hero 区嵌入。
