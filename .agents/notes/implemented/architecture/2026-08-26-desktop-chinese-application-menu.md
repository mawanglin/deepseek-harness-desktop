# Agent Note: Chinese application menu bar

Status: implemented

English | [中文](2026-08-26-desktop-chinese-application-menu.zh.md)

## Problem

DSH Desktop never set an application menu, so macOS and Linux showed Electron's default English menu bar (File, Edit, View, Window, Help). The product locale is Chinese-first (the tray and client copy are bilingual), and users expected the window and system menu bars to match.

## Decision

A new `src/application-menu.ts` module builds a fully Chinese menu template and installs it with `Menu.setApplicationMenu` after `app.whenReady()` in the launcher. Top-level labels are `文件`, `编辑`, `视图`, `窗口`, and `帮助`; every submenu item carries an explicit Chinese label alongside its Electron `role`, so the menu stays Chinese regardless of the operating-system locale. macOS additionally prepends the application menu (`关于 DSH Desktop`, hide/unhide, `退出 DSH Desktop`) and uses macOS-only roles (`pasteAndMatchStyle`, window `zoom`, `关闭窗口`); Linux keeps `退出` in the File menu and `关于 DSH Desktop` in Help. Windows is untouched: it already removes the window menu, so `installChineseApplicationMenu` returns early on `win32`.

## Alternatives considered

**Translate only the top-level labels and rely on role defaults.** Rejected: role submenu labels follow the OS locale, so an English system would still show English children under Chinese parents.

**Make the menu follow the app locale setting.** Rejected for now: the request is a fixed Chinese menu bar; locale-driven menus would need the locale service in the main process and can follow later.

## Consequences

macOS and Linux now show the Chinese menu bar in development and packaged launches; Windows keeps its menu-bar removal. The bilingual README's native-lifecycle section and its i18n record are updated.

## Verification

`application-menu.spec.ts` covers the Linux and macOS template shapes (top-level labels, Chinese submenu labels, separator placement, macOS-only items and application menu), plus that `win32` skips `setApplicationMenu`. All four TypeScript compiler faces typecheck, the full desktop vitest suite passes (72 files, 681 tests), and the tsdown bundle build stays green.
