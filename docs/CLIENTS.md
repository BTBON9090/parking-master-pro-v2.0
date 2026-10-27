# 独立客户端 · 0.23.0

同一份 Three.js 游戏由 Electron（Mac / Windows）与 Capacitor（Android / iOS）承载。资源随安装包分发，驾驶无需联网；作者链接和检查更新需要联网。

## 构建

需要 Node 22+，先 `npm ci`。`npm run typecheck && npm test` 验证，再 `npm run build:client` 生成相对路径资源。

- Mac：`npm run package:mac`，生成 arm64 与 x64 DMG。本轮没有 Developer ID 签名及公证。
- Windows：在 Windows 上 `npm run build:client && npm run package:win`。GitHub Actions 的 Build desktop clients and iOS project 可手动运行。NSIS x64 安装程序尚未签名。
- Android：JDK 21、Android SDK 36；`npm run mobile:sync` 后在 Android Studio 打开 android，或 `python3 scripts/package-android.py`。本机发布密钥保存在用户私有目录 `~/.local/share/parking-master/signing/`，不在源码中。务必自行安全备份该目录，后续更新必须使用同一密钥。构建脚本接受 PARKING_SIGNING_CONFIG 指定 JSON，字段 keystore/alias/password；请勿提交该文件。
- iOS：`npm run mobile:sync`，用 Xcode 26+ 打开 `ios/App/App.xcodeproj`。选择自己的 Team、签名并按 Apple 发布流程分发。本轮只交付工程，不交付 IPA。工程固定横屏，应用 ID 为 cn.btbon.parkingmaster。

下载的 iOS-Project.zip 已包含同步后的游戏资源，解压后先在根目录运行 `npm ci` 恢复原生插件，再打开 Xcode 工程即可；不必重新执行 mobile:sync。

## 操作与更新

Space 按住临时手刹，松开释放。P 切换驻车手刹，驻车期间松开 Space 不会解除驻车。触控左右两侧可同时操作，踏板上滑增加力度。竖屏显示横屏提示并暂停输入。

设置即时保存到本机客户端；更新覆盖安装，不要先卸载。当前更新机制是“设置 → 关于我的介绍 → 检查新版本 → 下载新安装包”，不是静默自动更新。iOS 安装版需加入 Apple Developer Program 后通过 TestFlight / App Store 分发。

清晰度分自动、流畅、均衡、高清、超清。自动在移动端最低 0.8、桌面最低 0.75 至最高 1.5 像素比内缓慢调整；流畅为 0.65，均衡为 1，高清最高 1.5，超清最高 2。后视镜与阴影贴图随档位调整，物理和 UI 不降低精度。性能还取决于 GPU、WebView、屏幕分辨率和温控，不能保证所有设备固定 60 FPS。

## 发布

安装包放在 GitHub Release 和作品集 COS `parking-master/releases/<version>/`，不放入 Git 历史。`distribution/site/` 是静态介绍与下载页，可复用在作品集 public/parking-master 下。上传成功后生成 latest.json，包含版本、平台、大小与 SHA-256，再发布清单以避免半成品链接。COS 凭证和 Android 签名密钥均不进入仓库或客户端。

0.22.0 发布时依赖检查修复了高危开发依赖；当时运行时依赖审计无漏洞。仍有 Tailwind CSS / Capacitor CLI 间接开发依赖的 6 项中等级告警，涉及构建时选择器解析与 uuid，需后续兼容升级；未强行跨大版本替换。
