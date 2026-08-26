# Agent Note: 托盘一键修复插件安装事务

English | [中文](2026-08-26-install-recovery-tray-resolve.zh.md)

## 问题

任何待决的安装恢复事务都会拦住之后所有的 `dsh plugin add`，无论目标 profile 是哪个。陈旧事务清理修复（2.0.2-4）自动清掉了可丢弃阶段，但被中断的安装会留下 `prepared` 事务——beginLocked 必须拒绝它（pnpm 可能仍在运行），终端报错只告诉用户"自行处理或删除 WAL 文件"。用户在实际使用中反复遇到这个问题，而且是在桌面应用运行时——唯一的应用内修复（启动恢复窗口）要等重启才出现，且只针对激活 profile。

## 决策

在原生托盘新增"修复插件安装事务"一键命令。新的 launcher 运行时方法（`ElectronDesktopRuntime.resolveInstallRecovery`）读取 WAL、对待决事务分类、请求确认后执行，逻辑落在纯粹可测试的解析器（`install-recovery-resolve.ts`）中：

- 可丢弃阶段（awaiting-restart / verified / rolled-back）直接清除，不动 profile 文件；
- 终端创建的非可丢弃阶段（prepared / recovery-pending / retry-requested）通过绑定事务自身 profile 的 store 回滚到安装前 preimages，因此非激活 profile 的事务也能解决；恢复成功后清除 WAL，不留残留；
- 仍被活跃操作者持有的事务——`verifying`，或由 launcher 自己的代次（而非内置终端的 `terminal:` 前缀代次）创建——保持不动并报告"仍在进行"；
- 既不匹配 pre- 也不匹配 post- 镜像的文件沿用保守行为：manual-recovery-required 并给出 WAL 路径，绝不覆盖。

托盘命令是 Host 插件（`install-recovery-tray.ts`），通过桌面 patch 挂载，沿用 diagnostics 托盘项模式；对话框文案按运行时 locale 中英双语。

## 验证

七个聚焦测试覆盖解析器：无事务、陈旧清除、激活 profile 中断安装回滚并清 WAL、经事务自身 profile 的跨 profile 回滚、第三方漂移报 manual-recovery-required、launcher 持有与 verifying 事务保持不动。完整桌面套件（74 个文件、695 个测试）、typecheck、build、layout 门禁与 loader 启动冒烟全部通过。

## 备选方案

**beginLocked 自动丢弃 `prepared` 事务。** pnpm 可能仍在写 profile 文件，丢弃会破坏运行中的安装。

**解析器无视 pre/post 匹配直接回滚漂移。** WAL preimages 是唯一的修复记录，覆盖第三方编辑会毁掉用户数据。

**把命令放进设置 UI 而非托盘。** renderer IPC 路由需要新契约和客户端改动，对用户没有额外收益；托盘本来就是桌面自有命令的位置。

## 后果

用户无需重启、无需手碰 WAL 文件即可解锁卡住的安装：托盘 → 修复插件安装事务 → 确认。该命令从不删除 profile 文件，也从不触碰 launcher 持有或在途的事务，原有崩溃恢复保证不变。手动编辑过的 profile 文件仍走 manual-recovery 路径，对话框会说明确切的 WAL 位置。
