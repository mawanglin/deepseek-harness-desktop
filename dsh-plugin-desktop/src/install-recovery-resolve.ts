/**
 * One-click resolution of a pending plugin install-recovery transaction.
 *
 * The WAL is global, so any pending transaction blocks every later
 * `dsh plugin add` regardless of the targeted profile. This module turns the
 * terminal's "another plugin install recovery transaction is pending" failure
 * into a safe, user-triggered resolution:
 *
 * - discardable phases (awaiting-restart / verified / rolled-back) hold no
 *   live actor and are discarded without touching profile files;
 * - terminal-created non-discardable phases (prepared / recovery-pending /
 *   retry-requested) are rolled back to their pre-install preimages through a
 *   store bound to the transaction's own profile, so a mismatched profile
 *   resolves too;
 * - transactions still owned by a live actor (verifying, or created by the
 *   launcher's own generation rather than the built-in terminal) are left
 *   untouched and reported as still active.
 * @module @deepseek-ai/dsh-plugin-desktop/install-recovery-resolve
 */

import { randomUUID } from 'node:crypto'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import {
  DesktopInstallRecoveryStore,
  isStaleDiscardablePhase,
  type DesktopInstallRecoveryFilename,
  type DesktopInstallRecoveryTransaction,
} from './install-recovery.ts'

/** Generation prefix minted by the built-in terminal for every manual add. */
const TERMINAL_GENERATION_PREFIX = 'terminal:'

/** One user-triggered resolution outcome for the pending transaction. */
export type DesktopInstallRecoveryResolveOutcome =
  | { readonly status: 'none' }
  | { readonly status: 'cleared'; readonly transaction: DesktopInstallRecoveryTransaction }
  | { readonly status: 'restored'; readonly transaction: DesktopInstallRecoveryTransaction }
  | {
      readonly status: 'manual-recovery-required'
      readonly transaction: DesktopInstallRecoveryTransaction
      readonly mismatchedFiles: readonly DesktopInstallRecoveryFilename[]
    }
  | { readonly status: 'still-active'; readonly transaction: DesktopInstallRecoveryTransaction }
  | { readonly status: 'failed'; readonly message: string }

/** Inputs for one one-click install-recovery resolution. */
export interface ResolvePendingInstallRecoveryOptions {
  /** Absolute Desktop-private WAL path. */
  readonly statePath: string
  /** Harness home used to derive any transaction's own profile directory. */
  readonly homeDir: string
  /** Active profile binding used for the read probe. */
  readonly activeProfileName: string
  /** Absolute directory of the active profile. */
  readonly activeProfileDir: string
  readonly now?: () => number
}

/**
 * Resolve the pending install-recovery transaction, or report none.
 * @param options - WAL path, harness home, and active profile identity.
 * @returns the resolution outcome; profile files are only ever restored, never
 * deleted, and transactions with a live actor are left untouched.
 */
export async function resolvePendingInstallRecovery(
  options: ResolvePendingInstallRecoveryOptions,
): Promise<DesktopInstallRecoveryResolveOutcome> {
  const probe = new DesktopInstallRecoveryStore({
    statePath: options.statePath,
    profileName: options.activeProfileName,
    profileDir: options.activeProfileDir,
    generationId: `resolve:${randomUUID()}`,
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  const state = await probe.read()
  if (state === undefined) return { status: 'none' }
  if (isStaleDiscardablePhase(state.phase)) {
    const discarded = await probe.discardStalePending()
    return discarded === undefined
      ? { status: 'cleared', transaction: state }
      : { status: 'cleared', transaction: discarded }
  }
  if (state.phase === 'verifying') {
    return { status: 'still-active', transaction: state }
  }
  if (!state.createdByGeneration.startsWith(TERMINAL_GENERATION_PREFIX)) {
    return { status: 'still-active', transaction: state }
  }
  const transactionStore = new DesktopInstallRecoveryStore({
    statePath: options.statePath,
    profileName: state.profileName,
    profileDir: resolveProfileDir(state.profileName, options.homeDir),
    generationId: `resolve:${randomUUID()}`,
    ...(options.now === undefined ? {} : { now: options.now }),
  })
  try {
    const result = await transactionStore.restore(state.transactionId, 'install-failed')
    if (result.status === 'manual-recovery-required') {
      return {
        status: 'manual-recovery-required',
        transaction: result.transaction,
        mismatchedFiles: result.mismatchedFiles,
      }
    }
    await transactionStore.clear(state.transactionId)
    return { status: 'restored', transaction: result.transaction }
  } catch (cause) {
    return {
      status: 'failed',
      message: cause instanceof Error ? cause.message : String(cause),
    }
  }
}
