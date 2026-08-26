# Agent Note: Discard stale install-recovery transactions

English | [中文](2026-08-26-install-recovery-stale-discard.zh.md)

## Problem

The desktop install-recovery WAL holds exactly one transaction at a time, and
`beginLocked` refused to start any new transaction while another existed. A
transaction whose profile is not the profile being operated on can never be
resolved: the launcher only verifies or restores transactions that match the
active profile at startup, and the terminal that created it has exited once
the transaction leaves `prepared`. A stale `awaiting-restart`, `verified`, or
`rolled-back` transaction therefore blocked every later `dsh plugin add`
forever, with no recovery UI (startup `claim()` deferred profile-mismatched
transactions without a prompt) and no error detail pointing at the WAL path —
the only escape was manually deleting `state.json` and the backups directory.

## Decision

Staleness is judged by phase alone, not by profile match or creator: a
transaction in `awaiting-restart`, `verified`, or `rolled-back` holds no live
actor. The terminal that sealed it has exited, and the launcher acts on it
only at startup for a matching profile, so a transaction in one of these
phases will never be resolved when the store's profile differs (or when the
same profile is simply being operated on again before a restart). Earlier
phases — `prepared` (pnpm may still be running), `verifying`,
`recovery-pending`, `retry-requested`, and `manual-recovery-required` (the
preimages are the only repair record) — may still be owned by a live process
or a pending recovery choice and are never discarded.

`beginLocked` discards a discardable pending transaction (WAL record plus its
private preimages, profile files untouched) before starting the new install;
a non-discardable pending transaction still fails, but the error now names the
phase, profile, creating generation, and the state path to remove. `claimLocked`
does the same for profile-mismatched discardable transactions at startup,
returning `none` instead of deferring forever. Diagnostics flow through a new
optional `warn` sink on `DesktopInstallRecoveryStoreOptions`; the launcher
wires it to the Electron logger and the built-in terminal to stderr, so the
user always sees why a transaction was dropped.

## Verification

Five focused tests cover the new surface: `begin` discards a stale
`awaiting-restart` transaction for the same profile and for a different
profile (the reported deadlock), `begin` refuses an active `prepared`
transaction and preserves its preimages without warning, `claim` discards a
profile-mismatched stale transaction, and `claim` keeps deferring a
profile-mismatched transaction that may still be active. The existing WAL
suite (serialized writers, seal/verify/clear, restore paths) passes unchanged,
as does the desktop CLI suite and the package typecheck.

## Alternatives considered

**Discard by creator (`terminal:` prefix).** Misses transactions created by
the launcher for a profile that later ceased to be active, which are equally
stuck after a profile switch.

**Discard by age threshold.** A timestamp says nothing about whether a live
process still owns the transaction; phase is the only reliable signal.

**Prompt the user for every profile-mismatched transaction.** The startup
recovery window is reserved for phases that can still be rolled back or
retried; a terminal-state transaction has nothing to choose, so prompting
would be noise.

## Consequences

Back-to-back `dsh plugin add` commands no longer require an intermediate
restart: the first install's sealed transaction is discarded when the second
begins, so its post-restart verification (and the rollback it would enable on
a failed boot) is dropped — the files stay consistent and the install stands.
The same applies when a just-sealed launcher-owned Market install is
superseded by a terminal add into another profile in the same session; the
launcher's later rollback call no-ops on the missing transaction instead of
crashing. Discarding never touches profile files, so a stale transaction's
installed state is always preserved.
