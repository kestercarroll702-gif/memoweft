# 参考宿主 Demo（Reference Host Demo）

[English](./reference-host.md) | **简体中文**

`apps/memoweft-host` 下自带的宿主是一个参考实现。

它的存在是为了演示宿主如何使用 MemoWeft Core。它并不是本仓库的主要产品。

MemoWeft 本身是由下面这行导出的库：

```ts
import { createMemoWeftCore } from 'memoweft';
```

## Demo 展示了什么

参考宿主演示了：

- 带记忆召回的对话；
- 可见的记忆形成过程；
- 证据与认知的检视；
- 记忆管理；
- 导出与导入；
- 插件与观察流程。

## 宿主负责什么

宿主负责：

- UI；
- 对话体验；
- 人设与语气；
- 隐私提示；
- 何时触发 `updateProfile()`；
- 如何展示召回的上下文；
- 用户如何管理记忆。

## MemoWeft Core 负责什么

MemoWeft Core 负责：

- 证据存储；
- 事件蒸馏；
- 认知形成；
- 置信度计算；
- 冲突处理；
- 召回；
- 受控的记忆管理 API；
- 可移植的记忆包。

## 运行 Demo

参考宿主需要 Node.js 24 或更新版本。

```bash
git clone https://github.com/memoweft/memoweft.git
cd memoweft
npm install
npm run build
npm start -w @memoweft/host
```

打开：

```text
http://localhost:7788
```
