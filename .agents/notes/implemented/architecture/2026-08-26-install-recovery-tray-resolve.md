# Agent Note: One-click install-recovery resolution in the tray

English | [中文](2026-08-26-install-recovery-tray-resolve.zh.md)

## Problem

A pending install-recovery transaction blocks every later `dsh plugin add`
regardless of the targeted profile. The stale-discard fix (2.0.2-4) cleared
discardable phases automatically, but an interrupted install leaves a
`prepared` transaction that beginLocked must refuse (a live pnpm could still
be running), and the terminal error only told the user to resolve it or
remove the WAL file by hand. Users hit this repeatedly while the desktop app
was running — the startup recovery window (the only in-app fix) only appears
after a restart, and only for the active profile.

## Decision

Add a one-click "Resolve Plugin Install" command to the native tray. A new
launcher runtime method (`ElectronDesktopRuntime.resolveInstallRecovery`)
reads the WAL, classifies the pending transaction, asks for confirmation, and
acts through a pure, testable resolver (`install-recovery-resolve.ts`):

- discardable phases (awaiting-restart / verified / rolled-back) are cleared
  without touching profile files;
- terminal-created non-discardable phases (prepared / recovery-pending /
  retry-requested) are rolled back to their pre-install preimages through a
  store bound to the transaction's own profile, so a transaction for a
  non-active profile resolves too; a successful restore clears the WAL so no
  residue survives;
- transactions still owned by a live actor — `verifying`, or created by the
  launcher's own generation rather than the built-in terminal (`terminal:`
  generation prefix) — are left untouched and reported as still active;
- files matching neither the pre- nor post-image keep the existing
  conservative behavior: manual-recovery-required with the WAL path, never
  clobbered.

The tray command is a Host plugin (`install-recovery-tray.ts`) mounted through
the desktop patch, following the diagnostics tray-item pattern; dialog copy
is bilingual via the runtime locale.

## Verification

Seven focused tests cover the resolver: none, stale clear, active-profile
interrupted restore with WAL cleanup, cross-profile restore through the
transaction's own profile, third-party drift reporting manual recovery, and
launcher-owned / verifying transactions staying untouched. The full desktop
suite (74 files, 695 tests), typecheck, build, layout gate, and the loader
boot smoke all pass.

## Alternatives considered

**Auto-discard `prepared` transactions in beginLocked.** A live pnpm could
still be writing profile files; discarding would corrupt the running install.

**Roll back drift in the resolver regardless of pre/post match.** The WAL
preimages are the only repair record; overwriting third-party edits would
destroy user data.

**Add the command to the settings UI instead of the tray.** A renderer IPC
route would need new contracts and client work for no user benefit; the tray
is already the home of Desktop-owned commands.

## Consequences

Users can unblock a stuck install without restarting or touching the WAL
file: tray → Resolve Plugin Install → confirm. The command never deletes
profile files and never touches launcher-owned or in-flight transactions, so
the existing crash-recovery guarantees are unchanged. A manually edited
profile file still requires the manual-recovery path, which the dialog now
explains with the exact WAL location.
