import { Menu } from 'electron'

/** Build the Chinese application menu that replaces Electron's English defaults. */
export function buildChineseApplicationMenu(
  platform: NodeJS.Platform,
): Electron.MenuItemConstructorOptions[] {
  const isMac = platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: 'DSH Desktop',
      submenu: [
        { role: 'about', label: '关于 DSH Desktop' },
        { type: 'separator' as const },
        { role: 'hide', label: '隐藏 DSH Desktop' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' as const },
        { role: 'quit', label: '退出 DSH Desktop' },
      ],
    }] as Electron.MenuItemConstructorOptions[] : []),
    {
      label: '文件',
      submenu: [
        ...(isMac ? [] : [{ role: 'quit' as const, label: '退出' }]),
        { role: 'close', label: isMac ? '关闭窗口' : '关闭' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' as const },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        ...(isMac ? [{ role: 'pasteAndMatchStyle' as const, label: '粘贴并匹配样式' }] : []),
        { role: 'delete', label: '删除' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' as const },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' as const },
        { role: 'togglefullscreen', label: '切换全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        ...(isMac ? [{ role: 'zoom' as const, label: '缩放' }] : []),
        ...(isMac ? [] : [{ role: 'close' as const, label: '关闭' }]),
      ],
    },
    {
      label: '帮助',
      submenu: [
        ...(isMac ? [] : [{ role: 'about' as const, label: '关于 DSH Desktop' }]),
      ],
    },
  ]
  return template
}

/**
 * Install the Chinese application menu on platforms that show a menu bar.
 * @param platform - active Electron platform; Windows keeps its window-menu removal.
 */
export function installChineseApplicationMenu(platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') return
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildChineseApplicationMenu(platform)))
}
