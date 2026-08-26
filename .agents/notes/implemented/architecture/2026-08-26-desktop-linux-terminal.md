# Agent Note: Linux desktop terminal for the packaged DSH CLI

Status: implemented

English | [中文](2026-08-26-desktop-linux-terminal.zh.md)

## Problem

The packaged DSH CLI (`lib/desktop-cli.js` bootstrapping `@deepseek-ai/dsh/lib/bin.js`) is physically shipped in every platform artifact and passes the headless CLI smoke on Linux, but Linux had no supported user-facing entry point. `src/terminal.ts` threw on Linux, `desktop-terminal.ts` accepted only `darwin` and `win32`, and `src/main.ts` installed the ambient `dsh` command on Windows only. A Linux user of the deb/rpm/AppImage package could run the GUI in compatibility mode but could not reach the packaged `dsh`, `pnpm`, and `node` shim environment at all, which forced installing a separate npm `@deepseek-ai/dsh` instead.

## Decision

Extend the existing DSH Terminal surface to Linux by reusing the POSIX machinery already shared with macOS, keeping the platform contract identical: private per-profile shims under user data, `DSH_HOME` fixed to the active home, the shim directory prepended only to the terminal child's `PATH`, and no edits to the global environment or shell startup files.

**Platform acceptance.** `DesktopTerminalPlatform` becomes `'darwin' | 'win32' | 'linux'`, and `prepareDesktopTerminalFiles` accepts Linux. The macOS-only generators `macShim`, `macDshShim`, `macPnpmShim`, `macZshRc`, and `macBashRc` are renamed to the shared `posixShim`, `posixDshShim`, `posixPnpmShim`, `posixZshRc`, and `posixBashRc` forms used by both POSIX platforms.

**Linux welcome script.** A new `linuxWelcome` generator mirrors the macOS one (clear screen, version/profile/home banner, command list, restart reminder) and writes `welcome.sh`. Its `$SHELL` dispatch handles `*/bash` (rc-preserving `--noprofile --rcfile`), `*/zsh` (`ZDOTDIR` redirect that sources the user's rc first), and `*/fish` (plain interactive exec, since fish inherits the exported environment and loads its own config); the fallback for an unknown or unset `SHELL` execs `/bin/bash` with the same rc-preserving startup instead of macOS's `/bin/zsh`.

**Terminal emulator resolution.** `openDesktopTerminal` gains a Linux branch that resolves one emulator and launches `[prefix..., welcomePath]` with `shell: false`. Resolution mirrors the Windows adapter shape: an explicit `linuxTerminal` override wins, otherwise `defaultLinuxExecutableResolver` searches each absolute inherited `PATH` directory for the ordered candidates gnome-terminal (`--`), konsole (`-e`), xfce4-terminal (`-e`), kitty (positional), alacritty (`-e`), xterm (`-e`), the Debian `x-terminal-emulator` alternatives target (`-e`), then the freedesktop `xdg-terminal-exec` launcher (positional). A missing emulator fails loud with a clear message that reaches the same native error dialog as macOS and Windows launch failures.

**Tray registration.** `src/terminal.ts` no longer rejects Linux, so the **Open DSH Terminal** tray command registers on all three platforms.

## Alternatives considered

**Embed a terminal widget through the bundled `node-pty`.** Rejected: the product contract is the user's own system terminal (macOS Terminal.app, Windows Terminal or a visible console, Linux emulators), and an in-app pty surface would add renderer capability and session ownership this package deliberately does not own.

**Honor a `TERMINAL` or `DSH_DESKTOP_TERMINAL` environment override during discovery.** Rejected: `TERMINAL` is frequently set by the terminal emulator itself rather than chosen by the user, so it is an unreliable selector; the explicit `linuxTerminal` adapter covers power users and tests.

## Consequences

Linux deb/rpm/AppImage artifacts now compose the tray command, and opening it requires at least one of the resolved terminal emulators (all mainstream desktop environments ship one). Advanced presentation mode and installer downloads remain macOS/Windows-only; this change does not alter those boundaries. The bilingual README terminal paragraph, Linux packaging section, and known-limitations list are updated, and both README blob hashes are re-recorded in `README.i18n.yaml`.

## Verification

`desktop-terminal.spec.ts` gains `linuxOptions` fixtures covering generated POSIX shim and `welcome.sh` contents, gnome-terminal discovery argv, an explicit kitty override, the ordered candidate probe list including the private shim directory, and the fail-loud error when no emulator exists; the former "unsupported on linux" case now uses `freebsd`. `terminal.spec.ts` verifies a Linux profile registers the tray command and invokes `openTerminal`. All four TypeScript compiler faces typecheck, the full desktop vitest suite passes (669 tests), and the tsdown bundle build succeeds.
