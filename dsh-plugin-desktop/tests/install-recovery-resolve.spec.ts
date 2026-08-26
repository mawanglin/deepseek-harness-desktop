import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DesktopInstallRecoveryStore, desktopInstallRecoveryStatePath } from '../src/install-recovery.ts'
import { resolvePendingInstallRecovery } from '../src/install-recovery-resolve.ts'

const roots: string[] = []
const PREINSTALL = {
  'package.json': '{"name":"fixture-private-marker","private":true}\n',
  'pnpm-lock.yaml': 'lockfileVersion: "9.0"\n# lock-private-marker\n',
  'pnpm-workspace.yaml': 'packages:\n  - fixture-private-marker\n',
} as const
const POSTINSTALL = {
  'package.json': '{"name":"fixture-private-marker","private":true,"dependencies":{"plugin-a":"1.0.0"}}\n',
  'pnpm-lock.yaml': 'lockfileVersion: "9.0"\n# installed-plugin-a\n',
  'pnpm-workspace.yaml': 'packages:\n  - fixture-private-marker\n  - installed-plugin-a\n',
} as const
const FILES = Object.keys(PREINSTALL) as (keyof typeof PREINSTALL)[]

interface Fixture {
  readonly root: string
  readonly homeDir: string
  readonly statePath: string
  readonly desktopDir: string
  readonly webDir: string
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-install-recovery-resolve-'))
  roots.push(root)
  return root
}

function fixture(): Fixture {
  const root = temporaryRoot()
  const homeDir = join(root, 'home')
  const desktopDir = join(homeDir, 'profiles', 'desktop')
  const webDir = join(homeDir, 'profiles', 'web')
  for (const dir of [desktopDir, webDir]) {
    mkdirSync(dir, { recursive: true })
    for (const name of FILES) writeFileSync(join(dir, name), PREINSTALL[name], { mode: 0o640 })
  }
  return {
    root,
    homeDir,
    statePath: desktopInstallRecoveryStatePath(join(root, 'user-data')),
    desktopDir,
    webDir,
  }
}

function desktopStore(target: Fixture, generationId = 'generation-0001'): DesktopInstallRecoveryStore {
  return new DesktopInstallRecoveryStore({
    statePath: target.statePath,
    profileName: 'desktop',
    profileDir: target.desktopDir,
    generationId,
    now: () => 1_800_000_000_000,
  })
}

function resolve(target: Fixture) {
  return resolvePendingInstallRecovery({
    statePath: target.statePath,
    homeDir: target.homeDir,
    activeProfileName: 'desktop',
    activeProfileDir: target.desktopDir,
    now: () => 1_800_000_000_000,
  })
}

function backupsOf(target: Fixture, transactionId: string): string {
  return join(dirname(target.statePath), 'backups', transactionId)
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    try { chmodSync(root, 0o700) } catch {}
    rmSync(root, { recursive: true, force: true })
  }
})

describe('one-click install-recovery resolution', () => {
  it('reports none when no transaction is pending', async () => {
    const target = fixture()
    await expect(resolve(target)).resolves.toEqual({ status: 'none' })
  })

  it('clears a stale awaiting-restart transaction without touching profile files', async () => {
    const target = fixture()
    const origin = desktopStore(target, 'terminal:0001')
    const prepared = await origin.begin({
      packageName: 'plugin-a',
      packageVersion: '1.0.0',
      receiptId: 'receipt-0001',
    })
    for (const name of FILES) writeFileSync(join(target.desktopDir, name), POSTINSTALL[name], { mode: 0o640 })
    await origin.seal(prepared.transactionId)

    const outcome = await resolve(target)

    expect(outcome).toMatchObject({ status: 'cleared' })
    expect(existsSync(target.statePath)).toBe(false)
    expect(existsSync(backupsOf(target, prepared.transactionId))).toBe(false)
    expect(readFileSync(join(target.desktopDir, 'package.json'), 'utf8')).toBe(POSTINSTALL['package.json'])
  })

  it('rolls back an interrupted terminal install and clears the WAL', async () => {
    const target = fixture()
    const origin = desktopStore(target, 'terminal:0001')
    await origin.begin({
      packageName: 'plugin-a',
      packageVersion: '1.0.0',
      receiptId: 'receipt-0001',
    })

    const outcome = await resolve(target)

    expect(outcome).toMatchObject({ status: 'restored' })
    expect(existsSync(target.statePath)).toBe(false)
    expect(existsSync(backupsOf(target, 'irrelevant'))).toBe(false)
    for (const name of FILES) {
      expect(readFileSync(join(target.desktopDir, name), 'utf8')).toBe(PREINSTALL[name])
    }
  })

  it('restores a cross-profile interrupted install through the transaction profile', async () => {
    const target = fixture()
    const web = new DesktopInstallRecoveryStore({
      statePath: target.statePath,
      profileName: 'web',
      profileDir: target.webDir,
      generationId: 'terminal:0001',
      now: () => 1_800_000_000_000,
    })
    await web.begin({
      packageName: 'plugin-a',
      packageVersion: '1.0.0',
      receiptId: 'receipt-0001',
    })

    const outcome = await resolve(target)

    expect(outcome).toMatchObject({ status: 'restored' })
    for (const name of FILES) {
      expect(readFileSync(join(target.webDir, name), 'utf8')).toBe(PREINSTALL[name])
    }
    expect(existsSync(target.statePath)).toBe(false)
  })

  it('reports manual recovery on third-party drift and preserves the WAL', async () => {
    const target = fixture()
    const origin = desktopStore(target, 'terminal:0001')
    await origin.begin({
      packageName: 'plugin-a',
      packageVersion: '1.0.0',
      receiptId: 'receipt-0001',
    })
    writeFileSync(join(target.desktopDir, 'package.json'), '{"external":"change"}\n', { mode: 0o640 })

    const outcome = await resolve(target)

    expect(outcome).toMatchObject({
      status: 'manual-recovery-required',
      mismatchedFiles: ['package.json'],
    })
    expect(existsSync(target.statePath)).toBe(true)
    expect(readFileSync(join(target.desktopDir, 'package.json'), 'utf8')).toBe('{"external":"change"}\n')
  })

  it('leaves launcher-owned transactions untouched as still active', async () => {
    const target = fixture()
    const origin = desktopStore(target, 'generation-0001')
    const prepared = await origin.begin({
      packageName: 'plugin-a',
      packageVersion: '1.0.0',
      receiptId: 'receipt-0001',
    })

    const outcome = await resolve(target)

    expect(outcome).toMatchObject({ status: 'still-active' })
    expect(existsSync(target.statePath)).toBe(true)
    expect(existsSync(backupsOf(target, prepared.transactionId))).toBe(true)
  })

  it('leaves an in-flight verification untouched as still active', async () => {
    const target = fixture()
    const origin = desktopStore(target, 'terminal:0001')
    const prepared = await origin.begin({
      packageName: 'plugin-a',
      packageVersion: '1.0.0',
      receiptId: 'receipt-0001',
    })
    for (const name of FILES) writeFileSync(join(target.desktopDir, name), POSTINSTALL[name], { mode: 0o640 })
    await origin.seal(prepared.transactionId)
    const restarted = desktopStore(target, 'generation-0002')
    await restarted.claim()

    const outcome = await resolve(target)

    expect(outcome).toMatchObject({ status: 'still-active' })
    expect(existsSync(target.statePath)).toBe(true)
  })
})
