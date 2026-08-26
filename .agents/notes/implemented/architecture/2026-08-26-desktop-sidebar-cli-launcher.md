# Agent Note: Sidebar DSH CLI launcher in the desktop client

Status: implemented

English | [中文](2026-08-26-desktop-sidebar-cli-launcher.zh.md)

## Problem

The packaged DSH CLI is reachable through the tray's **Open DSH Terminal** command, but a user inside the Web renderer had no in-app entry point: opening the isolated `dsh`/`pnpm`/`node` shim environment required leaving the application or discovering the tray. The plugin market already contributes a `sidebar.footer.action` button at the bottom of the official sidebar, and users expected the CLI entry beside it.

## Decision

The desktop client contributes an **Open DSH CLI** footer action to the official `sidebar.footer.action` list slot, ordered before the community market (`order: 0` vs. the market's `order: 10`), with a desktop-owned terminal `>_` glyph rendered at 16px wide / 18px rail. It is a capability effect like boot-health reporting and folder drop, so it registers in both compatibility and advanced mode without touching the layout, root, or sidebar presentation.

The button performs a `POST` to the same-origin loopback route `DESKTOP_TERMINAL_OPEN_PATH` (`/__dsh_desktop/open-terminal`). A new Host route handler validates the method and the renderer origin (mirroring the directory-picker route contract), invokes the Electron adapter's `openTerminal()` for the active profile, and returns `{ opened: true }`; failures are logged and answered with a stable 500 body. The client validates the response shape before considering the request successful. Terminal launch problems still surface through the existing native error dialog, identical to the tray command.

The client bundle declares `dsh-desktop` as a locale namespace with zh/en copy (`开启 DSH CLI` / `Open DSH CLI`) and waits on the official sidebar slot declaration through `ctx.slots.inject`. The package's `dsh.client.inject` list grows by `@deepseek-ai/dsh-client-locale` and `@deepseek-ai/dsh-client-ui-sidebar` so the Loader preloads the locale service and the sidebar slot owner.

**Layout fix.** The upstream footer-actions container is a flex row designed for a single full-width action, so the second footer button shared the row and squeezed the market. A desktop-injected global rule keyed to the launcher's own `data-wide` marker stacks the two wide buttons vertically (CLI first, market below) by switching that container to `flex-direction: column`; the collapsed rail keeps both as inline icons. The `.dshCliLauncher` button styles mirror the market launcher's wide (full-width, 42px) and rail (36px circle) shapes.

## Alternatives considered

**Expose the terminal through an existing client service.** Rejected: the desktop client deliberately has no renderer-to-Host RPC surface beyond the loopback HTTP routes used by boot health and the directory picker; a same-origin route is the established seam.

**Reuse the tray-only command without a renderer entry.** Rejected: the request is explicitly for an in-sidebar launcher above the plugin market.

**Anchor the stack rule on the upstream CSS-module class.** The compiled name (`hHd-Xa_footerActions`) still contains the `footerActions` fragment, so the rule uses `[class*="footerActions"]` scoped by `:has(.dshCliLauncher[data-wide="true"])`; the `data-wide` scope keeps the collapsed rail layout untouched and limits blast radius if upstream renames the class.

## Consequences

Both presentation modes show the launcher above the plugin market in the official sidebar footer, and the packaged DSH CLI becomes reachable without leaving the renderer on every desktop platform (macOS, Windows, and Linux). The new route is loopback-only, origin-checked, and method-restricted, matching the directory-picker surface; it opens no network or renderer capability. The README compatibility-mode paragraph and both i18n records are updated.

## Verification

New `desktop-cli-launcher-route.spec.ts` covers the success response, cross-origin and non-POST rejection, and the stable failure body. New `cli-launcher.spec.ts` covers the fetch contract, invalid/failed responses, icon-only versus labeled rendering, the glyph sizing, and the `sidebar.footer.action` registration (id, order, locale, label) through `installDesktopCliLauncher`; the spec stubs the two ui-primitives it consumes so it stays server-renderable. New `cli-launcher-styles.spec.ts` covers the stack rule and both button shapes in the injected CSS plus one-time style injection and disposal. `plugin.spec.ts` gains a same-origin Host-route test that asserts `openTerminal()` is invoked. `package.spec.ts` asserts the extended `dsh.client.inject` list. `vitest.config.ts` inlines `@deepseek-ai/dsh-client-ui-primitives` so katex CSS imports inside that package transform instead of failing in the node environment. All four TypeScript compiler faces typecheck, the full desktop vitest suite passes (73 files, 683 tests), and the tsdown bundle build plus runtime-closure and CLI smokes stay green.
