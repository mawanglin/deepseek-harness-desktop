import type { IncomingMessage, ServerResponse } from 'node:http'
import type { DesktopTerminalOpenResponse } from './desktop-cli-launcher-contract.ts'

function finishJson(res: ServerResponse, statusCode: number, value: object): void {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

/**
 * Serve one same-origin request that opens the packaged DSH CLI terminal.
 * @param req - renderer HTTP request.
 * @param res - server response.
 * @param expectedOrigin - loopback renderer origin allowed to open the terminal.
 * @param openTerminal - native adapter operation that launches the DSH CLI terminal.
 * @param reportError - host logger invoked for unexpected native failures.
 */
export async function handleDesktopTerminalOpenRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  openTerminal: () => void,
  reportError: (cause: unknown) => void = () => {},
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, { error: 'method not allowed' })
  if (req.headers.origin !== expectedOrigin) return finishJson(res, 403, { error: 'forbidden' })
  try {
    openTerminal()
    const response: DesktopTerminalOpenResponse = { opened: true }
    finishJson(res, 200, response)
  } catch (cause: unknown) {
    reportError(cause)
    finishJson(res, 500, { error: 'desktop terminal open failed' })
  }
}
