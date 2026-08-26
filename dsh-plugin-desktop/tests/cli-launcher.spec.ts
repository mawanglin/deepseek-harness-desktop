import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

// ui-primitives bundles markdown surfaces that import katex styles and its
// Tooltip uses client-only effects; stub the two primitives this component
// consumes so the spec stays server-renderable and dependency-free.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const React = createRequire(import.meta.url)('react') as typeof import('react')
  return {
    Button: (props: { icon?: React.ReactNode; children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement('button', props, props.icon, props.children),
    Tooltip: (props: { children?: React.ReactNode }) => props.children,
  }
})

import {
  CliLauncher,
  CLI_LOCALE_NS,
  IconTerminalOutline14,
  installDesktopCliLauncher,
  requestOpenDesktopTerminal,
  type CliLauncherProps,
} from '../src/client/cli-launcher.tsx'
import { DESKTOP_TERMINAL_OPEN_PATH } from '../src/desktop-cli-launcher-contract.ts'

const t = vi.fn((key: string) => key === 'openCli' ? '开启 DSH CLI' : String(key))

describe('desktop CLI launcher client', () => {
  it('opens the packaged DSH CLI terminal through the same-origin route', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ opened: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await expect(requestOpenDesktopTerminal(request)).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledWith(DESKTOP_TERMINAL_OPEN_PATH, {
      method: 'POST',
      headers: { accept: 'application/json' },
    })
  })

  it('rejects failed and invalid terminal-open responses', async () => {
    await expect(requestOpenDesktopTerminal(async () => new Response('{}')))
      .rejects.toThrow('invalid terminal-open response')
    await expect(requestOpenDesktopTerminal(async () => new Response('', { status: 500 })))
      .rejects.toThrow('could not open the DSH CLI terminal')
  })

  it('renders an icon-only rail action and a labeled wide action', () => {
    const rail = renderToString(createElement(CliLauncher, { wide: false, t } as CliLauncherProps))
    expect(rail).toContain('aria-label="开启 DSH CLI"')
    expect(rail).toContain('<svg')
    expect(rail).not.toContain('>开启 DSH CLI<')

    const wide = renderToString(createElement(CliLauncher, { wide: true, t } as CliLauncherProps))
    expect(wide).toContain('aria-label="开启 DSH CLI"')
    expect(wide).toContain('>开启 DSH CLI<')
  })

  it('renders the terminal glyph at the requested size', () => {
    const markup = renderToString(createElement(IconTerminalOutline14, { size: 18 }))
    expect(markup).toContain('width="18"')
    expect(markup).toContain('height="18"')
    expect(markup).toContain('viewBox="0 0 14 14"')
  })

  it('registers the CLI launcher above the plugin market footer action', () => {
    const registered: unknown[] = []
    const register = vi.fn((options: object) => {
      registered.push(options)
      return () => {}
    })
    const localeRegister = vi.fn()
    const bind = vi.fn(() => t)
    const ctx = {
      effect: vi.fn((registerCallback: () => unknown) => {
        registerCallback()
        return () => {}
      }),
      slots: {
        inject: vi.fn((name: string, factory: () => unknown) => {
          expect(name).toBe('sidebar.footer.action')
          return factory()
        }),
        register,
      },
      locale: {
        register: localeRegister,
        bind,
      },
    } as unknown as ClientContext

    installDesktopCliLauncher(ctx)

    expect(localeRegister).toHaveBeenCalledWith(CLI_LOCALE_NS, expect.objectContaining({
      zh: { openCli: '开启 DSH CLI' },
      en: { openCli: 'Open DSH CLI' },
    }))
    expect(registered).toHaveLength(1)
    expect(registered[0]).toEqual(expect.objectContaining({
      name: 'sidebar.footer.action',
      id: 'dsh-desktop-cli',
      order: 0,
      locale: CLI_LOCALE_NS,
    }))
    const options = registered[0] as { label: () => string }
    expect(options.label()).toBe('开启 DSH CLI')
    expect(bind).toHaveBeenCalledWith(CLI_LOCALE_NS)
  })
})
