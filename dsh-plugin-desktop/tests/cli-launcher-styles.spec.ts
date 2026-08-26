import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cliLauncherStylesCss,
  installCliLauncherStyles,
} from '../src/client/cli-launcher-styles.ts'

function stubDocument(): { document: { head: { append: ReturnType<typeof vi.fn> }; querySelector: ReturnType<typeof vi.fn>; createElement: ReturnType<typeof vi.fn> } } {
  const style = { dataset: {} as Record<string, string>, textContent: '', remove: vi.fn() }
  const document = {
    head: { append: vi.fn() },
    querySelector: vi.fn(() => null),
    createElement: vi.fn(() => style),
  }
  vi.stubGlobal('document', document)
  return { document }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('desktop CLI launcher styles', () => {
  it('stacks wide footer actions and shapes both button states', () => {
    expect(cliLauncherStylesCss).toContain('[class*="footerActions"]:has(.dshCliLauncher[data-wide="true"])')
    expect(cliLauncherStylesCss).toContain('flex-direction: column;')
    expect(cliLauncherStylesCss).toContain('.dshCliLauncher {')
    expect(cliLauncherStylesCss).toContain('width: calc(100% + 4px);')
    expect(cliLauncherStylesCss).toContain('height: 42px;')
    expect(cliLauncherStylesCss).toContain('.dshCliLauncher[data-wide="false"] {')
    expect(cliLauncherStylesCss).toContain('width: 36px;')
  })

  it('injects a tagged style once and removes it on disposal', () => {
    const { document } = stubDocument()

    const remove = installCliLauncherStyles()
    expect(document.createElement).toHaveBeenCalledWith('style')
    expect(document.head.append).toHaveBeenCalledOnce()

    vi.mocked(document.querySelector).mockReturnValueOnce({} as HTMLStyleElement)
    installCliLauncherStyles()
    expect(document.head.append).toHaveBeenCalledOnce()

    remove()
    expect(document.head.append).toHaveBeenCalledOnce()
  })
})
