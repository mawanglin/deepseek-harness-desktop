/** Verify the unsigned Linux x64 deb, rpm, and AppImage artifacts. */

import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEB_MAGIC = Buffer.from('!<arch>\n', 'ascii')
const RPM_LEAD_MAGIC = Buffer.from([0xed, 0xab, 0xee, 0xdb])
const APPIMAGE_ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46])
const APPIMAGE_TYPE2_MAGIC = Buffer.from([0x41, 0x49, 0x02])

function readHeader(path: string, label: string, length: number): Buffer {
  const stat = statSync(path)
  if (!stat.isFile() || stat.size < length) {
    throw new Error(`${label} is not a non-empty regular file: ${path}`)
  }
  const descriptor = openSync(path, 'r')
  const header = Buffer.alloc(length)
  try {
    const bytesRead = readSync(descriptor, header, 0, length, 0)
    if (bytesRead !== length) {
      throw new Error(`${label} is shorter than its required header: ${path}`)
    }
  } finally {
    closeSync(descriptor)
  }
  return header
}

/** Verify that a generated artifact has a valid Debian `ar` archive header. */
export function assertDebianPackage(path: string, label: string): void {
  const header = readHeader(path, label, DEB_MAGIC.byteLength)
  if (!header.equals(DEB_MAGIC)) {
    throw new Error(`${label} does not have a Debian ar archive header: ${path}`)
  }
}

/** Verify that a generated artifact has a valid RPM lead signature. */
export function assertRpmPackage(path: string, label: string): void {
  const header = readHeader(path, label, RPM_LEAD_MAGIC.byteLength)
  if (!header.equals(RPM_LEAD_MAGIC)) {
    throw new Error(`${label} does not have an RPM lead signature: ${path}`)
  }
}

/** Verify that a generated artifact has a valid ELF header and AppImage type-2 magic. */
export function assertAppImage(path: string, label: string): void {
  const header = readHeader(path, label, 11)
  if (!header.subarray(0, 4).equals(APPIMAGE_ELF_MAGIC)) {
    throw new Error(`${label} does not have an ELF header: ${path}`)
  }
  if (!header.subarray(8, 11).equals(APPIMAGE_TYPE2_MAGIC)) {
    throw new Error(`${label} does not have an AppImage type-2 signature: ${path}`)
  }
}

/** Paths returned after Linux package verification succeeds. */
export interface LinuxPackageArtifacts {
  /** Debian package path. */
  readonly debPath: string
  /** RPM package path. */
  readonly rpmPath: string
  /** AppImage path. */
  readonly appImagePath: string
}

/** Injectable Linux package verification boundary. */
export interface LinuxPackageVerificationOptions {
  /** Desktop package root containing package.json and dist. */
  readonly desktopRoot: string
  /** Product version embedded in the expected artifact names. */
  readonly version: string
}

function readVersion(desktopRoot: string): string {
  const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
    version?: unknown
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`desktop package at ${desktopRoot} has no valid version`)
  }
  return manifest.version
}

function defaultOptions(): LinuxPackageVerificationOptions {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  return {
    desktopRoot,
    version: readVersion(desktopRoot),
  }
}

/**
 * Verify the exact deb, rpm, and AppImage artifacts for the current product version.
 * @param options - Artifact root and expected product version.
 * @returns The verified artifact paths.
 */
export function verifyLinuxPackages(
  options: LinuxPackageVerificationOptions = defaultOptions(),
): LinuxPackageArtifacts {
  const distDir = join(options.desktopRoot, 'dist')
  const debPath = join(distDir, `DSH-Desktop-${options.version}-x64.deb`)
  const rpmPath = join(distDir, `DSH-Desktop-${options.version}-x64.rpm`)
  const appImagePath = join(distDir, `DSH-Desktop-${options.version}-x64.AppImage`)

  assertDebianPackage(debPath, 'Linux deb package')
  assertRpmPackage(rpmPath, 'Linux rpm package')
  assertAppImage(appImagePath, 'Linux AppImage')
  return { debPath, rpmPath, appImagePath }
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    const verified = verifyLinuxPackages()
    console.log(`Linux package verification passed: ${verified.debPath}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
