# 0.29.0 发行核验

代码提交：162c142b51cdbf93540c6e2a73811cd447b79516。
GitHub Actions：40882708011；Windows 安装器构建与 iOS 无签名原生编译均成功。

- Android：versionName 0.29.0、versionCode 2900、包名 cn.btbon.parkingmaster；签名 SHA256 与 0.28.1 一致。包内 109 项游戏资源与最终 dist 逐字节相同。
- iOS 工程 ZIP：109 项游戏资源与最终 dist 相同；提供源码工程，未提供可安装 IPA。
- Mac arm64 / x64：两包 asar 中 package 版本均为 0.29.0，109 项资源全部相同；两 DMG 镜像校验通过。Apple 芯片客户端已实际启动，0.29.0 更新说明、主菜单及运输起竖车展台模型加载正常。
- 数值与网页功能：沿用本轮已完成的 62 项回归及浏览器验收。版本号更新后再次通过类型检查、更新下载逻辑测试和相对路径生产构建。

- Windows：下载的 Actions ZIP 与 GitHub SHA256 一致；安装器解包后版本为 0.29.0，109 项资源中 101 项逐字节相同，7 项文本仅 CRLF 差异，index.html 仅 CRLF/空行差异。JS、CSS、模型与音频全部一致。

0.29.0 已于 2026-10-29 发布到 GitHub Release 与国内 COS/CDN，公开 latest 清单最后更新。发行标签 v0.29.0 指向上述代码提交。

- 五个平台文件与 SHA256SUMS 的 GitHub 服务端 digest、大小全部匹配本地。
- COS 不可变对象均通过上传后的公开 HEAD 大小及 SHA 元数据核验。
- CDN/COS latest.json 与本地一致；公开下载页、功能索引和开发报告内容一致。
- 五个平台下载地址均返回 200；从 CDN 完整重下 Android APK，SHA256 与发行包一致。
- 下载页展示 0.29.0；原生应用检查更新沿用同一公开清单。证据：github-published.json、git-tag.json、public-release-check.json。

没有本轮 Android 手机硬件温升/帧率或真人耳机听感结论。
