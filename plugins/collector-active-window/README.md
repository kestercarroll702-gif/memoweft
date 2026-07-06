# @memoweft/collector-active-window

MemoWeft **采集插件（Collector Plugin）** · 前台活动窗口采集器 V1（**现只 Windows** · 零依赖）。采样器按平台工厂化，加平台见下「平台支持」。

> 架构归位：真实采集属 **Plugin 层**，不属于 Core（`boundaries.md §4.1`）。本包从 `src/perception/collectors/` 迁出后独立成 workspace。

## 它是什么

每隔几秒采一次 Windows 当前前台窗口（应用名 + 标题），把连续停留合并成一段，够阈值的段映射成通用 `Observation`，交给 Host 落成 `observed` 证据。之后 MemoWeft 的画像/召回就能用上"用户在什么应用停留多久"这类被动信号。

## 数据流

```
采集器（本包）采窗口
  → 映射成 generic Observation（activeWindowToObservation）
  → POST Host /api/observe
      → Host 审核（① 采集总开关 ② 强制剥掉 allowCloudRead ③ 调 core.ingestObservation）
      → Core 落 observed 证据
```

采集插件**绝不直穿 Core / Store**，一律经 Host `/api/observe` 这道审核门（路线 §7「插件只能请求，Host 审核，Core 执行」）。

## 隐私红线

- 采集器 POST 的 Observation **不带任何上云授权位**；
- Host `/api/observe` 再**强制剥一道** `allowCloudRead`；
- Core 对 `observed` 证据套保守默认：**本地可读 / 不上云 / 可推画像**。

想让某条观察上云，是记忆管理页的**人工动作**，不是采集默认。

## 平台支持（现只 Windows）

采集循环（连续合并 / 阈值过滤 / 计时）**平台无关**；只有"采一次前台窗口"是平台专有。采样器按平台工厂化：

- **加平台的唯一口子** = `src/samplerFactory.ts` 的 `createForegroundSampler(platform)`。要支持 macOS / Linux，在这里加一个 case、实现对应的 `sample*(): Promise<ForegroundWindow|null>`（**mac** 用 `osascript`/AppleScript 取 frontmost app + window title；**Linux** 用 `xdotool` / `wmctrl`），采集循环一行不用改。
- 未支持的平台：工厂返回 `null`，运行器给"未支持 + 怎么加"的明确提示后退出，不空转。
- **零依赖红线**：加平台采样器只准用 **node 内置**（`child_process` 调系统自带命令），**禁引 npm 包**。
- 现只写了 Windows（`win32Foreground.ts`，用 user32.dll + PowerShell）——mac/Linux 采样器暂不写（开发机是 Windows、跑不了也验不了，不造验不了的代码）。

## 怎么跑

先起 Host（另开一个终端）：

```bash
npm run build                      # 先出 dist（Host / 插件都经 import 'memoweft' 用 Core）
npm start -w @memoweft/host        # Host 起在 :7788
```

再起采集器：

```bash
npm run collector                                  # 缺省：5s 采一次，停留 ≥30s 才落
node plugins/collector-active-window/run.mjs 2 10  # 可选：采样间隔秒 + 产出阈值秒（冒烟调短用）
MEMOWEFT_HOST_URL=http://localhost:7788 npm run collector   # 可选：改 Host 地址
```

`Ctrl+C` 优雅退出（会冲刷最后一段再走）。

采集开关（Host 侧）：环境变量 `MEMOWEFT_HOST_COLLECTOR=off` 可让 Host 拒收采集（`/api/observe` 返回 403）。缺省 `on`。

## 测试

```bash
npm test -w @memoweft/collector-active-window
```

纯逻辑离线护栏：合并 / 阈值 / 切换 / pause / stop / 采不到截断 / 不带授权位 / onEmit 抛错不崩 + 样本→Observation 映射。不碰真 Win32、不起真定时器（sampler / 时钟 / 定时器全注入）。
