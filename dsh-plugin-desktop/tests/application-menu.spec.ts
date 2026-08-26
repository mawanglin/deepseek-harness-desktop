import { beforeEach, describe, expect, it, vi } from 'vitest'

const menuMock = vi.hoisted(() => ({
  setApplicationMenu: vi.fn(),
  buildFromTemplate: vi.fn((template: unknown) => template),
}))

vi.mock('electron', () => ({ Menu: menuMock }))

import {
  buildChineseApplicationMenu,
  installChineseApplicationMenu,
} from '../src/application-menu.ts'

interface MenuItemLike {
  label?: string
  role?: string
  type?: string
  submenu?: readonly MenuItemLike[]
}

function topLabels(platform: NodeJS.Platform): string[] {
  return buildChineseApplicationMenu(platform).map(item => item.label ?? '')
}

function submenuLabels(platform: NodeJS.Platform, label: string): string[] {
  const item = (buildChineseApplicationMenu(platform) as MenuItemLike[])
    .find(candidate => candidate.label === label)
  return (item?.submenu ?? []).map(child => child.type === 'separator'
    ? ''
    : child.label ?? child.role ?? '')
}

beforeEach(() => { menuMock.setApplicationMenu.mockClear() })

describe('Chinese application menu', () => {
  it('replaces the English top-level menus with Chinese labels on Linux', () => {
    expect(topLabels('linux')).toEqual(['文件', '编辑', '视图', '窗口', '帮助'])
    expect(submenuLabels('linux', '文件')).toEqual(['退出', '关闭'])
    expect(submenuLabels('linux', '编辑')).toEqual(['撤销', '重做', '', '剪切', '复制', '粘贴', '删除', '全选'])
    expect(submenuLabels('linux', '视图')).toEqual(['重新加载', '强制重新加载', '开发者工具', '', '实际大小', '放大', '缩小', '', '切换全屏'])
    expect(submenuLabels('linux', '窗口')).toEqual(['最小化', '关闭'])
    expect(submenuLabels('linux', '帮助')).toEqual(['关于 DSH Desktop'])
  })

  it('adds the application menu and macOS-only items on Darwin', () => {
    expect(topLabels('darwin')).toEqual(['DSH Desktop', '文件', '编辑', '视图', '窗口', '帮助'])
    expect(submenuLabels('darwin', 'DSH Desktop')).toEqual([
      '关于 DSH Desktop', '', '隐藏 DSH Desktop', '隐藏其他', '全部显示', '', '退出 DSH Desktop',
    ])
    expect(submenuLabels('darwin', '文件')).toEqual(['关闭窗口'])
    expect(submenuLabels('darwin', '编辑')).toContain('粘贴并匹配样式')
    expect(submenuLabels('darwin', '窗口')).toEqual(['最小化', '缩放'])
    expect(submenuLabels('darwin', '帮助')).toEqual([])
  })

  it('installs the Chinese menu on macOS and Linux but keeps Windows window-menu removal', () => {
    installChineseApplicationMenu('linux')
    expect(menuMock.buildFromTemplate).toHaveBeenCalledOnce()
    expect(menuMock.setApplicationMenu).toHaveBeenCalledOnce()

    menuMock.setApplicationMenu.mockClear()
    installChineseApplicationMenu('darwin')
    expect(menuMock.setApplicationMenu).toHaveBeenCalledOnce()

    menuMock.setApplicationMenu.mockClear()
    installChineseApplicationMenu('win32')
    expect(menuMock.setApplicationMenu).not.toHaveBeenCalled()
  })
})
