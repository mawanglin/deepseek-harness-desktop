import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { handleDesktopTerminalOpenRequest } from '../src/desktop-cli-launcher-route.ts'

function request(origin = 'http://127.0.0.1:43120', method = 'POST'): IncomingMessage {
  return { method, headers: { origin } } as IncomingMessage
}

function response(): ServerResponse & {
  body: string
  end: ReturnType<typeof vi.fn>
  setHeader: ReturnType<typeof vi.fn>
} {
  const res = {
    body: '',
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((body?: string) => { res.body = body ?? '' }),
  }
  return res as unknown as ServerResponse & typeof res
}

describe('desktop CLI launcher route', () => {
  it('opens the DSH CLI terminal for one same-origin renderer request', async () => {
    const openTerminal = vi.fn(() => {})
    const res = response()

    await handleDesktopTerminalOpenRequest(
      request(),
      res,
      'http://127.0.0.1:43120',
      openTerminal,
    )

    expect(openTerminal).toHaveBeenCalledOnce()
    expect(res.statusCode).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('content-type', 'application/json; charset=utf-8')
    expect(JSON.parse(res.body)).toEqual({ opened: true })
  })

  it('rejects cross-origin and non-POST requests without opening a terminal', async () => {
    const openTerminal = vi.fn(() => {})

    for (const req of [request('https://example.com'), request(undefined, 'GET')]) {
      const res = response()
      await handleDesktopTerminalOpenRequest(req, res, 'http://127.0.0.1:43120', openTerminal)
      expect(res.statusCode).toBe(req.method === 'GET' ? 405 : 403)
    }
    expect(openTerminal).not.toHaveBeenCalled()
  })

  it('returns a stable error without exposing native details', async () => {
    const reportError = vi.fn()
    const res = response()

    await handleDesktopTerminalOpenRequest(
      request(),
      res,
      'http://127.0.0.1:43120',
      () => { throw new Error('terminal profile is not configured') },
      reportError,
    )

    expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'terminal profile is not configured' }))
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body)).toEqual({ error: 'desktop terminal open failed' })
  })
})
