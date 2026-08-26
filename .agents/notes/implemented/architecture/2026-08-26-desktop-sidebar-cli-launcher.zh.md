# Agent Note: 桌面客户端侧边栏 DSH CLI 启动器

Status: implemented

English | [中文](2026-08-26-desktop-sidebar-cli-launcher.zh.md)

## Problem

打包版 DSH CLI 可以通过托盘中的 **Open DSH Terminal** 命令访问，但 Web renderer 内的用户没有应用内入口：打开隔离的 `dsh`/`pnpm`/`node` shim 环境需要离开应用或发现托盘。插件市场已经在官方 sidebar 底部贡献了一个 `sidebar.footer.action` 按钮，用户期望 CLI 入口出现在它旁边。

## Decision

desktop client 向官方 `sidebar.footer.action` 列表槽位贡献一个 **开启 DSH CLI** footer action，排在社区插件市场之前（`order: 0`，市场为 `order: 10`），并带桌面自有的终端 `>_` 图标（宽模式 16px / rail 18px）。它与启动健康报告、文件夹拖放一样属于能力 effect，因此在兼容与高级两种模式都会注册，且不触碰 layout、root 或 sidebar 呈现。

按钮向同源 loopback 路由 `DESKTOP_TERMINAL_OPEN_PATH`（`/__dsh_desktop/open-terminal`）发起 `POST`。新增的 Host 路由 handler 校验方法与 renderer origin（与目录选择器路由契约一致），为激活 profile 调用 Electron adapter 的 `openTerminal()`，并返回 `{ opened: true }`；失败会记日志并返回稳定的 500 响应体。client 在认为请求成功前会校验响应形状。终端启动问题仍通过既有的原生错误对话框呈现，与托盘命令一致。

client bundle 把 `dsh-desktop` 注册为 locale namespace（zh/en 文案：`开启 DSH CLI` / `Open DSH CLI`），并通过 `ctx.slots.inject` 等待官方 sidebar 槽位声明。包的 `dsh.client.inject` 列表新增 `@deepseek-ai/dsh-client-locale` 与 `@deepseek-ai/dsh-client-ui-sidebar`，让 Loader 预加载 locale service 与 sidebar 槽位 owner。

**排版修复。** 上游 footer-actions 容器是按单个全宽按钮设计的 flex 行，因此第二个 footer 按钮会与之并排并挤压插件市场。desktop 注入的全局规则以启动器自身的 `data-wide` marker 为锚点，通过 `:has()` 把该容器切换为 `flex-direction: column`，让宽模式下的两个按钮纵向堆叠（CLI 在上、市场在下）；收起 rail 仍保持两个内联图标。`.dshCliLauncher` 按钮样式与市场启动器对齐（宽模式全宽 42px，rail 36px 圆形）。

## Alternatives considered

**通过既有 client service 暴露终端。** 已否决：desktop client 除 boot health 与目录选择器使用的 loopback HTTP 路由外，刻意没有 renderer 到 Host 的 RPC surface；同源路由是既定接缝。

**只保留托盘命令、不加 renderer 入口。** 已否决：需求明确要求在插件市场之上的 sidebar 内提供启动器。

**以上游 CSS-module 类为锚点。** 编译后的类名（`hHd-Xa_footerActions`）仍包含 `footerActions` 片段，因此规则使用 `[class*="footerActions"]` 并以 `:has(.dshCliLauncher[data-wide="true"])` 限定作用域；`data-wide` 作用域保持收起 rail 布局不变，并在上游改名时把影响面限制在最小。

**只保留托盘命令、不加 renderer 入口。** 已否决：需求明确要求在插件市场之上的 sidebar 内提供启动器。

## Consequences

两种呈现模式都会在官方 sidebar footer 的插件市场之上显示启动器，打包版 DSH CLI 因此在每个桌面平台（macOS、Windows 与 Linux）都能不离开 renderer 访问。新路由仅 loopback、校验 origin 并限制方法，与目录选择器 surface 一致；它不打开任何网络或 renderer 能力。README 的兼容模式段落与两个 i18n 记录均已更新。

## Verification

新增 `desktop-cli-launcher-route.spec.ts` 覆盖成功响应、跨源与非 POST 拒绝、稳定失败响应体。新增 `cli-launcher.spec.ts` 覆盖 fetch 契约、无效/失败响应、仅图标与带标签渲染、图标尺寸，以及 `installDesktopCliLauncher` 的 `sidebar.footer.action` 注册（id、order、locale、label）；该 spec stub 掉它消费的两个 ui-primitives，保持可服务端渲染。新增 `cli-launcher-styles.spec.ts` 覆盖注入 CSS 中的堆叠规则与两种按钮形状，以及一次性注入与移除。`plugin.spec.ts` 新增同源 Host 路由测试，断言 `openTerminal()` 被调用。`package.spec.ts` 断言扩展后的 `dsh.client.inject` 列表。`vitest.config.ts` 内联 `@deepseek-ai/dsh-client-ui-primitives`，让该包内的 katex CSS import 在 node 环境中转换而非失败。四个 TypeScript 编译面全部通过 typecheck，桌面 vitest 全量套件通过（73 个文件、683 个测试），tsdown bundle 构建与 runtime-closure、CLI 冒烟均保持绿色。
