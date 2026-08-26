# Agent Note: 丢弃陈旧的插件安装恢复事务

English | [中文](2026-08-26-install-recovery-stale-discard.zh.md)

## 问题

桌面安装恢复 WAL 同一时刻只保存一个事务，而 `beginLocked` 在存在任何事务时都拒绝开启新事务。一个 profile 与当前操作对象不匹配的事务永远无法被收尾：启动器只在启动时验证/恢复与激活 profile 匹配的事务，而创建它的终端进程在事务离开 `prepared` 阶段后已经退出。因此一个陈旧的 `awaiting-restart`、`verified` 或 `rolled-back` 事务会永久卡死之后的每一次 `dsh plugin add`：启动 `claim()` 对 profile 不匹配的事务只 defer 不弹任何恢复窗口，报错也不指明 WAL 路径——唯一的出路是手动删除 `state.json` 和 backups 目录。

## 决策

陈旧性只按阶段判定，不按 profile 匹配或创建者判定：处于 `awaiting-restart`、`verified`、`rolled-back` 的事务没有存活的操作者。封存它的终端已经退出，启动器只会在启动时对匹配的 profile 操作它，所以当 store 的 profile 不同（或同一 profile 在重启前再次被操作）时，这些阶段的事务永远不会被解决。更早的阶段——`prepared`（pnpm 可能仍在运行）、`verifying`、`recovery-pending`、`retry-requested`，以及 `manual-recovery-required`（preimages 是唯一的修复记录）——可能仍被存活进程或待决的恢复选择持有，绝不丢弃。

`beginLocked` 在开始新安装前会丢弃可丢弃的待决事务（WAL 记录及其私有 preimages，不动 profile 文件）；不可丢弃的待决事务仍然失败，但报错现在会指明阶段、profile、创建代次和需要删除的 state 路径。`claimLocked` 在启动时对 profile 不匹配的可丢弃事务做同样处理，返回 `none` 而不是永久 defer。诊断信息通过 `DesktopInstallRecoveryStoreOptions` 新增的可选 `warn` 回调输出：启动器接到 Electron 日志器，内置终端接到 stderr，用户始终能看到事务被丢弃的原因。

## 验证

五个聚焦测试覆盖新行为：`begin` 丢弃同 profile 和不同 profile（即上报的死锁场景）的陈旧 `awaiting-restart` 事务；`begin` 拒绝活跃的 `prepared` 事务并保留其 preimages 且不告警；`claim` 丢弃 profile 不匹配的陈旧事务；`claim` 继续 defer 可能仍活跃的 profile 不匹配事务。原有 WAL 套件（并发写者、seal/verify/clear、restore 路径）与桌面 CLI 套件、包 typecheck 均原样通过。

## 备选方案

**按创建者（`terminal:` 前缀）丢弃。** 会漏掉启动器为后来不再激活的 profile 创建的事务——profile 切换后它们同样卡死。

**按年龄阈值丢弃。** 时间戳无法说明是否有存活进程仍持有事务；阶段是唯一可靠的信号。

**对每个 profile 不匹配的事务都弹窗。** 启动恢复窗口只保留给仍可回滚或重试的阶段；终态事务没有可选操作，弹窗只会是噪音。

## 后果

连续多次 `dsh plugin add` 不再需要中间重启：第二次 begin 会丢弃第一次安装已封存的事务，因此它在重启后的验证（以及启动失败时基于它的回滚能力）被放弃——文件保持一致，安装本身保留。同理，同一会话内刚封存的启动器所属 Market 安装在被另一个 profile 的终端 add 取代时，启动器之后的回滚调用会对缺失事务安全 no-op 而不是崩溃。丢弃从不触碰 profile 文件，因此陈旧事务的已安装状态始终保留。
