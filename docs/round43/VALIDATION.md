# 0.28.1 验证记录（已发布）

用户已授权版本更新、推送与COS发布。本轮直接实施，未指挥DeepSeek、未付费接入服务、未使用新引擎、未连接或启动用户手机。

## 核心检查

- 完整 npm test PASS（原有链及新增 steeringAnchor/progress/examPosition/mountainSampling/worldConnections）。历史round JSON按运行前字节恢复，既有用户变化保留。
- 触控偏心落指保持零角度，拖动后为−133°，另一位置重新抓握仍−133°。CDP真实触点与React事件检查通过。
- 本机保存、主档损坏备份回退、配额失败、旧几何回安全起点、B2楼层、阻挡落点、考试已完成项/成绩保留检查通过；Chrome实际整页重载继续驾驶、油门零、驻车恢复通过。
- 位置考试非顺序进入、离开区域停止评分、传送重置当前尝试、指定停靠点检查通过；844×390触屏界面上移说明、隐藏中央镜，并实际切入第8考点核对名称。
- 路面4662采样与原算法高度完全一致；本次Node三轮采样32.24ms对原165.29ms（约20%，非Android帧率）。道路/山肩/非铺装渲染Raycast回归通过；最大视觉偏差约2.50cm（包含绘制层微小抬高）。
- 新地库双向螺旋2882样本，无错误换层与车辆碰撞；四通道方向、楼层、落点检查通过。实际游戏内完成城市→地库→城市→高速→城市四次切换。
- 实际游戏内检查云顶升降、跳过动画到山腹、涵洞中行驶位置和B3螺旋可见性。后续复查消除了升降台上的原停车线，并补齐底层洞门和升降井端墙；末次三套浏览器检查已全部通过。

## 发现并修复的问题

- 首页菜单层级原来盖住设置；关闭版本弹窗的Esc误关后面的设置，已修复并回归。
- 通过窄路与宽停车坪交点时，旧逻辑仅检查最近窄路的宽度，导致支撑面与宽坪约15.6cm不一致。改为综合相交道路宽度、停车坪水平过渡后通过地面回归。
- 新涵洞引入垂直多层，未给定高度的地形查询仍须选择地表，只有明确地下高度才选涵洞。已修复默认高度歧义并通过旧地表回归。
- Android原生桥把27MB的JSON整数解析成Integer，getLong读取失败导致正常更新被拒绝。模拟器复现后改为getInt；不受信地址、无效校验信息、无已下载包安装及取消恢复检查通过。

## Android更新验收

本机API36.1模拟器用于插件验证，不是手机硬件。临时0.27.1测试宿主使用相同正式签名，仅该未发布宿主启用WebView检查。原生插件从CDN下载正式0.28.1 APK，通过大小/SHA256/包名/版本号/签名校验；经模拟器系统界面授权安装来源、确认安装，dumpsys核对versionCode=2801、versionName=0.28.1。新版本主菜单仍显示“继续上次驾驶”，进入原三层地库，UI坐标X850/Y500、0km/h、N挡驻车。正式APK无WebView调试。证据native-updater-install.json、native-upgrade-retention.json、android-system-installer.png、android-continue.png、android-resumed.png。B2层高、奖励/完成项细节另由数值/浏览器验证，不声称读到了正式包的私有存储。

## 边界

存档是设备本地，不包含云同步、完整碰撞碎片/速度/踏板历史；恢复N挡驻车。升降时间为80秒游戏动画，允许跳过，不是工程电梯力学求解。山腹涵洞与地表按当前高度分层，雨雪在涵洞内部整体隐藏，不是逐粒子屋顶碰撞。地图通道为自动切图并停稳落地，不是全世界同时驻留。

22辆可选车、9个地图入口，正式驱动与车辆资产未更换。用户最新正向反馈与正式验证分开记录；不将逐轮实验宣称已变更为正式求解器。Mac/Windows无代码签名，iOS交付工程ZIP。

- 最后一次UI代码遗漏isTouchDevice导入，被typecheck和浏览器错误边界发现；补齐后typecheck以及三套浏览器检查全部重新通过，安装包在此后重建。
- 正式Android签名有效，Android/iOS工程96个资源与dist完全一致，正式APK未启用WebView调试。仅不可变APK已上传用于真实更新链验证，尚未更新公开latest清单。

候选独立复查：0.28.0第三人称升降井壁遮挡，因此未更新公开清单。最终0.28.1对附近第三人称隐藏井壁外壳，驾驶舱与实体碰撞保留；浏览器升降与四向通道再验通过并独立查看截图。原f99bfc8候选的Windows/iOS Actions虽通过，但最终包必须以新提交的CI为准。

## 最终构建一致性

- 发布代码提交819f5303647a5fe8d3616fac8eff470a5752d572；Actions 40830625622 的Windows与iOS编译均success，head一致。0.28.0候选不用于最终发行。
- 最后CSS修正后重新生成所有本地包。0.28.1 Android、iOS工程与两个Mac的96项游戏资源逐字节一致；package-check.json与mac-package-check.json记录。Android签名核验通过。Windows产物经GitHub SHA256验证；解包后88项逐字节一致，另8项文本仅CR换行差异，JS/CSS/GLB/audio完全一致（windows-package-check.json）。
- 模拟器软件GPU出现SHADOW sampler日志；当前用途是原生下载/安装和存档恢复验收，不以此证明手机渲染性能。短横屏版本说明可滚动；自动焦点会滚到“继续”按钮，标题可能需向上滚动查看，属于后续界面细节。

- HTML索引56项，F049搜索及390px无横向溢出检查通过，发展报告当前状态链接同步。模拟器已关闭，未留下手机测试或设备负载。

## 公开分发完成

0.28.1 已发布到 GitHub Release 与 COS。五个平台产物和 SHA256SUMS 的GitHub服务端digest/大小全部匹配本地；tag v0.28.1 指向819f5303647a5fe8d3616fac8eff470a5752d572。COS不可变对象元数据逐项核对，最后更新latest。CDN/COS公开latest与本地完全一致；CDN下载页、功能清单和开发报告逐字节一致；五个安装包HEAD大小及SHA元数据一致；Android整包重新GET并计算SHA256通过。真实浏览器确认五条0.28.1下载链接、功能数56和F049搜索。证据 public-release-check.json / public-browser.json / github-published.json。

下载：https://cdn.btbon.cn/parking-master/index.html#download
功能清单：https://cdn.btbon.cn/parking-master/features.html#overnight-progress

用户旧版0.27.1尚无原生更新插件，需先从下载页覆盖安装0.28.1；之后新版本可在App内下载安装。保存仅限本机，卸载/清数据不保留。没有手机硬件温升/帧率或厂商安装器验收。
