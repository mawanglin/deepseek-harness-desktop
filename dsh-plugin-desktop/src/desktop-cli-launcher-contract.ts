/** Loopback route the desktop renderer calls to open the packaged DSH CLI terminal. */
export const DESKTOP_TERMINAL_OPEN_PATH = '/__dsh_desktop/open-terminal'

/** Response body confirming the Host accepted a renderer terminal-open request. */
export interface DesktopTerminalOpenResponse {
  /** Whether the Host accepted and launched the DSH CLI terminal. */
  opened: boolean
}
