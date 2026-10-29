# 0.27.0 发布验证

用户已明确授权测试后更新版本、推送并上传 COS。本版使用同一应用 ID 和既有 Android 签名；不启动手机，不引入收费方案或新引擎。

## 已通过

- 全套 `npm test`：覆盖历次驾驶、触控、制动、悬架、几何、碰撞、音频、帧率、发布解析及新 NPC 相对运动回归。历史回归 JSON 按原字节恢复。
- TypeScript 检查及客户端构建。
- 新增 NPC 相对碰撞：同速不损伤、轻微追尾、迎面碰撞、分离不施加冲量、平移参考系一致、两车质量动量/能量、AI 从静止恢复、侧向速度同步 Cannon。
- 独立桌面 Chrome 触屏布局：暂停/恢复与静音开关、独立声源偏好保留；环线高速低速油门 0 → 4 km/h，刹车回 0，无页面异常。该测试不是 Android 或高速碰撞验收。
- Android 0.27.0 / versionCode 2700 已构建并通过签名验证。APK 中96个网页资源与 dist 逐字节一致；iOS 工程 ZIP 内同样96个资源一致。
- 此前资产修复的 Blender 渲染、游戏内独立检查及数值记录保留在 round32–40 与 overnight-2026-10-29。没有把失败稿覆盖为通过记录。

## 明确限制

本轮没有新的 Android 实机、多指、高速长时或温升验证。此前应用内浏览器偶发原生音频恢复挂起未定位；独立 Chrome 恢复通过不等于所有 WebView 通过。L80 A 柱精修、NPC 完整散架、正式逐轮驱动/差速器未完成。逐轮试验仍仅 DEV 显式开关的三车实验，生产构建不启用。

Mac/Windows 安装包未签名；iOS 只提供工程，不提供 IPA。各平台构建/远端核验状态会在发布完成后补充，未完成时不视为已发布。


## 多端构建与发布中间记录

- 源码提交 `46909e46960af0e2dc20f0bb0ad3c18576024839` 已推送 main。
- Mac arm64 / x64 均已构建，两份 app.asar 内 package.json 为0.27.0，各96个网页资源与 dist 一致；未启动桌面安装包实驾。
- Windows 与 iOS 无签名编译在 GitHub Actions 运行 `40807564639`，headSha 已确认等于上述提交。先前误触发旧提交的 `40807448902` 已立即取消，其产物不会使用。
- GitHub Release v0.27.0 已建草稿；安装包上传和 COS 发布在确认全部平台资源后完成。Pages 未配置，不在这轮擅自新增托管服务。


- GitHub Actions `40807564639` 已 success：Windows 构建与 iOS 无签名编译均通过；产物只取本提交，不使用取消的旧任务。


## 发布包复核补充

- Windows 安装程序解包读取 app.asar：版本为0.27.0。96个资源中88个与本机构建逐字节相同；7个SVG/许可说明仅 CRLF/LF 差异；index.html 除跨平台换行与两处空行外内容完全一致。JS、CSS、全部GLB、声音等实际资源一致。
- GitHub 草稿的前4个包已按服务器 SHA-256 与本地文件核对；Windows 和总校验文件上传成功。完整6项远端校验写入 github-published.json 后，才据此认定所有GitHub资源核验完成。


- GitHub Release v0.27.0 已公开发布：`https://github.com/BTBON9090/parking-master-pro-v2.0/releases/tag/v0.27.0`。5个下载包和 SHA256SUMS.txt 共6项服务器 digest 均与本地 SHA-256 一致，`github-published.json` 的 allAssetSha256Verified=true。
- 两个 Mac Info.plist 的 CFBundleShortVersionString 均为0.27.0。Android 构建号2700与 iOS 工程版本均已提升；应用 ID 和签名不变。


## 发布完成

- COS 五个下载包、SHA256SUMS.txt、下载站与两份 HTML 报告上传成功；每个对象均经公开 HEAD 检查大小和 SHA-256 元数据。latest.json 最后上传，`cos-upload.txt` 保留顺序。
- COS 源站和 CDN 更新清单均返回0.27.0、相同5个资源。额外从 CDN 完整下载 Android APK，27,052,535字节，SHA-256 `42793fe0b8748795ec6150f29d5ca22877378964a40da0498c5ad0064692b419` 与本地一致。三份公开 HTML 的内容也与本地一致，见 `cos-verification.json`。
- 下载： https://cdn.btbon.cn/parking-master/index.html#download
- 功能与修复清单（44项）： https://cdn.btbon.cn/parking-master/features.html#overnight-progress
- 发展与商业化报告： https://cdn.btbon.cn/parking-master/development-review.html
- 未安装/启动手机，没有新的Android温升结论。既有失败稿、Blender源文件、个人调试记录和历史回归变化在本地保留；没有提交私有COS配置、签名密钥或安装包到Git。

## 下一组优先级

1. L80 A柱和窗饰在实际驾驶眼点的遮挡，按现有资产局部调整，避免重跑老生成器破坏轮拱；必须 Blender 渲染及游戏独立复查。
2. NPC完整事故视觉与多车接触预算；本版只修复相对速度、动量和恢复，不冒称已完成NPC散架。
3. Android后台声音和持续负载/温升，同一画质亮度和路线对照；不能在用户不在场时反复启动手机压测。
4. 逐轮实验的制动/ABS、接触同步与多轴覆盖继续隔离，未验收不进入正式模式。

在线浏览器复验：公开下载页自动显示0.27.0、Android链接正确；在线功能清单检索F044返回1条，无页面脚本错误，见 online-browser.json。
