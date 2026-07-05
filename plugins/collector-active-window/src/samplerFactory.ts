/**
 * 前台窗口采样器工厂：按平台选实现（Collector Plugin · 加平台的唯一口子）。
 *
 * 采集循环（activeWindowCollector）本就平台无关，只有"采一次前台窗口"这步是平台专有。
 * 要支持 macOS / Linux：在这里加一个 case、实现对应的 `sample*(): Promise<ForegroundWindow|null>`
 *   （mac 用 osascript/AppleScript 取 frontmost app + window title；Linux 用 xdotool / wmctrl），
 *   采样器契约照 ForegroundSampler（取不到返回 null、绝不 throw），采集循环一行不用改。
 *
 * ⚠️ 现只 Windows（作者拍板 2026-07-06）：mac/Linux 采样器暂不写——开发机是 Windows、跑不了也验不了，
 *   不造验不了的代码（诚实优先）。其余平台返回 null，运行器据此给"未支持 + 怎么加"的明确提示、不空转。
 * ⚠️ 零依赖红线：加平台采样器只准用 node 内置（child_process 调系统自带命令），禁引 npm 包。
 */
import type { ForegroundSampler } from './activeWindowCollector.ts';
import { sampleForegroundWindowWin32 } from './win32Foreground.ts';

/** 已支持的平台（运行器报"未支持"时列出）。加平台时把它加进来。 */
export const SUPPORTED_PLATFORMS = ['win32'] as const;

/**
 * 按平台造前台窗口采样器；未支持的平台返回 `null`（不 throw）。
 * @param platform 缺省 `process.platform`（可注入便于测试）。
 */
export function createForegroundSampler(platform: string = process.platform): ForegroundSampler | null {
  switch (platform) {
    case 'win32':
      return () => sampleForegroundWindowWin32();
    // 加平台在此（现不写，见文件头 ⚠️）：
    //   case 'darwin': return () => sampleForegroundWindowDarwin(); // osascript / AppleScript
    //   case 'linux':  return () => sampleForegroundWindowLinux();  // xdotool / wmctrl
    default:
      return null;
  }
}
