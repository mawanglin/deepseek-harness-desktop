import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import {
  Button,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type convergence only: the official sidebar declares the footer-action slot.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  DESKTOP_TERMINAL_OPEN_PATH,
  type DesktopTerminalOpenResponse,
} from '../desktop-cli-launcher-contract.ts'

/** Locale namespace owned by the desktop CLI launcher. */
export const CLI_LOCALE_NS = 'dsh-desktop'

const zh = {
  openCli: '开启 DSH CLI',
} as const

export type CliLocaleKey = keyof typeof zh

const en: Record<CliLocaleKey, string> = {
  openCli: 'Open DSH CLI',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-desktop': CliLocaleKey
  }
}

/** Terminal `>_` glyph used by the sidebar CLI launcher. */
export function IconTerminalOutline14({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.5 2.5C1.5 1.94772 1.94772 1.5 2.5 1.5H11.5C12.0523 1.5 12.5 1.94772 12.5 2.5V11.5C12.5 12.0523 12.0523 12.5 11.5 12.5H2.5C1.94772 12.5 1.5 12.0523 1.5 11.5V2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M4 4.5L6.5 7L4 9.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 9.5H10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function isOpenResponse(value: unknown): value is DesktopTerminalOpenResponse {
  return typeof value === 'object'
    && value !== null
    && (value as { opened?: unknown }).opened === true
}

/** Ask the desktop Host to open the packaged DSH CLI terminal. */
export async function requestOpenDesktopTerminal(
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = window.fetch.bind(window),
): Promise<void> {
  const response = await request(DESKTOP_TERMINAL_OPEN_PATH, {
    method: 'POST',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error('DSH Desktop could not open the DSH CLI terminal')
  const value: unknown = await response.json()
  if (!isOpenResponse(value)) throw new Error('DSH Desktop received an invalid terminal-open response')
}

export type CliLauncherProps = PropsRuntime<'sidebar.footer.action'>
  & PropsLocale<typeof CLI_LOCALE_NS>

/** Sidebar footer action that opens the packaged DSH CLI terminal above the market. */
export function CliLauncher({ wide, t }: CliLauncherProps) {
  return (
    <Tooltip label={t('openCli')} delayMs={500} disabled={wide}>
      <Button
        variant="ghost"
        className="dshCliLauncher"
        data-wide={wide}
        aria-label={t('openCli')}
        icon={<IconTerminalOutline14 size={wide ? 16 : 18} />}
        onClick={() => { void requestOpenDesktopTerminal() }}
      >
        {wide ? t('openCli') : null}
      </Button>
    </Tooltip>
  )
}

/** Register the CLI launcher before the plugin market footer action. */
export function installDesktopCliLauncher(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(CLI_LOCALE_NS, { zh, en }),
    'dsh-desktop: CLI launcher dictionaries',
  )
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-desktop-cli',
    order: 0,
    label: () => ctx.locale.bind(CLI_LOCALE_NS)('openCli'),
    locale: CLI_LOCALE_NS,
  }, CliLauncher))
}
