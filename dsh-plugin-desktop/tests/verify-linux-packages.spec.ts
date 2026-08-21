import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyLinuxPackages } from '../scripts/verify-linux-packages.ts'

const temporaryRoots: string[] = []

function debianArchive(): Buffer {
  const archive = Buffer.alloc(64)
  archive.write('!<arch>\n', 0, 'ascii')
  return archive
}

function rpmPackage(): Buffer {
  const rpm = Buffer.alloc(96)
  rpm.writeUInt8(0xed, 0)
  rpm.writeUInt8(0xab, 1)
  rpm.writeUInt8(0xee, 2)
  rpm.writeUInt8(0xdb, 3)
  return rpm
}

function appImage(): Buffer {
  const image = Buffer.alloc(64)
  image.write('\x7fELF', 0, 'binary')
  image.writeUInt8(0x41, 8)
  image.writeUInt8(0x49, 9)
  image.writeUInt8(0x02, 10)
  return image
}

function fixture(version = '2.0.0'): {
  readonly root: string
  readonly deb: string
  readonly rpm: string
  readonly appImage: string
} {
  const root = mkdtempSync(join(tmpdir(), 'dsh-linux-packages-'))
  temporaryRoots.push(root)
  const dist = join(root, 'dist')
  mkdirSync(dist, { recursive: true })
  const deb = join(dist, `DSH-Desktop-${version}-x64.deb`)
  const rpm = join(dist, `DSH-Desktop-${version}-x64.rpm`)
  const appImagePath = join(dist, `DSH-Desktop-${version}-x64.AppImage`)
  writeFileSync(deb, debianArchive())
  writeFileSync(rpm, rpmPackage())
  writeFileSync(appImagePath, appImage())
  return { root, deb, rpm, appImage: appImagePath }
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('Linux package artifact verification', () => {
  it('accepts the exact versioned deb, rpm, and AppImage artifacts', () => {
    const value = fixture()

    expect(verifyLinuxPackages({ desktopRoot: value.root, version: '2.0.0' })).toEqual({
      debPath: value.deb,
      rpmPath: value.rpm,
      appImagePath: value.appImage,
    })
  })

  it('rejects a stale deb package from a different version', () => {
    const value = fixture('1.9.0')

    expect(() => verifyLinuxPackages({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('DSH-Desktop-2.0.0-x64.deb')
  })

  it('rejects a deb without the ar archive header', () => {
    const value = fixture()
    writeFileSync(value.deb, Buffer.from('not-an-archive-------', 'ascii'))

    expect(() => verifyLinuxPackages({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have a Debian ar archive header')
  })

  it('rejects an rpm without the lead signature', () => {
    const value = fixture()
    const invalid = rpmPackage()
    invalid.fill(0, 0, 4)
    writeFileSync(value.rpm, invalid)

    expect(() => verifyLinuxPackages({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have an RPM lead signature')
  })

  it('rejects an AppImage without an ELF header', () => {
    const value = fixture()
    const invalid = appImage()
    invalid.write('NOPE', 0, 'ascii')
    writeFileSync(value.appImage, invalid)

    expect(() => verifyLinuxPackages({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have an ELF header')
  })

  it('rejects an AppImage without the type-2 signature', () => {
    const value = fixture()
    const invalid = appImage()
    invalid.fill(0, 8, 11)
    writeFileSync(value.appImage, invalid)

    expect(() => verifyLinuxPackages({ desktopRoot: value.root, version: '2.0.0' }))
      .toThrow('does not have an AppImage type-2 signature')
  })
})
