# Agent Note：Linux 打包（deb/rpm/AppImage）与发布

状态：implemented（已实现）

[English](2026-08-21-linux-packaging-and-release.md) | 中文

## 问题

目前 CI 只为 Windows 和 macOS 产出打包 smoke 产物。`desktop-windows` 在 `windows-latest` 上构建未签名的 NSIS 安装包和便携版压缩包；`desktop-macos` 在 `macos-latest` 上构建未签名的通用 DMG，用于在手动签名发布之前提前暴露打包回归。`dsh-plugin-desktop` 的 `package.json` 里 `build.linux.target` 是 `["dir"]`，这只是一个"未打包目录"占位配置，`package-dir.mjs` 已经依赖它来支撑 `yarn check` 用的、与平台无关的 `--dir` 校验构建。没有任何 workflow 会构建 `.deb`、`.rpm` 或 AppImage，仓库内也没有任何机制能把桌面产物发布到用户可下载的地方：现有的"发布"只是 `release-mac.ts` 在本地构建签名产物，再手动更新一个 Redis key，供 `dshdesktop.cn` 的版本检查服务读取。而这个服务、以及依赖它的应用内更新检查器，目前明确只支持 Windows/macOS（见[《桌面发布发现与终端环境》](2026-08-15-desktop-release-discovery-and-terminal.zh.md)）；Linux "保留兼容性，但在单独的平台设计落地之前，既没有安装包下载路径，也没有桌面终端"。

## 决策

Linux 打包沿用 Windows/macOS 已经确立的"CI smoke + 手动或 tag 触发发布"模式，但严格限定在这个仓库能力范围内：GitHub Actions 和 GitHub Releases。它不涉及 `dshdesktop.cn` 或应用内更新检查器，那部分集成留给未来单独的平台设计。

**Electron Builder 配置。** `dsh-plugin-desktop/package.json` 的 `build.linux.target` 从 `["dir"]` 改为产出 `deb`、`rpm`、`AppImage` 三种格式的列表，仅 x64（与现有 Windows job 的 x64-only 范围一致）。`package-dir.mjs` 调用的是 `electron-builder --dir`，这个参数会为当前宿主平台覆盖任何已配置的 target 为 `dir`，所以这次改动不影响现有 `yarn check` 用的校验构建。`build.linux.artifactName` 直接写死字面量 `x64`（`DSH-Desktop-${version}-x64.${ext}`），而不是像 Windows 那样用 `${arch}` 宏——一次真实的 `dist:linux` 构建发现这个宏在 Linux 上会按目标格式解析成各自的系统原生标签（AppImage 是 `x86_64`，deb 是 `amd64`），而不是字面量 `x64`，如果不处理会导致三个产物各自用一套不一致的命名。`build.linux.maintainer` 设为 `Anywhere Labs <cob@88.com>`：Electron Builder 打 `.deb`/`.rpm` 时如果没有 maintainer 身份（来自 `author.email` 或这个覆盖项）会直接拒绝构建，而 `package.json` 里没有 `author` 字段。

**打包与校验脚本。** 新增 `scripts/package-linux.ts`，沿用 `package-win.ts` 的可注入依赖结构：一个携带 `env`、`platform`、`run`、`log` 等字段的 options 对象，使其无需真正调用 Electron Builder 即可单测。与 Windows/macOS 脚本不同的是，它不需要剥离签名密钥——这次设计里 Linux 打包格式没有代码签名步骤。它会执行 `electron-builder --linux deb rpm AppImage --x64 --publish never`。新增的 `scripts/verify-linux-packages.ts` 沿用 `verify-win-installer.ts` 那种纯字节头部校验风格，而不是挂载或运行产物（在 CI 里运行 AppImage 需要 `libfuse2`）：对 `.deb` 校验 `ar` 归档魔数 `!<arch>\n`，对 `.rpm` 校验 RPM lead 魔数 `ED AB EE DB`，对 `.AppImage` 校验 ELF 头加上偏移 8 处的 AppImage type-2 魔数。`package.json` 新增 `check:linux-package`（沿用 `check:win-package` 的定向测试文件列表模式）和 `dist:linux` 脚本。

**CI smoke job。** `ci.yml` 新增与 `desktop-windows`、`desktop-macos` 平级的 `desktop-linux` job，同样由 `needs.changes.outputs.product == 'true'` 门控，运行在 `ubuntu-latest` 上。它通过 `apt-get` 安装 `rpm`（runner 镜像里唯一缺失的打包工具；`dpkg-deb` 和 `fakeroot` 已经预装），跑共享的 `yarn check` gate，然后执行 `yarn workspace dsh-plugin-desktop dist:linux`，并设置 `DSH_PACKAGE_CHECK_ALREADY_RAN=1` 跳过重复 preflight，与 Windows/macOS job 一致。它只负责构建和校验，不发布任何东西，workflow 顶层的 `contents: read` 权限保持不变。

**发布流水线。** 新增独立 workflow 文件 `release-linux.yml`，触发条件是 `push: tags: ['v*']`，与仓库现有的 `vMAJOR.MINOR.PATCH` tag 规范一致。它只在这个 workflow 里声明 `permissions: contents: write`，`ci.yml` 保持 `contents: read` 不变。它会跑一遍完整的 `yarn check`（跨 workflow 文件没有共享 gate job 可复用，这和 `release-mac.ts` 在手动发布前自己跑一遍 `yarn run check` 是同样的道理），打包并校验三个 Linux 产物，然后为被推送的 tag 创建一个**草稿** GitHub Release（如果还不存在的话，`gh release create --draft`），并把三个产物上传上去（`gh release upload`）。草稿状态让维护者在产物对外可见之前有一个确认的机会，全程使用默认的 `GITHUB_TOKEN`，不需要新密钥。

## 考虑过的替代方案

**把发布 job 塞进 `ci.yml`。** 已否决：`ci.yml` 的 `changes`/`check` 门控逻辑是围绕 PR 和 push-to-master 的 diff 设计的，不是围绕 tag push；把需要 `contents: write` 的发布路径混进一个原本只需要 `contents: read` 的 workflow，会不必要地扩大这个 workflow 的权限暴露面却没有实际收益。独立文件能把提权范围精确限定在真正需要它的那个 job 上。

**把 `deb`、`rpm`、`AppImage` 拆成三个独立 job**，仿照 Windows 现有的两个 job。按明确指示已否决：Electron Builder 一次 `--linux deb rpm AppImage` 调用就能复用同一份打包好的应用树产出全部三种格式，拆成三个 job 只会把依赖安装和构建耗时乘以三，却没有隔离收益——这三种格式不像 Windows 的安装包 vs 便携版那样存在彼此独立的故障域。

**通过挂载或运行 AppImage 来校验它。** 已否决，改用字节头部校验。运行 AppImage 需要 `libfuse2` 或 `--appimage-extract-and-run` 兜底，这是额外的 CI 依赖，也比这次设计想要对齐的现有 Windows PE 头 / macOS DMG `koly` trailer 校验更重。

**tag push 后直接自动发布正式（非草稿）Release。** 按明确指示已否决，改为 `--draft`，让维护者在产物真正对外可下载之前有确认的机会，这与现有 macOS/Windows 发布流程里"人工手动跑 `release-mac.ts`"这一确认步骤保持一致。

## 影响

维护者推送 `v*` tag 并手动发布草稿之后，Linux 用户能拿到附加在 GitHub Release 草稿上的可安装 `.deb`、`.rpm` 和 AppImage 产物；但他们不会在 DSH Desktop 应用内收到更新提醒或获得一键下载，因为这仍然卡在上面提到的、单独的 `dshdesktop.cn` 平台设计缺口上。每次涉及产品代码的 PR/push，CI 会多跑一个 `ubuntu-latest` job，为流水线增加 Electron Builder 的 Linux 打包耗时。`release-linux.yml` 是这个仓库里第一个拥有 `contents: write` 的 workflow，也是第一条会把桌面产物上传到维护者自己机器之外的路径；为了方便审计，它被限定在单个 job、单一且窄的权限范围内。

## 验证

`package-linux.ts` 和 `verify-linux-packages.ts` 沿用现有的依赖注入测试模式（`package-win.spec.ts` 的风格）：单测针对注入的 `run`/`log` 边界和字节魔数校验逻辑，不需要真的调用 Electron Builder 构建。`desktop-linux` CI job 就是打包回归的 smoke 检查，与 `desktop-windows`/`desktop-macos` 对齐；真正的"可安装性"校验（用 `apt` 装 `.deb`、用 `dnf`/`rpm` 装 `.rpm`、或运行 AppImage）不在这次设计范围内，与现有 Windows/macOS job 同样不会启动打包后的应用程序。
