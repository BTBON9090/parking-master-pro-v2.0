# 0.22.4 更新与下载修复验收

日期：2026-10-27。游戏实现基线 0ced57b；Windows / iOS CI：40435749305。

## 根因与修复

- 旧客户端仅请求 GitHub，网络失败无法检查新版本；网站必须先读取版本接口才启用下载按钮，接口或旧 WebView 超时 API 失败会留下不可点击的链接。
- 原始 COS APK 地址的真实 GET 请求返回 403（带/不带 Referer 均复现）；只验证 HEAD 不足以判断可下载。改用通过 GET 验证的 CDN 地址，GitHub 作为备用下载。未更改存储桶权限或防盗链配置。
- 更新源按 CDN / COS 清单 / GitHub 回退；超时覆盖 JSON 解析，不依赖 AbortSignal.timeout。原生端使用 CapacitorHttp；Android 下载通过 AppLauncher 调用系统浏览器。
- 网站保留五个平台的静态有效下载链接，即使所有版本接口失败仍能下载；下载脚本带版本查询参数，避免旧缓存把链接改回失效地址。
- 检查更新与下载安装明确分开，发现新版提供 Android APK 直接下载。安装需用户打开下载完成的 APK；不做静默安装。

## 已验证

- npm run typecheck、npm test 全部通过；新增请求失败回退、请求/正文超时、可信 APK URL、旧 WebView、静态下载链接与缓存版本测试。
- Android 签名校验通过，新旧签名证书一致；模拟器覆盖安装成功，系统包信息 versionName=0.22.4、versionCode=2204。
- Mac arm64/x64 DMG 完整性验证通过，Windows 安装包构建通过，iOS 工程无签名编译通过。
- 五端内置同一游戏 JS：index-9F2YivP4.js，SHA-256 8c902a64c084b7c9f28f2bab43f258ddd0102313d32d7f0d0f0591207101e015。
- 在正式网页 https://btbon.cn/parking-master/index.html#download 点击 Android APK，完整下载 21093847 字节；SHA-256 ec59c7b59cf9610332f890aba433d4b9ed0cb3f37514d491a7794dab6a1a62f6 与发布清单一致。
- iOS 工程 ZIP 包含 package.json 与 package-lock.json，npm ci 后可恢复新增的原生插件依赖。

## 本次限制

- Mac 锁屏，已请求用户解锁；无法完成模拟器内“检查新版本 → 系统浏览器”的 UI 点击测试，不将安装成功等同于此链路通过。
- ADB 仅检测到 emulator-5554，未连接物理手机；没有声称完成手机真机更新实测。
- Mac/Windows 未签名，iOS 仍为工程包而非 IPA。
