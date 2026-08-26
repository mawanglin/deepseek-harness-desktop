/** Global styles for the sidebar DSH CLI launcher. */

const STYLE_ID = 'dsh-cli-launcher'

/**
 * Wide mode stacks footer actions so the CLI launcher sits above the plugin
 * market instead of sharing its flex row; the rail keeps inline icon layout.
 * The footer-actions container is an upstream CSS-module class whose compiled
 * name still contains the `footerActions` fragment, and the wide marker comes
 * from this component's own `data-wide` attribute.
 */
export const cliLauncherStylesCss = `
[class*="footerActions"]:has(.dshCliLauncher[data-wide="true"]) {
  flex-direction: column;
}
.dshCliLauncher {
  flex: none;
  box-sizing: border-box;
  width: calc(100% + 4px);
  height: 42px;
  margin: 4px -2px;
  padding: 0 10px 0 8px;
  gap: 8px;
  justify-content: flex-start;
  overflow: hidden;
  border-radius: 12px;
  white-space: nowrap;
}
.dshCliLauncher[data-wide="false"] {
  width: 36px;
  height: 36px;
  margin: 8px 8px 10px 0;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: 50%;
}
`

/** Install the launcher styles once and return their removal. */
export function installCliLauncherStyles(): () => void {
  const existing = document.querySelector<HTMLStyleElement>(`style[data-plugin="${STYLE_ID}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = STYLE_ID
  style.textContent = cliLauncherStylesCss
  document.head.append(style)
  return () => { style.remove() }
}
