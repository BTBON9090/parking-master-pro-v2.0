# 老司机是怎样炼成的 · 独立客户端 0.29.0

同一份 Three.js 游戏由 Electron（Mac / Windows）与 Capacitor（Android / iOS）承载。资源随安装包分发，驾驶无需联网；作者链接和检查更新需要联网。

## 构建

需要 Node 22+，先 `npm ci`。`npm run typecheck && npm test` 验证，再 `npm run build:client` 生成相对路径资源。

- Mac：`npm run package:mac`，生成 arm64 与 x64 DMG。本轮没有 Developer ID 签名及公证。
- Windows：在 Windows 上 `npm run build:client && npm run package:win`。GitHub Actions 的 Build desktop clients and iOS project 可手动运行。NSIS x64 安装程序尚未签名。
- Android：JDK 21、Android SDK 36；`npm run mobile:sync` 后在 Android Studio 打开 android，或 `python3 scripts/package-android.py`。本机发布密钥保存在用户私有目录 `~/.local/share/parking-master/signing/`，不在源码中。务必自行安全备份该目录，后续更新必须使用同一密钥。构建脚本接受 PARKING_SIGNING_CONFIG 指定 JSON，字段 keystore/alias/password；请勿提交该文件。
- iOS：`npm run mobile:sync`，用 Xcode 26+ 打开 `ios/App/App.xcodeproj`。选择自己的 Team、签名并按 Apple 发布流程分发。本轮只交付工程，不交付 IPA。工程固定横屏，应用 ID 为 cn.btbon.parkingmaster。

下载的 iOS-Project.zip 已包含同步后的游戏资源，解压后先在根目录运行 `npm ci` 恢复原生插件，再打开 Xcode 工程即可；不必重新执行 mobile:sync。

## 操作与更新

V 挂空挡，K 开关雨刮；白天 / 夜晚与雨雪雾独立设置并保存。Space 按住临时手刹，松开释放。P 切换驻车手刹，驻车期间松开 Space 不会解除驻车。触控左右两侧可同时操作，踏板上滑增加力度。竖屏显示横屏提示并暂停输入。

设置即时保存到本机客户端；驾驶每5秒、退场、后台自动保存，设置可手动保存，主菜单可继续。覆盖安装保留进度，不要先卸载；清除应用数据也会删除存档。Android 0.28.1 起可在“设置 → 关于我的介绍 → 检查新版本”下载、校验并调用系统安装器，首次可能要求允许此应用安装更新；其他平台通过下载页覆盖安装。iOS 安装版需加入 Apple Developer Program 后通过 TestFlight / App Store 分发。

清晰度分自动、流畅、均衡、高清、超清。自动在移动端最低 0.8、桌面最低 0.75 至最高 1.5 像素比内缓慢调整；流畅为 0.65，均衡为 1，高清最高 1.5，超清最高 2。后视镜与阴影贴图随档位调整，物理和 UI 不降低精度。性能还取决于 GPU、WebView、屏幕分辨率和温控，不能保证所有设备固定 60 FPS。

## 发布

安装包放在 GitHub Release 和作品集 COS `parking-master/releases/<version>/`，不放入 Git 历史。`distribution/site/` 是静态介绍与下载页，可复用在作品集 public/parking-master 下。上传成功后生成 latest.json，包含版本、平台、大小与 SHA-256，再发布清单以避免半成品链接。COS 凭证和 Android 签名密钥均不进入仓库或客户端。

0.22.0 发布时依赖检查修复了高危开发依赖；当时运行时依赖审计无漏洞。仍有 Tailwind CSS / Capacitor CLI 间接开发依赖的 6 项中等级告警，涉及构建时选择器解析与 uuid，需后续兼容升级；未强行跨大版本替换。

0.24.0：触屏布局可在「设置 → 操控布局」拖动和单独调整宽高。按屏幕比例本地保存，更新安装不清除；恢复默认可重新应用标准手型布局。车型转向行程现在由车型参数决定，客车可能超过单侧 1.5 圈。

0.25.0：修复碰撞后制动衰减，优化转向与侧翻；新增 48 格速度缩放转向尺、综合驾校考核、八车道高速、八款车辆，扩展山地/雪地和环城山脉。详见 docs/round30/VALIDATION.md。

0.26.0：显示名称改为《老司机是怎样炼成的》，应用 ID、签名、设置键和安装包文件名保持兼容。22 种座驾、重车碰撞、履带演示、地图差异化和界面改进见 docs/round31/RELEASE.md。

0.27.0：触屏、后台负载、轮拱、音频和碰撞优化，详见 docs/releases/0.27.0.md；本次没有新的 Android 实机温升验收。

0.28.1：落指锚定转向、游戏进度、位置考试、山路采样、云顶升降/涵洞、B1—B3螺旋及跨图通道，详见 docs/releases/0.28.1.md。世界几何修订号43；旧位置遇到地图修订会退回安全出发点，奖励与完成项保留。

0.29.0：跨图保速保挡、窄螺旋、灯光与高速指引、录音混音和冰雪抓地、新车型及暂停界面，详见 docs/releases/0.29.0.md。
