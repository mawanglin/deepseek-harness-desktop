/** Cordis Host plugin exposing one-click install-recovery resolution through the native tray. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from './runtime.ts'
import { desktopTrayLabel } from './tray-locale.ts'

/** Stable Cordis plugin name. */
export const name = 'desktop-install-recovery'

/** Native adapter required to show the resolution dialogs. */
export const inject = ['desktopRuntime']

/** Register the one-click install-recovery command for one Host generation. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const registration = ctx.desktopRuntime.registerTrayItem({
      group: 'tools',
      order: 10,
      label: () => desktopTrayLabel(ctx.desktopRuntime.locale, 'resolveInstallRecovery'),
      invoke: () => ctx.desktopRuntime.resolveInstallRecovery(),
    })
    return () => { registration.dispose() }
  }, 'dsh-plugin-desktop: install recovery tray command')
}
