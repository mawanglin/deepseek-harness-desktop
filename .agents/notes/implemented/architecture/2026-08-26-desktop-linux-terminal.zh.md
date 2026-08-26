# Agent Note: 面向打包 DSH CLI 的 Linux 桌面终端

Status: implemented

English | [中文](2026-08-26-desktop-linux-terminal.zh.md)

## Problem

打包版 DSH CLI（`lib/desktop-cli.js` 引导 `@deepseek-ai/dsh/lib/bin.js`）物理上存在于每个平台产物中，并且无头 CLI 冒烟测试在 Linux 上也能通过，但 Linux 没有受支持的用户入口。`src/terminal.ts` 在 Linux 上直接抛错，`desktop-terminal.ts` 只接受 `darwin` 与 `win32`，`src/main.ts` 也只会在 Windows 上安装 ambient `dsh` 命令。Linux 用户安装了 deb/rpm/AppImage 后只能在兼容模式下运行 GUI，完全无法使用打包的 `dsh`、`pnpm` 与 `node` shim 环境，只能另行安装独立的 npm `@deepseek-ai/dsh`。

## Decision

把现有 DSH Terminal 能力扩展到 Linux，复用与 macOS 共享的 POSIX 机制，并保持平台契约一致：在 user-data 下按 profile 生成私有 shim，`DSH_HOME` 固定为激活 home，只在该终端子进程的 `PATH` 前置 shim 目录，不修改全局环境或 shell 启动文件。

**平台接受。** `DesktopTerminalPlatform` 变为 `'darwin' | 'win32' | 'linux'`，`prepareDesktopTerminalFiles` 接受 Linux。原 macOS 专用生成器 `macShim`、`macDshShim`、`macPnpmShim`、`macZshRc` 与 `macBashRc` 改名为两个 POSIX 平台共用的 `posixShim`、`posixDshShim`、`posixPnpmShim`、`posixZshRc` 与 `posixBashRc`。

**Linux 欢迎脚本。** 新增 `linuxWelcome` 生成器，与 macOS 版一致（清屏、版本/profile/home 横幅、命令列表、重启提醒），输出 `welcome.sh`。其 `$SHELL` 分派处理 `*/bash`（保留用户 rc 的 `--noprofile --rcfile`）、`*/zsh`（通过 `ZDOTDIR` 重定向并先 source 用户 rc）与 `*/fish`（直接交互式 exec，fish 会继承已导出的环境并加载自身配置）；当 `SHELL` 未知或未设置时，回退为 `exec /bin/bash`（同样保留 rc 的启动方式），而不是 macOS 的 `/bin/zsh`。

**终端模拟器解析。** `openDesktopTerminal` 新增 Linux 分支：解析一个模拟器并以 `shell: false` 启动 `[prefix..., welcomePath]`。解析方式与 Windows adapter 形状一致：显式 `linuxTerminal` override 优先，否则 `defaultLinuxExecutableResolver` 按顺序搜索继承 `PATH` 中的每个绝对目录，候选为 gnome-terminal（`--`）、konsole（`-e`）、xfce4-terminal（`-e`）、kitty（位置参数）、alacritty（`-e`）、xterm（`-e`）、Debian `x-terminal-emulator` alternatives 目标（`-e`），最后是 freedesktop `xdg-terminal-exec` launcher（位置参数）。没有可用模拟器时失败并给出清晰提示，最终与 macOS、Windows 一样进入同一个原生错误对话框。

**托盘注册。** `src/terminal.ts` 不再拒绝 Linux，因此 **Open DSH Terminal** 托盘命令在三个平台都会注册。

## Alternatives considered

**通过打包的 `node-pty` 嵌入终端组件。** 已否决：产品契约是用户自己的系统终端（macOS Terminal.app、Windows Terminal 或可见控制台、Linux 模拟器），应用内 pty 会引入这个包刻意不拥有的 renderer 能力与会话所有权。

**在解析时支持 `TERMINAL` 或 `DSH_DESKTOP_TERMINAL` 环境变量覆盖。** 已否决：`TERMINAL` 往往由终端模拟器自己设置而不是用户选择，作为选择器不可靠；显式 `linuxTerminal` adapter 已覆盖高级用户与测试场景。

## Consequences

Linux deb/rpm/AppImage 产物现在会组合托盘命令，打开它至少需要一个候选终端模拟器（主流桌面环境都自带）。高级呈现模式与安装包下载仍保持 macOS/Windows-only，本次改动不触碰这些边界。双语 README 的终端段落、Linux 打包章节与已知限制列表均已更新，两个 README 的 blob 哈希也已重新记录到 `README.i18n.yaml`。

## Verification

`desktop-terminal.spec.ts` 新增 `linuxOptions` fixtures，覆盖生成的 POSIX shim 与 `welcome.sh` 内容、gnome-terminal 发现 argv、显式 kitty override、包含私有 shim 目录的有序候选探测列表，以及无模拟器时的 fail-loud 错误；原"linux 不支持"用例改用 `freebsd`。`terminal.spec.ts` 验证 Linux profile 会注册托盘命令并调用 `openTerminal`。四个 TypeScript 编译面全部通过 typecheck，桌面 vitest 全量套件通过（669 个测试），tsdown bundle 构建成功。
