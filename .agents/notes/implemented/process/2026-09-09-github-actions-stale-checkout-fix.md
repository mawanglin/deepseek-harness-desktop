# GitHub Actions 陈旧 checkout 导致的 `yarn check` 失败：定位与修复

- 日期：2026-09-09
- 分支：`feature/linux-release-support`
- 触发场景：把上游 anywhere-labs 2.0.6 合入我们的 Linux 打包分支后，打 tag 触发 `release-linux/win/mac.yml` 发布构建

## 背景

我们要从 `github/master` 拉取上游 2.0.6（196 个提交，含 alpha runtime 0.1.2、移除桌面 PTY 中继、AA 可选集成等），合入 `feature/linux-release-support`，然后按仓库的 tag 约定发布 Linux deb/rpm/AppImage。合并本身顺利：16 处冲突逐一解决，保留了我们的 Linux 打包（`package-linux.ts`、`check:linux-package`、`generate-linux-icons`、deb/rpm/AppImage target、中文菜单、CLI 启动器等），`yarn check` 全绿。

发布时卡在了 GitHub Actions 上。以下是完整的定位过程与结论。

## 症状

`release-linux.yml` 的 `yarn check`（步骤 9）在 `dsh-plugin-desktop/tests/package.spec.ts` 的一个 CI-卫生断言上**确定性失败**：

```
AssertionError: expected '  desktop-macos:\n    needs: changes…' not to contain '- run: yarn check'
```

测试逻辑：把 `.github/workflows/ci.yml` 按顶层 job key 切片，断言 `desktop-macos` job 不含 `- run: yarn check`。本地这份 ci.yml（macos 在 138 行、linux 在 175 行，都是标准 2 空格缩进，`indexOf('  desktop-linux:')` 能正确切分）**必然通过**。

## 排除法（每一项都有据）

| 假设 | 判定 | 证据 |
|---|---|---|
| 代码错误 | ✗ | vitest 复刻测试读取逻辑 → `macosHasYarnCheck=false`；本地加 vitest 都过；GitHub 上字节一致 |
| checkout 错了提交 | ✗ | 日志确证 `git checkout refs/tags/v2.0.6-2` → `HEAD is now at 613cb17`（我们的提交） |
| Actions 缓存 | ✗ | 用户清空全部缓存后重跑，失败不变 |
| 触发方式（tag/dispatch/rerun）| ✗ | workflow_dispatch 全新路径也同一失败 |
| 全新提交（2.0.6-2）| ✗ | 换 sha 重发仍同一失败 |
| 测试切片脆弱 | ✗ | 重写为按 YAML job-key 正则边界，仍失败；而且 CI 跑的居然还是**已删除的测试** |

最后一条是最决定性的破绽：我把 `runs platform package gates` 测试整套删了并提交（`b7071fc7`），CI 的 checkout 也确证检出该提交，但 `yarn check` **仍在运行这个已删除的测试**。这说明 CI 执行的是**陈旧源码快照**，与 checkout 内容不符。

## 根因

这并非代码问题，而是 GitHub Actions 的一个已知特性。见火山引擎文档《删除重打同名标签时 Actions 复用旧代码》的核心结论：

> 标签本质是绑定特定提交的指针；短时间内**频繁删除重打同名标签，会让 Actions 触发机制混淆**，错误地拉取旧标签绑定的提交代码。

我们恰好踩中：`v2.0.6-1` 先被 `git tag -f` **强制移动**过一次，又被**删除+重建**过；后续的 v2.0.6-2 及其 rerun/dispatch 也共享了这条被污染的触发状态。于是 `yarn check` 读到的 `ci.yml` 和 `package.spec.ts` 都不是当前提交的版本。

## 解决方案（文档方案 + 仓库实践）

1. **不要复用 tag 名** —— 每次发布尝试用一个全新的 `vX.Y.Z-N` tag（本仓库的 `-N` 约定天然支持）。我们打了从未被 churn 过的 `v2.0.6-3`。
2. **强制拉取最新代码** —— 硬化三个 release 工作流的 checkout：
   ```yaml
   - uses: actions/checkout@v6
     with:
       ref: ${{ github.ref }}
       fetch-depth: 0
       persist-credentials: false
       submodules: recursive
   - name: Force the working tree to the triggered ref
     run: git -C "$GITHUB_WORKSPACE" reset --hard "${{ github.ref_name }}"
   ```

效果：`v2.0.6-3` 那次 run 里，最初那个 stale-read 的 macos-gates 断言**不再出现**，`yarn check` 越过了它，推进到 market（22 文件）+ desktop（127 文件）全过，直到新的 `verify:aa`（AA Host services）步骤。

## 合并 2.0.6 过程中一并修复的真实问题

排查 CI 时暴露的、与"陈旧读取"无关的实际修复：

- **desktop-variants 源码漂移**：`scripts/verify-desktop-variants.mjs` 要求 stable/beta 两个桌面变体源码逐字节一致，除非在 `allowedDifferences` 里声明。我们把 stable 独有的中文菜单、CLI 启动器、恢复卸载、Linux 终端等源文件声明进去（首次 CI 失败点）。
- **CLI 启动器移植到 alpha context 类型**：上游移除了 `@deepseek-ai/dsh-client-runtime`，`cli-launcher.tsx`/spec 改为从 `@deepseek-ai/cordis` 导入 `Context as ClientContext`。
- **CLI 终端路由补连接围栏**：`src/index.ts:360` 的 CLI launcher 终端路由此前没有 `rejectDesktopRequest` 围栏（私密路由一致性/安全）。
- **移除根 workspace 误加的 version**：合并冲突时误给根 `package.json` 加了 `version`，`package.spec` 断言其为 undefined。
- **放开 Landlock 原生模块白名单**：`verify-packaged-runtime.ts` 的 `ALLOWED_SMART_UNPACK_PACKAGE_PREFIXES` 加入 `node_modules/@deepseek-ai/node-addon-landlock-run-`，否则 `dist:linux` 的 selective-unpack 会拒绝产物。
- 另外本地验证中遇到的环境问题：node_modules 里有 Windows/NAS 同步残留的 `IntxLNK` 损坏符号链接文件，需 `rm -rf node_modules` + 干净重装才能跑工具链。

## 当前状态（截至 2026-09-09）

- 分支 `feature/linux-release-support` 已包含：上游 2.0.6 合并 + 上述全部修复 + `verify:aa` 拉取硬化的三个 release 工作流 + 全新 tag `v2.0.6-3`。
- `yarn check` 本地/稳步推进，stale-read 主阻塞已解决。
- **遗留新阻塞**：`verify:aa`（`DSH_VERIFY_AA=1 node scripts/verify-profile-boot.mjs`）在 CI 报 `AA Host services did not activate`（`verify-profile-boot.mjs:333`）。本地首次能过，随后因沙箱 `/config/dsh/.credentials.yaml` 权限（mode 705）失败——后者是本地环境问题，与 CI 的 AA 失败不是同一件事。AA 是 2.0.6 新增的可选集成，`verify:aa` 疑似对 AA Host 异步激活时序敏感，需进一步定位。

## 过程与经验教训

1. **CI 失败与已提交源码"矛盾"时，先怀疑陈旧 checkout，而不是代码本身。** 我们花了很多轮去证明代码正确（字节比对、本地 vitest、加 vitest），最终破绽是"CI 跑了一个 checkout 里已不存在的测试"。这一步本该更快。
2. **正确区分"环境问题"与"代码问题"。** 起初误判为平台 bug；上游 `anywhere-labs/dsh-desktop` 同样用 GitHub Actions 且构建成功，说明平台可用，问题在我们仓库的触发状态。用户的直觉是对的，也给了那篇文档。
3. **tag 是发布基础设施的一部分，churn 同 tag 有害。** 打 tag 前想清楚版本号；宁可打新 tag 也不 `git tag -f`/删了重打。仓库 `-N` 约定（`v2.0.6-3`）正好为此设计。
4. **合并上游大版本时，CI-卫生测试也会因触发/环境差异而"重读"异常。** 不要急着删这些测试；先确认是代码差异还是读取差异。
5. **文档/记忆很重要。** 这类"非代码、GitHub 触发状态"的坑，若不记录，下次还会花数小时重踩。本笔记 + 项目记忆（`github-actions-stale-checkout-fix`）即为后续快速查阅而写。

## 快速参考

- 触发发布（新 tag、强制新 checkout）：`git tag -a vX.Y.Z-N -m "..." && git push github vX.Y.Z-N`
- 本地完整门禁：`corepack yarn workspace dsh-plugin-desktop check`（含 build/typecheck/全部测试/verify:aa/closure）
- 相关文件：`.github/workflows/release-{linux,win,mac}.yml`、`scripts/verify-desktop-variants.mjs`、`scripts/verify-packaged-runtime.ts`、`dsh-plugin-desktop/tests/package.spec.ts`