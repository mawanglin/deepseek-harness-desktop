# Linux Packaging (deb/rpm/AppImage) and Release CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `dsh-plugin-desktop` CI-verified Linux `.deb`, `.rpm`, and `.AppImage` packaging (mirroring the existing Windows/macOS smoke jobs) plus a tag-triggered workflow that uploads those three artifacts to a draft GitHub Release.

**Architecture:** A new `scripts/package-linux.ts` (dependency-injection packaging boundary, mirrors `scripts/package-win.ts`) and `scripts/verify-linux-packages.ts` (byte-header verification, mirrors `scripts/verify-win-installer.ts`) drive a single `electron-builder --linux deb rpm AppImage --x64` invocation. `.github/workflows/ci.yml` gets a new `desktop-linux` smoke job that calls these through a new `dist:linux` script and never publishes anything. A new `.github/workflows/release-linux.yml`, triggered only by `v*` tag pushes and scoped to `contents: write`, reuses the same `dist:linux` script and then creates/updates a draft GitHub Release with the three artifacts via the `gh` CLI.

**Tech Stack:** TypeScript (Node ESM, run directly via `node scripts/*.ts` — this repo's Node/TS setup already supports this, see `package-win.ts`), Vitest, `electron-builder` 26.15.7 (already a `dsh-plugin-desktop` devDependency), GitHub Actions, GitHub CLI (`gh`, preinstalled on `ubuntu-latest` runners).

## Global Constraints

- Node `^22.19.0 || >=24.0.0`, Yarn `4.18.0` via Corepack (repo `CLAUDE.md`).
- All work happens on the already-created `feature/linux-packaging` branch. Never commit to `master`; this repository is a fork tracking upstream `deepseek-harness` and `master` must stay clean for future upstream syncs.
- Never edit anything under `deepseek-harness/` (pinned upstream submodule).
- Builds, typechecks, unit tests, and packaging smokes must stay headless-safe — no GUI launch.
- Follow the existing dependency-injection + TDD conventions in `dsh-plugin-desktop/scripts/package-win.ts` and `dsh-plugin-desktop/scripts/verify-win-installer.ts` exactly; do not invent a different shape.
- Linux packages are unsigned by design (no code-signing step exists for `.deb`/`.rpm`/`.AppImage` in this plan) — do not add signing-secret stripping logic that Windows/macOS need but Linux does not.
- Design source of truth: `.agents/notes/proposed/architecture/2026-08-21-linux-packaging-and-release.md` (English) / the paired `.zh.md`.

## File Structure

- `dsh-plugin-desktop/package.json` — modify: `build.linux.target`/`artifactName`, add `check:linux-package` and `dist:linux` scripts.
- `package.json` (repo root) — modify: add chained `dist:linux` script (matches the existing `dist:mac`/`dist:win` root scripts).
- `dsh-plugin-desktop/scripts/package-linux.ts` — new: injectable packaging boundary, mirrors `package-win.ts`.
- `dsh-plugin-desktop/tests/package-linux.spec.ts` — new: unit tests for the above.
- `dsh-plugin-desktop/scripts/verify-linux-packages.ts` — new: byte-header verification for the three artifacts, mirrors `verify-win-installer.ts`.
- `dsh-plugin-desktop/tests/verify-linux-packages.spec.ts` — new: unit tests for the above.
- `dsh-plugin-desktop/tests/package.spec.ts` — modify: manifest structural assertions (linux target/artifactName/scripts) and the CI-wiring assertion test (new `desktop-linux` job slice, fixed `desktop-macos` slice boundary).
- `.github/workflows/ci.yml` — modify: new `desktop-linux` job between `desktop-macos` and `upstream-command-windows`.
- `.github/workflows/release-linux.yml` — new: tag-triggered, `contents: write`-scoped, draft-release publishing workflow.
- `dsh-plugin-desktop/tests/release-linux-workflow.spec.ts` — new: YAML-parsed structural tests for the release workflow.
- `.agents/notes/proposed/architecture/2026-08-21-linux-packaging-and-release.md` + `.zh.md` — move to `.agents/notes/implemented/architecture/` and flip `Status:` once everything above lands.

---

### Task 1: Electron Builder Linux target config and package/root scripts

**Files:**
- Modify: `dsh-plugin-desktop/package.json`
- Modify: `package.json` (repo root)
- Test: `dsh-plugin-desktop/tests/package.spec.ts`

**Interfaces:**
- Produces: the `build.linux.target` array `[{ target: 'deb', arch: ['x64'] }, { target: 'rpm', arch: ['x64'] }, { target: 'AppImage', arch: ['x64'] }]` and `build.linux.artifactName` `'DSH-Desktop-${version}-${arch}.${ext}'` that Task 2's `electron-builder --linux deb rpm AppImage --x64` invocation and Task 3's `verify-linux-packages.ts` both depend on for producing/finding files named `DSH-Desktop-<version>-x64.deb` / `.rpm` / `.AppImage` in `dsh-plugin-desktop/dist/`. Also produces the `dsh-plugin-desktop` package.json scripts `check:linux-package` and `dist:linux` (the latter is `node scripts/package-linux.ts`, consumed by Task 2) and the root `dist:linux` chained script.

- [ ] **Step 1: Write the failing manifest assertions**

Open `dsh-plugin-desktop/tests/package.spec.ts`. Change the `build` type declaration around line 38:

```typescript
    linux?: { icon?: unknown }
```

to:

```typescript
    linux?: { target?: unknown; artifactName?: unknown; icon?: unknown }
```

Then replace the single existing Linux assertion around line 435:

```typescript
    expect(manifest.build?.linux?.icon).toBe('build/app-icon.png')
```

with:

```typescript
    expect(manifest.build?.linux?.target).toEqual([
      { target: 'deb', arch: ['x64'] },
      { target: 'rpm', arch: ['x64'] },
      { target: 'AppImage', arch: ['x64'] },
    ])
    expect(manifest.build?.linux?.artifactName).toBe('DSH-Desktop-${version}-${arch}.${ext}')
    expect(manifest.build?.linux?.icon).toBe('build/app-icon.png')
```

Then, in the `'separates unsigned smoke packaging from the signed macOS release'` test, immediately after this existing line:

```typescript
    expect(manifest.scripts?.['check:mac-package']).toBe('yarn run -T check')
```

insert:

```typescript
    expect(manifest.scripts?.['dist:linux']).toBe('node scripts/package-linux.ts')
    expect(manifest.scripts?.['check:linux-package']).toContain('yarn run build')
    expect(manifest.scripts?.['check:linux-package']).toContain('yarn run typecheck')
    expect(manifest.scripts?.['check:linux-package']).toContain('tests/package-linux.spec.ts')
    expect(manifest.scripts?.['check:linux-package']).toContain('tests/verify-linux-packages.spec.ts')
    expect(manifest.scripts?.['check:linux-package']).toContain('tests/release-linux-workflow.spec.ts')
    expect(manifest.scripts?.['check:linux-package']).toContain('yarn run verify:closure')
```

And immediately after this existing line (still in the same test, a few lines further down):

```typescript
    expect(workspaceManifest.scripts?.['dist:win-portable'])
      .toBe('yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:win-portable')
```

insert:

```typescript
    expect(workspaceManifest.scripts?.['dist:linux'])
      .toBe('yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:linux')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/package.spec.ts`
Expected: FAIL — the new/changed assertions do not match the current `package.json` contents (`build.linux.target` is still `["dir"]`, `dist:linux`/`check:linux-package` scripts do not exist).

- [ ] **Step 3: Update `dsh-plugin-desktop/package.json`**

Replace the existing `linux` block:

```json
    "linux": {
      "target": [
        "dir"
      ],
      "icon": "build/app-icon.png"
    }
```

with:

```json
    "linux": {
      "target": [
        {
          "target": "deb",
          "arch": [
            "x64"
          ]
        },
        {
          "target": "rpm",
          "arch": [
            "x64"
          ]
        },
        {
          "target": "AppImage",
          "arch": [
            "x64"
          ]
        }
      ],
      "artifactName": "DSH-Desktop-${version}-${arch}.${ext}",
      "icon": "build/app-icon.png"
    }
```

Then add the two new scripts. Immediately after this existing line:

```json
    "check:mac-package": "yarn run -T check",
```

insert:

```json
    "check:linux-package": "yarn run build && yarn run typecheck && vitest run tests/package.spec.ts tests/package-linux.spec.ts tests/update-checker.spec.ts tests/update-download.spec.ts tests/verify-linux-packages.spec.ts tests/verify-packaged-runtime.spec.ts tests/window-options.spec.ts tests/release-linux-workflow.spec.ts && yarn run verify:closure",
```

Then, immediately after this existing line:

```json
    "dist:win-portable": "node scripts/package-win-portable.ts",
```

insert:

```json
    "dist:linux": "node scripts/package-linux.ts",
```

- [ ] **Step 4: Update the repo-root `package.json`**

Immediately after this existing line:

```json
    "dist:win-portable": "yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:win-portable",
```

insert:

```json
    "dist:linux": "yarn workspace dsh-community-market build && yarn workspace dsh-plugin-desktop dist:linux",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/package.spec.ts`
Expected: PASS (all tests in the file, including the ones touched above)

- [ ] **Step 6: Commit**

```bash
git add package.json dsh-plugin-desktop/package.json dsh-plugin-desktop/tests/package.spec.ts
git commit -m "feat(desktop): configure electron-builder Linux deb/rpm/AppImage targets"
```

---

### Task 2: `package-linux.ts` packaging script

**Files:**
- Create: `dsh-plugin-desktop/scripts/package-linux.ts`
- Test: `dsh-plugin-desktop/tests/package-linux.spec.ts`

**Interfaces:**
- Consumes: `check:linux-package` script name and `dist:linux` invocation shape from Task 1. Mirrors `WindowsPackageOptions`/`packageWindowsArtifact` from `dsh-plugin-desktop/scripts/package-win.ts`.
- Produces: `export interface LinuxPackageOptions`, `export function packageLinuxArtifacts(options?: LinuxPackageOptions): void`, `export function createLinuxPackageOptions(): LinuxPackageOptions`. Task 3's verifier is invoked by `packageLinuxArtifacts` as a subprocess (not imported), so Task 3 has no compile-time dependency on this file. Task 5 (CI) invokes this script indirectly through the `dist:linux` script from Task 1.

- [ ] **Step 1: Write the failing test**

Create `dsh-plugin-desktop/tests/package-linux.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { packageLinuxArtifacts, type LinuxPackageOptions } from '../scripts/package-linux.ts'

interface CommandCall {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
}

function options(calls: CommandCall[], logs: string[] = []): LinuxPackageOptions {
  return {
    env: {
      PATH: '/usr/bin',
      SAFE_VALUE: 'kept',
    },
    platform: 'linux',
    arch: 'x64',
    nodeVersion: '22.23.2',
    workspaceRoot: '/repo',
    desktopRoot: '/repo/dsh-plugin-desktop',
    builderCli: '/repo/node_modules/electron-builder/cli.js',
    verifier: '/repo/dsh-plugin-desktop/scripts/verify-linux-packages.ts',
    nodeExecutable: '/usr/bin/node',
    run: (command, args, cwd, env) => {
      calls.push({ command, args: [...args], cwd, env: { ...env } })
    },
    log: message => logs.push(message),
  }
}

describe('Linux x64 packaging', () => {
  it('checks, builds unsigned deb/rpm/AppImage targets, then verifies them', () => {
    const calls: CommandCall[] = []
    const logs: string[] = []

    packageLinuxArtifacts(options(calls, logs))

    expect(calls).toHaveLength(3)
    expect(calls[0]).toEqual({
      command: 'corepack',
      args: ['yarn', 'workspace', 'dsh-plugin-desktop', 'check:linux-package'],
      cwd: '/repo',
      env: { PATH: '/usr/bin', SAFE_VALUE: 'kept' },
    })
    expect(calls[1]).toEqual({
      command: '/usr/bin/node',
      args: [
        '/repo/node_modules/electron-builder/cli.js',
        '--linux',
        'deb',
        'rpm',
        'AppImage',
        '--x64',
        '--publish',
        'never',
        '--config.npmRebuild=false',
      ],
      cwd: '/repo/dsh-plugin-desktop',
      env: { PATH: '/usr/bin', SAFE_VALUE: 'kept' },
    })
    expect(calls[2]).toEqual({
      command: '/usr/bin/node',
      args: ['/repo/dsh-plugin-desktop/scripts/verify-linux-packages.ts'],
      cwd: '/repo/dsh-plugin-desktop',
      env: { PATH: '/usr/bin', SAFE_VALUE: 'kept' },
    })
    expect(logs).toEqual([
      'Building unsigned Linux x64 deb, rpm, and AppImage artifacts; there is no Linux code-signing step.',
    ])
  })

  it('reuses a completed CI package gate when explicitly requested', () => {
    const calls: CommandCall[] = []
    const logs: string[] = []
    const value = {
      ...options(calls, logs),
      env: {
        ...options(calls).env,
        DSH_PACKAGE_CHECK_ALREADY_RAN: '1',
      },
    }

    packageLinuxArtifacts(value)

    expect(calls).toHaveLength(2)
    expect(calls[0]?.args).toEqual([
      '/repo/node_modules/electron-builder/cli.js',
      '--linux',
      'deb',
      'rpm',
      'AppImage',
      '--x64',
      '--publish',
      'never',
      '--config.npmRebuild=false',
    ])
    expect(logs).toEqual([
      'Building unsigned Linux x64 deb, rpm, and AppImage artifacts; there is no Linux code-signing step.',
      'Skipping the Linux package preflight; the CI shared gate already passed.',
    ])
  })

  it.each([
    ['darwin', 'x64', '22.23.2', 'native Linux host'],
    ['linux', 'arm64', '22.23.2', 'requires x64 Node'],
    ['linux', 'x64', '25.0.0', 'Node 22.19+ or Node 24.x'],
  ] as const)(
    'rejects unsupported host %s/%s with Node %s before running commands',
    (platform, arch, nodeVersion, message) => {
      const calls: CommandCall[] = []
      const value = { ...options(calls), platform, arch, nodeVersion }

      expect(() => packageLinuxArtifacts(value)).toThrow(message)
      expect(calls).toEqual([])
    },
  )

  it('stops before packaging when the headless check fails', () => {
    const calls: CommandCall[] = []
    const value: LinuxPackageOptions = {
      ...options(calls),
      run: (command, args, cwd, env) => {
        calls.push({ command, args: [...args], cwd, env: { ...env } })
        throw new Error('headless check failed')
      },
    }

    expect(() => packageLinuxArtifacts(value)).toThrow('headless check failed')
    expect(calls).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/package-linux.spec.ts`
Expected: FAIL with a module-resolution error — `scripts/package-linux.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `dsh-plugin-desktop/scripts/package-linux.ts`:

```typescript
/** Build unsigned Linux x64 deb, rpm, and AppImage artifacts on a native Linux host. */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Injectable native Linux packaging boundary used by focused tests. */
export interface LinuxPackageOptions {
  /** Environment inherited by the packaging command. */
  readonly env: NodeJS.ProcessEnv
  /** Platform executing the package build. */
  readonly platform: NodeJS.Platform
  /** Node architecture executing the package build. */
  readonly arch: string
  /** Node version executing the package build. */
  readonly nodeVersion: string
  /** Repository root containing the Yarn workspace. */
  readonly workspaceRoot: string
  /** Desktop package root containing electron-builder configuration. */
  readonly desktopRoot: string
  /** Absolute electron-builder CLI module. */
  readonly builderCli: string
  /** Absolute packaged-artifact verification script. */
  readonly verifier: string
  /** Node executable used to run package-local scripts. */
  readonly nodeExecutable: string
  /** Execute one packaging command. */
  readonly run: (
    command: string,
    args: readonly string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) => void
  /** Report non-secret packaging progress. */
  readonly log: (message: string) => void
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): void {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

/** Create the native packaging options for the default verifier entry point. */
export function createLinuxPackageOptions(): LinuxPackageOptions {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const workspaceRoot = resolve(desktopRoot, '..')
  const require = createRequire(import.meta.url)
  return {
    env: process.env,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    workspaceRoot,
    desktopRoot,
    builderCli: require.resolve('electron-builder/cli.js'),
    verifier: fileURLToPath(new URL('./verify-linux-packages.ts', import.meta.url)),
    nodeExecutable: process.execPath,
    run,
    log: message => console.log(message),
  }
}

/** Run the shared host and Node release gates before packaging. */
function assertLinuxPackageHost(options: LinuxPackageOptions): void {
  if (options.platform !== 'linux') {
    throw new Error('Linux deb, rpm, and AppImage artifacts must be built on a native Linux host')
  }
  if (options.arch !== 'x64') {
    throw new Error(`Linux packaging requires x64 Node; received ${options.arch}`)
  }
  const versionMatch = /^(\d+)\.(\d+)\./u.exec(options.nodeVersion)
  const major = Number(versionMatch?.[1])
  const minor = Number(versionMatch?.[2])
  if (!((major === 22 && minor >= 19) || major === 24)) {
    throw new Error(
      `Linux packaging requires Node 22.19+ or Node 24.x with bundled Corepack; received ${options.nodeVersion}`,
    )
  }
}

/** Run the gates and package unsigned x64 deb, rpm, and AppImage artifacts. */
export function packageLinuxArtifacts(
  options: LinuxPackageOptions = createLinuxPackageOptions(),
): void {
  assertLinuxPackageHost(options)

  options.log(
    'Building unsigned Linux x64 deb, rpm, and AppImage artifacts; there is no Linux code-signing step.',
  )
  if (options.env.DSH_PACKAGE_CHECK_ALREADY_RAN !== '1') {
    options.run(
      'corepack',
      ['yarn', 'workspace', 'dsh-plugin-desktop', 'check:linux-package'],
      options.workspaceRoot,
      options.env,
    )
  } else {
    options.log('Skipping the Linux package preflight; the CI shared gate already passed.')
  }
  options.run(
    options.nodeExecutable,
    [
      options.builderCli,
      '--linux',
      'deb',
      'rpm',
      'AppImage',
      '--x64',
      '--publish',
      'never',
      '--config.npmRebuild=false',
    ],
    options.desktopRoot,
    options.env,
  )
  options.run(
    options.nodeExecutable,
    [options.verifier],
    options.desktopRoot,
    options.env,
  )
}

const invokedPath = process.argv[1]
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    packageLinuxArtifacts()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/package-linux.spec.ts`
Expected: PASS (5 tests: build+verify happy path, gate-reuse, 3 host-rejection cases via `it.each`, headless-check-failure short-circuit)

- [ ] **Step 5: Commit**

```bash
git add dsh-plugin-desktop/scripts/package-linux.ts dsh-plugin-desktop/tests/package-linux.spec.ts
git commit -m "feat(desktop): add the Linux x64 deb/rpm/AppImage packaging script"
```

---

### Task 3: `verify-linux-packages.ts` verification script

**Files:**
- Create: `dsh-plugin-desktop/scripts/verify-linux-packages.ts`
- Test: `dsh-plugin-desktop/tests/verify-linux-packages.spec.ts`

**Interfaces:**
- Consumes: the artifact naming from Task 1 (`DSH-Desktop-<version>-x64.deb` / `.rpm` / `.AppImage` in `dsh-plugin-desktop/dist/`).
- Produces: `export interface LinuxPackageArtifacts { debPath, rpmPath, appImagePath }`, `export function verifyLinuxPackages(options?: LinuxPackageVerificationOptions): LinuxPackageArtifacts`, plus the exported header assertions `assertDebianPackage`, `assertRpmPackage`, `assertAppImage`. Task 2's `packageLinuxArtifacts` already references this file by path (`scripts/verify-linux-packages.ts`) as a subprocess target, not an import — no code change needed in Task 2 once this file exists.

- [ ] **Step 1: Write the failing test**

Create `dsh-plugin-desktop/tests/verify-linux-packages.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/verify-linux-packages.spec.ts`
Expected: FAIL with a module-resolution error — `scripts/verify-linux-packages.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `dsh-plugin-desktop/scripts/verify-linux-packages.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/verify-linux-packages.spec.ts`
Expected: PASS (6 tests: accept, stale version, and the four header-rejection cases)

- [ ] **Step 5: Commit**

```bash
git add dsh-plugin-desktop/scripts/verify-linux-packages.ts dsh-plugin-desktop/tests/verify-linux-packages.spec.ts
git commit -m "feat(desktop): add Linux deb/rpm/AppImage artifact verification"
```

---

### Task 4: Real end-to-end packaging run (no code changes, no commit)

This task has no failing-test cycle — it is a real-world checkpoint proving `dist:linux` actually works before wiring it into CI, using the exact tools `ubuntu-latest` will use. Nothing here gets committed.

**Files:** none (verification only).

**Interfaces:**
- Consumes: `dsh-plugin-desktop`'s `dist:linux` script from Task 1, `packageLinuxArtifacts` from Task 2, `verifyLinuxPackages` from Task 3.
- Produces: nothing new. This is a checkpoint before Task 5 wires the same command into CI.

- [ ] **Step 1: Install workspace dependencies (skip if `node_modules` already exists)**

Run: `corepack yarn install --immutable`
Expected: exits 0; populates `node_modules/` across the workspace.

- [ ] **Step 2: Install the one missing Linux packaging tool**

Run: `sudo apt-get update && sudo apt-get install -y rpm fakeroot`
Expected: exits 0. `dpkg-deb`, `ar`, and `fakeroot` are already present on this host and on `ubuntu-latest`; `rpm` (which provides `rpmbuild`) is the one electron-builder needs that is not preinstalled.

- [ ] **Step 3: Run the real packaging command**

Run: `corepack yarn workspace dsh-plugin-desktop dist:linux`
Expected: exits 0. Output ends with a line like `Linux package verification passed: /workspace/.../dsh-plugin-desktop/dist/DSH-Desktop-2.0.1-x64.deb` (version matches the current `dsh-plugin-desktop/package.json` `version` field).

- [ ] **Step 4: Confirm the three artifacts are real, distinct package formats**

Run: `file dsh-plugin-desktop/dist/DSH-Desktop-*.deb dsh-plugin-desktop/dist/DSH-Desktop-*.rpm dsh-plugin-desktop/dist/DSH-Desktop-*.AppImage`
Expected: three lines identifying a Debian binary package, an RPM package, and an ELF executable (AppImage) respectively — proving Task 1's electron-builder config, Task 2's packaging script, and Task 3's verifier all cooperate correctly against a real build, not just mocked `run()` calls.

---

### Task 5: `desktop-linux` CI smoke job

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `dsh-plugin-desktop/tests/package.spec.ts`

**Interfaces:**
- Consumes: the `dist:linux` script from Task 1, verified working end-to-end by Task 4.
- Produces: the `desktop-linux` job name and its position in `ci.yml` (between `desktop-macos` and `upstream-command-windows`), which Task 6's release workflow does not depend on (it is a separate workflow file) but which this task's own `tests/package.spec.ts` update depends on for its job-boundary string slicing.

- [ ] **Step 1: Write the failing CI-wiring assertions**

Open `dsh-plugin-desktop/tests/package.spec.ts`. Replace the existing test:

```typescript
  it('runs the full gate once before reusing native packaging outputs on Windows', () => {
    const windowsJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  desktop-windows:'),
      ciWorkflow.indexOf('  desktop-macos:'),
    )
    const macosJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  desktop-macos:'),
      ciWorkflow.indexOf('  upstream-command-windows:'),
    )

    expect(windowsJob).toContain('- run: yarn check')
    expect(windowsJob).toContain('run: yarn workspace dsh-plugin-desktop dist:win')
    expect(windowsJob).toContain('run: yarn workspace dsh-plugin-desktop dist:win-portable')
    expect(windowsJob).toContain('DSH_PACKAGE_CHECK_ALREADY_RAN: \'1\'')
    expect(macosJob).not.toContain('- run: yarn workspace dsh-community-market check')
    expect(macosJob).toContain('- run: yarn check')
    expect(macosJob).toContain('run: yarn workspace dsh-plugin-desktop dist:mac-smoke')
    expect(macosJob).toContain('DSH_PACKAGE_CHECK_ALREADY_RAN: \'1\'')
    expect(macosJob).not.toContain('- run: yarn dist:mac-smoke')
  })
```

with:

```typescript
  it('runs the full gate once before reusing native packaging outputs on Windows', () => {
    const windowsJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  desktop-windows:'),
      ciWorkflow.indexOf('  desktop-macos:'),
    )
    const macosJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  desktop-macos:'),
      ciWorkflow.indexOf('  desktop-linux:'),
    )
    const linuxJob = ciWorkflow.slice(
      ciWorkflow.indexOf('  desktop-linux:'),
      ciWorkflow.indexOf('  upstream-command-windows:'),
    )

    expect(windowsJob).toContain('- run: yarn check')
    expect(windowsJob).toContain('run: yarn workspace dsh-plugin-desktop dist:win')
    expect(windowsJob).toContain('run: yarn workspace dsh-plugin-desktop dist:win-portable')
    expect(windowsJob).toContain('DSH_PACKAGE_CHECK_ALREADY_RAN: \'1\'')
    expect(macosJob).not.toContain('- run: yarn workspace dsh-community-market check')
    expect(macosJob).toContain('- run: yarn check')
    expect(macosJob).toContain('run: yarn workspace dsh-plugin-desktop dist:mac-smoke')
    expect(macosJob).toContain('DSH_PACKAGE_CHECK_ALREADY_RAN: \'1\'')
    expect(macosJob).not.toContain('- run: yarn dist:mac-smoke')
    expect(linuxJob).toContain('runs-on: ubuntu-latest')
    expect(linuxJob).toContain('apt-get install -y rpm')
    expect(linuxJob).toContain('- run: yarn check')
    expect(linuxJob).toContain('run: yarn workspace dsh-plugin-desktop dist:linux')
    expect(linuxJob).toContain('DSH_PACKAGE_CHECK_ALREADY_RAN: \'1\'')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/package.spec.ts`
Expected: FAIL — `ciWorkflow.indexOf('  desktop-linux:')` returns `-1`, so `linuxJob` is an empty/garbage slice and its assertions fail.

- [ ] **Step 3: Add the `desktop-linux` job to `.github/workflows/ci.yml`**

Find this text (the end of the `desktop-macos` job, immediately followed by the `upstream-command-windows` job's leading comment):

```yaml
      - name: Build macOS smoke artifact
        env:
          DSH_PACKAGE_CHECK_ALREADY_RAN: '1'
        run: yarn workspace dsh-plugin-desktop dist:mac-smoke

  # Upstream toolchain smoke: the portable-shell scripts must resolve the
  # pinned submodule's own Yarn/pnpm release on Windows.
  upstream-command-windows:
```

Replace it with:

```yaml
      - name: Build macOS smoke artifact
        env:
          DSH_PACKAGE_CHECK_ALREADY_RAN: '1'
        run: yarn workspace dsh-plugin-desktop dist:mac-smoke

  # Linux packaging smoke: deb, rpm, and AppImage produced by one
  # electron-builder invocation on a real Linux runner. Distributable
  # releases are published separately by release-linux.yml on a version
  # tag; this job only proves the packaging pipeline itself is not broken.
  desktop-linux:
    needs: changes
    if: needs.changes.outputs.product == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
          submodules: recursive
      - uses: actions/setup-node@v6
        with:
          node-version: 22.23.2
      - run: corepack enable
      - name: Install rpmbuild
        run: sudo apt-get update && sudo apt-get install -y rpm
      - name: Resolve Yarn cache folder
        id: yarn-cache
        run: echo "dir=$(yarn config get cacheFolder)" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v6
        with:
          path: ${{ steps.yarn-cache.outputs.dir }}
          key: yarn-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('yarn.lock', '.yarnrc.yml') }}
      - run: yarn install --immutable
      - run: yarn check
      - name: Build Linux deb, rpm, and AppImage
        env:
          DSH_PACKAGE_CHECK_ALREADY_RAN: '1'
        run: yarn workspace dsh-plugin-desktop dist:linux

  # Upstream toolchain smoke: the portable-shell scripts must resolve the
  # pinned submodule's own Yarn/pnpm release on Windows.
  upstream-command-windows:
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/package.spec.ts`
Expected: PASS

- [ ] **Step 5: Validate the workflow YAML parses**

Run: `cd dsh-plugin-desktop && corepack yarn node -e "require('yaml').parse(require('fs').readFileSync('../.github/workflows/ci.yml', 'utf8')); console.log('ci.yml parses OK')"`
Expected: prints `ci.yml parses OK` (catches indentation mistakes the substring test would miss)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml dsh-plugin-desktop/tests/package.spec.ts
git commit -m "ci(desktop): add a Linux deb/rpm/AppImage packaging smoke job"
```

---

### Task 6: `release-linux.yml` tag-triggered release workflow

**Files:**
- Create: `.github/workflows/release-linux.yml`
- Test: `dsh-plugin-desktop/tests/release-linux-workflow.spec.ts`

**Interfaces:**
- Consumes: the `dist:linux` script from Task 1, verified end-to-end by Task 4.
- Produces: the `release-linux` job name and the `.github/workflows/release-linux.yml` path, referenced only by this task's own test.

- [ ] **Step 1: Write the failing test**

Create `dsh-plugin-desktop/tests/release-linux-workflow.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface WorkflowStep {
  readonly name?: string
  readonly run?: string
  readonly env?: Record<string, unknown>
}

interface WorkflowJob {
  readonly 'runs-on'?: string
  readonly steps?: readonly WorkflowStep[]
}

interface ReleaseWorkflow {
  readonly on?: { push?: { tags?: readonly string[] } }
  readonly permissions?: { contents?: string }
  readonly jobs?: Record<string, WorkflowJob>
}

const workflowPath = new URL('../../.github/workflows/release-linux.yml', import.meta.url)
const workflow = parse(readFileSync(workflowPath, 'utf8')) as ReleaseWorkflow

describe('Linux release workflow', () => {
  it('triggers only on version tags with write-scoped contents permission', () => {
    expect(workflow.on?.push?.tags).toEqual(['v*'])
    expect(workflow.permissions).toEqual({ contents: 'write' })
  })

  it('installs rpmbuild, runs the full gate, and packages all three Linux targets', () => {
    const job = workflow.jobs?.['release-linux']
    expect(job?.['runs-on']).toBe('ubuntu-latest')
    const steps = job?.steps ?? []
    expect(steps.some(step => step.run?.includes('apt-get install -y rpm'))).toBe(true)
    expect(steps.some(step => step.run === 'yarn check')).toBe(true)
    const packageStep = steps.find(
      step => step.run === 'yarn workspace dsh-plugin-desktop dist:linux',
    )
    expect(packageStep).toBeDefined()
    expect(packageStep?.env?.DSH_PACKAGE_CHECK_ALREADY_RAN).toBe('1')
  })

  it('creates a draft release only when missing, then uploads all three artifacts', () => {
    const job = workflow.jobs?.['release-linux']
    const publishStep = job?.steps?.find(
      step => step.name === "Publish to the tag's GitHub Release",
    )
    expect(publishStep?.run).toContain('gh release create "$tag"')
    expect(publishStep?.run).toContain('--draft')
    expect(publishStep?.run).toContain('gh release upload "$tag"')
    expect(publishStep?.run).toContain('DSH-Desktop-*.deb')
    expect(publishStep?.run).toContain('DSH-Desktop-*.rpm')
    expect(publishStep?.run).toContain('DSH-Desktop-*.AppImage')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/release-linux-workflow.spec.ts`
Expected: FAIL with an `ENOENT` reading `.github/workflows/release-linux.yml` — the file does not exist yet.

- [ ] **Step 3: Create `.github/workflows/release-linux.yml`**

```yaml
name: Release Linux packages

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

env:
  DSH_TELEMETRY_DISABLED: '1'

jobs:
  release-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
          submodules: recursive
      - uses: actions/setup-node@v6
        with:
          node-version: 22.23.2
      - run: corepack enable
      - name: Install rpmbuild
        run: sudo apt-get update && sudo apt-get install -y rpm
      - name: Resolve Yarn cache folder
        id: yarn-cache
        run: echo "dir=$(yarn config get cacheFolder)" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v6
        with:
          path: ${{ steps.yarn-cache.outputs.dir }}
          key: yarn-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('yarn.lock', '.yarnrc.yml') }}
      - run: yarn install --immutable
      - run: yarn check
      - name: Build Linux deb, rpm, and AppImage
        env:
          DSH_PACKAGE_CHECK_ALREADY_RAN: '1'
        run: yarn workspace dsh-plugin-desktop dist:linux
      - name: Publish to the tag's GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          tag="${GITHUB_REF#refs/tags/}"
          if ! gh release view "$tag" --repo "$GITHUB_REPOSITORY" >/dev/null 2>&1; then
            gh release create "$tag" --repo "$GITHUB_REPOSITORY" --draft --title "$tag" --generate-notes
          fi
          gh release upload "$tag" --repo "$GITHUB_REPOSITORY" --clobber \
            dsh-plugin-desktop/dist/DSH-Desktop-*.deb \
            dsh-plugin-desktop/dist/DSH-Desktop-*.rpm \
            dsh-plugin-desktop/dist/DSH-Desktop-*.AppImage
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd dsh-plugin-desktop && corepack yarn vitest run tests/release-linux-workflow.spec.ts`
Expected: PASS (3 tests: trigger/permissions, packaging steps, publish step)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release-linux.yml dsh-plugin-desktop/tests/release-linux-workflow.spec.ts
git commit -m "ci(desktop): publish Linux deb/rpm/AppImage to a draft GitHub Release on tag push"
```

---

### Task 7: Promote the design note and run the full gate

**Files:**
- Move: `.agents/notes/proposed/architecture/2026-08-21-linux-packaging-and-release.md` → `.agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.md`
- Move: `.agents/notes/proposed/architecture/2026-08-21-linux-packaging-and-release.zh.md` → `.agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.zh.md`

**Interfaces:** none — this task only updates documentation status and runs a final full-repo verification. No new exports.

- [ ] **Step 1: Move the note files**

```bash
git mv .agents/notes/proposed/architecture/2026-08-21-linux-packaging-and-release.md \
  .agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.md
git mv .agents/notes/proposed/architecture/2026-08-21-linux-packaging-and-release.zh.md \
  .agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.zh.md
```

- [ ] **Step 2: Flip the status line in the English note**

In `.agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.md`, change:

```markdown
Status: proposed
```

to:

```markdown
Status: implemented
```

- [ ] **Step 3: Flip the status line in the Chinese note**

In `.agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.zh.md`, change:

```markdown
状态：proposed（待实现）
```

to:

```markdown
状态：implemented（已实现）
```

- [ ] **Step 4: Run the full repository gate**

Run: `corepack yarn check`
Expected: PASS — this runs `check:layout`, then `check` for `dsh-community-fabric`, `dsh-community-market`, and `dsh-plugin-desktop` (build, typecheck, `vitest run`, and the verify:* scripts), covering every file touched by Tasks 1–6 together, not just each task's own targeted spec file.

- [ ] **Step 5: Confirm the working tree is clean and on the feature branch**

Run: `git status`
Expected: `On branch feature/linux-packaging`, nothing to commit (working tree clean) — everything from Steps 1–3 above and Tasks 1–6 has been committed.

- [ ] **Step 6: Commit the note promotion**

```bash
git add .agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.md \
  .agents/notes/implemented/architecture/2026-08-21-linux-packaging-and-release.zh.md
git commit -m "docs(desktop): mark the Linux packaging and release design as implemented"
```

- [ ] **Step 7: Report status to the user — do not push**

`master` was never touched; every commit above is on `feature/linux-packaging`. Do not run `git push` or open a pull request without the user's explicit go-ahead, per this session's "confirm before actions visible to others" rule — pushing a branch and opening a PR are both visible, shared-state actions.
