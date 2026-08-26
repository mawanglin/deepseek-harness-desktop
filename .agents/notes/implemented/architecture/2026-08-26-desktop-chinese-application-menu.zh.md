# Agent Note: 中文应用菜单栏

Status: implemented

English | [中文](2026-08-26-desktop-chinese-application-menu.zh.md)

## Problem

DSH Desktop 从未设置应用菜单，因此 macOS 与 Linux 会显示 Electron 默认的英文菜单栏（File、Edit、View、Window、Help）。产品语言以中文优先（托盘与 client 文案均为双语），用户期望窗口与系统菜单栏与其一致。

## Decision

新增 `src/application-menu.ts` 模块，构建全中文菜单模板，并在 Launcher 的 `app.whenReady()` 之后通过 `Menu.setApplicationMenu` 安装。顶层标签为 `文件`、`编辑`、`视图`、`窗口` 与 `帮助`；每个子菜单项都在 Electron `role` 之外携带显式中文 label，因此无论操作系统 locale 如何，菜单都保持中文。macOS 额外前置应用菜单（`关于 DSH Desktop`、隐藏/全部显示、`退出 DSH Desktop`），并使用 macOS 专属 role（`pasteAndMatchStyle`、窗口 `zoom`、`关闭窗口`）；Linux 在文件菜单保留 `退出`，在帮助菜单保留 `关于 DSH Desktop`。Windows 保持不变：它已经移除窗口菜单，因此 `installChineseApplicationMenu` 在 `win32` 上直接返回。

## Alternatives considered

**只翻译顶层标签并依赖 role 默认文案。** 已否决：role 子菜单文案跟随操作系统 locale，英文系统会在中文父菜单下继续显示英文子项。

**让菜单跟随应用 locale 设置。** 暂不采纳：需求是固定中文菜单栏；locale 驱动的菜单需要主进程访问 locale service，可留待后续。

## Consequences

macOS 与 Linux 在开发与打包启动中都会显示中文菜单栏；Windows 继续沿用菜单栏移除。双语 README 的原生生命周期段落与 i18n 记录已更新。

## Verification

`application-menu.spec.ts` 覆盖 Linux 与 macOS 的模板形状（顶层标签、中文子菜单标签、分隔符位置、macOS 专属项与应用菜单），以及 `win32` 跳过 `setApplicationMenu`。四个 TypeScript 编译面全部通过 typecheck，桌面 vitest 全量套件通过（72 个文件、681 个测试），tsdown bundle 构建保持绿色。
