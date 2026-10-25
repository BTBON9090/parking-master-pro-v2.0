# Round 22 验收记录 — 0.22.0

日期：2026-10-25。所有客户端的游戏资源来自 `64aeb3d5464e76c828ac4dc2bebf4e728a90af2c`；后续提交只补充发布清单、脚本和本记录。

## 通过的检查

- TypeScript 与全部历史回归通过；新增测试覆盖画质五档、自动分辨率有界调整、P / Space 合成、设置存储迁移和版本比较。
- 桌面浏览器实测流畅档画布 1264px / CSS 1946px，约 0.65 倍，UI 保持原尺寸。
- 浏览器实测：P 拉起驻车 → 按住并松开 Space → 驻车仍开启 → 再按 P → 驻车关闭。停车按钮获得焦点时，Space 仍由临时手刹接管。
- 844×390 iframe 横屏布局检查：选车、选图、触控油门起步成功，仪表显示约 5 km/h，位置发生变化。设置导航和关键按钮在视口内。此检查使用桌面指针模拟，不代替手机真机多指触控测试。
- Mac arm64 正式 `.app` 从本地 `app.asar/dist/index.html` 加载，完成主菜单、选车、选图、首次操作引导及游戏场景显示。两份 DMG 的 `hdiutil verify` 均通过。
- Android release APK 构建成功，APK 签名 v2 验证通过。使用本机持久签名密钥，密钥不入库。已安装到 Android 模拟器。
- [最终构建任务](https://github.com/BTBON9090/parking-master-pro-v2.0/actions/runs/40195981134)：Windows NSIS 与 iOS 无签名编译均通过。iOS 工程通过 CI 的 Xcode 编译，解决了本机缺少 Xcode 平台组件导致的验证阻碍。
- 五个平台文件内的游戏 JS 与最终 `dist` 内容一致。GitHub 资产大小与 SHA-256 全部匹配本地清单，见 `release-verification.json`。
- COS 上传后核验文件长度及 SHA-256 元数据；线上下载页显示全部平台链接、版本、体积和校验值。
- 游戏内“检查新版本”已实际返回“当前已是最新版本 0.22.0”。本轮为手动检查并下载覆盖更新，不是静默自动更新。

## 交付位置

- [介绍和下载页](https://cdn.btbon.cn/parking-master/index.html)
- [GitHub Release](https://github.com/BTBON9090/parking-master-pro-v2.0/releases/tag/v0.22.0)：Mac arm64、Mac x64、Windows x64、Android、iOS 工程及 SHA256SUMS。
- 游戏仓库只保留 `main` 分支。
- 作品集 `/Users/aiden/Desktop/工程/Profile-2026` 的 AppBox 入口、介绍页和下载清单已本地提交 `ab290dd`。未推送作品集仓库、未触发 EdgeOne Pages 部署，保留原有其他未提交修改。

## 未覆盖与限制

- Mac 自动化长按 W / Shift+W 未可靠观察到起步，键盘及部分窗口操作存在延迟；未据此宣称原生驾驶验收通过，需人工确认。Web 触控起步已通过。
- CUA 无法绑定 Android 模拟器的 qemu 窗口，因此没有将模拟器安装成功当作操控通过。Android 真机多指操控、温控、帧率尚未覆盖。
- Windows 已成功构建，但未在 Windows 实机运行；Mac Intel 未实机运行。
- Mac / Windows 尚未代码签名，Mac 未公证，首次安装可能有系统提示。Android 使用持久发布密钥。
- 用户尚未加入 Apple Developer Program，本轮交付 iOS 工程，不提供可安装的 IPA、TestFlight 或 App Store 发布。
- 运行时依赖审计为零告警；六项中等级间接开发依赖告警保留在后续兼容升级范围内。
