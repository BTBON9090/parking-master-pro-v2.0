# 夜间进度

## 02:20 开始

- 已读取上一轮发热、几何和差速器边界；用户不再参与夜间测试。
- 已创建临时 heartbeat `car`，每小时整点至08:00（Asia/Shanghai），后续读取本计划继续。
- 正在处理 P0 车库预览：CarPreview3D 当前每次 rAF 渲染、自转按帧加0.0038、DPR最高2，且没有隐藏/离屏跳过；暂停设置里可能同时存在此预览，驾驶场景节流并不能降低它的负载。
- 其他任务尚未在本轮处理，不可标完成。

## 02:53 第一组整合完成

### 已进入当前源码并验证

- `utils/renderPacing.ts`：移动端驾驶最高60 Hz，桌面保持原刷新率；按稳定截止时间安排帧，避免90 Hz屏幕跌成45 Hz或微小rAF抖动累计掉帧。跳过显示帧时仍累计下一帧物理时间，暂停/后台才丢弃间隔。
- `components/CarPreview3D.tsx`：触屏闲置30 Hz、拖动最高60 Hz，DPR上限1.5；隐藏、离屏、零尺寸不提交GPU；展台自转改成按秒。桌面触屏模拟模式98.689秒计2961次渲染，约30.003 Hz（不是安卓性能/温升证据）。
- `three/obstacleVisuals.ts`、`three/beijingScenery.ts`、`three/sceneBuilder.ts`：实际建筑模型居中并匹配碰撞宽长、高度和朝向；批量建筑屋顶/窗户/门/阴影使用相同旋转与高差。旧代码忽略批量建筑的旋转/高差，导入GLB又会丢失模型居中偏移。不能据此声称所有地图已无穿模。
- 相关测试：`tests/renderPacing.test.ts` 覆盖22车加速/制动在60/90/120/144 Hz输入下的路程和停止速度；`tests/sceneryAlignment.test.ts`使用3套真实建筑GLB×4个朝向，以及高差、附属部件、阴影法线。已加入npm test链。
- **完整 `npm test` PASS**，`test-results.txt`；**typecheck PASS**，`typecheck.txt`。历史round15/16/18/24/30/31 JSON全部按运行前字节恢复。无需无变化重复跑整链。
- IAB `?controls=touch`，MINI在环线高速两次轻油门起步6 km/h，再按刹车到0；画面/三个镜面正常。浏览器截图 `browser-highway.png`。未做安卓测试、高速长测、多指实机或温升对照。浏览器游戏测试页已关闭，避免持续占用。
- 功能HTML已更新40条（新增F039性能、F040建筑对齐），含今夜状态和明早短测顺序；检索F039只返回1项。文件在外层 `designs/car-feature-inventory/index.html`。不要用陈旧 `/tmp/build-car-inventory.py` 覆盖它。

### 当前可回退测试包

`npm run mobile:sync`及本地签名Android构建通过，iOS资源也同步（非iOS实机验证）。

- `release/Parking-Master-Pro-0.26.0-android-overnight-01-test.apk`
- SHA-256 `87c6b952b3818ad96d9fa3bf266aff1674cdf4a8df11eea7edbbe3e01ac90e45`
- 27,015,735字节；APK内96/96正式网页资源与dist逐字节一致（排除.DS_Store等系统隐藏文件），见`package-01.json`。
- **没有安装、没有启动手机**。手机仍是之前已安装的round39。之后有新修复才重建，明早提供最新包；保留本包作为夜间第一组基线。

### 复现但暂未纳入的轮拱修复

- 中巴MIDIBUS/长轴接驳车LIGHT_TRUCK：导出的门内饰上缘与胎体径向空间相交约8.45/5.05 cm，满压缩时外壳轮眉也会相交。`commercial-before.json`是初筛，部分刹车卡钳命中是正常结构，不算车身穿模；脚本现已排除整个轮节。
- 原始GLB备份在`commercial/originals/`。尝试只切现有资产的悬架包络，补轮拱内衬，保留轮径、尺寸、轴位和extras；Blender前/后侧视、3/4图和blend位于`commercial/`。第一版仍有前左门饰残留；`commercial-after.json`和带after文件名的图是**不通过的修复草稿**，不是当前生产资产。
- 已把 `public/models/cars/training-midibus.glb` 和 `training-light-truck.glb` 按原始备份恢复，git无这两份文件的差异。`three/blenderVehicle.ts`为草稿加入的条件也已撤回。完整测试与APK使用原资产，不包含不合格草稿。
- 最新 `scripts/blender/repair_commercial_wells.py` 改为先焊接、再把内饰批次按独立封闭零件分别布尔、最后合批；这轮修改**尚未执行成功**。若重试成功，需要在blenderVehicle中仅对`CarRoot.userData.authored_wheel_cabin_liner===true`跳过原平直`InteriorCabinLiner`，否则运行时会重新填满已切开的轮拱；必须射线测试+Blender渲染+游戏内检查通过后才保留资产。
- 工具阻塞：后续Blender进程在脚本运行前卡在 macOS CoreAudio / OpenAL 设备枚举，CPU为0；`-noaudio`也无法避免初始化。未更改系统音频、未重启服务。所有本任务卡住的Blender进程已终止。尝试过临时进程局部DYLD垫片但未生效，勿重复该路线，也勿关闭系统安全保护。下轮可以先普通`-noaudio -b`重试一次；仍卡住则做其他代码任务。不要让挂起进程与下一轮资产写入重叠。

### 新发现 / 下一步

1. 优先继续P0/P1实际问题；若Blender恢复，完成上述两车轮拱并添加真正覆盖内饰的回归；否则先做地图清理/碰撞性能、NPC受损等独立项。L80 A柱和重卡主观比例仍待处理/实机。
2. 浏览器出现“车模绑定 Array(1)”警告，已定位到`validateVehicleBindings`强制要求headlights数组有2项；多数车型左右灯在一个合并网格里，应检查实际灯面/绑定，不能直接断言缺灯。`scripts/probe-vehicle-bindings.ts`和`vehicle-bindings.jsonl`只检查native rig，未执行sceneBuilder为拖拉机补灯的fallback。可改为有实际依据的灯具验证，避免掩盖真正缺项，不要为了消警告重复造灯。
3. 正式逐轮差速器仍保持隔离；后续读round32/DRIVETRAIN.md补制动/ABS耦合与同步接触测试，不要未经安卓验证默认开启。
4. 临时heartbeat `car`仍按计划续作至08:00。无需再新建；读取本文件从待办继续。最终更新HTML与包编号，保持失败/未测事项清晰。不要夜间向用户提问或启动手机。


## 03:07–03:33 第二组（中断后补记；以下替代上方轮拱草稿状态）

- Blender 恢复后，`repair_commercial_wells.py` 对中巴 / 长轴接驳车的外壳、内饰和座椅底座切出完整轮胎悬架包络，补充随资产导出的轮拱内衬。尺寸、轴位、轮径保持不变，三角面数 7770 / 7746。源码按 authored_wheel_cabin_liner 标记跳过会填回轮拱的旧平直地板。两份最终 GLB 已保留；originals 备份仍在。
- `commercial/changes.json`、`commercial-steered-0307.json`、`commercial-regression.txt` 是新结果。`commercial/*after*.png` / blend 已更新为成功稿；较早 `commercial-after.json` 仍保留失败记录，不代表现在的资产。
- 已独立检查 Blender 侧视 / 前视与游戏车库、驾驶舱、低速转向。游戏截图为 `commercial/*game*.png`。2 车 × 4 轮 × 5 转向 × 3 悬架高度 × 192 射线无车身侵入；驾驶舱脚部地板射线和视角边界回归通过。未实测 Android；轮拱内仍有小面积饰条可进一步精修，不能称完美模型。
- 车库音效改为点击试听，尊重总声音、发动机声音及音量开关；静音时不创建音频上下文、不取采样。驾驶总静音也释放上下文。`AudioPlaybackGate` 尝试对暂停 / 隐藏 / 失焦挂起整个图，覆盖异步状态与用户手势重试。
- 完整 `npm test` 通过，见 `test-results-02.txt`；之后调整 gate 的异步队列，又通过定向音频测试 `audio-regression.txt`、typecheck 与客户端构建。历史 JSON 按测试前字节恢复。
- 音频浏览器验证存在缺口：静音禁用、启用 running、暂停 suspended 可复现，但部分恢复卡在 suspended；独立开发页直接调用原生 ctx.resume() 也出现未完成。没有确认根因，不归因于游戏或操作系统，不把假上下文单测当实际恢复验收。`dev/audio-lifecycle.*` 保留原生对照。尚未打新 APK，此组不在 overnight-01 包里。

## 上午继续（用户再次明确要求“继续”）

- 临时夜间 heartbeat `car` 已删除，08:00 截止后的工作由用户当前指令启动，不再自动夜间续作。
- 正在减少主驾驶碰撞扫掠中的重复轮廓 / 接触面计算，保留接触法线、冲量和分离处理；用旧 SAT 算法独立比对，再更新交付包和 HTML。


## 上午第三组整合完成

### 碰撞查询

- 新增 `utils/vehicleCollisionQuery.ts`：每个扫掠采样点只计算一次玩家车与挂车多边形；合并整个组合车的网格范围，缓存静态矩形墙面，命中之后仍调用旧 `vehicleContacts` 解算接触、分离与冲量。移动 NPC、被撞移的车辆按实时姿态合并；车辆变形轮廓不缓存。
- `utils/collisionSpatial.ts` 增加范围查询及可复用候选集合，自定义轮廓按真实偏移和朝向建立网格，避免中心外的车壳漏索引。保留墙体边缘相接 / 车辆严格重叠的原规则。
- `tests/vehicleCollisionQuery.test.ts`：9 地图 × 27 份车型配置（其中 22 辆对用户可选）× 5 姿态，共 1215 组与暴力全障碍旧 SAT 一致，覆盖高差、挂车、移动 NPC、被推车辆、静态墙面变更、原地变形、偏心轮廓及边缘相接。加入完整 test 链。
- `scripts/probe-collision-query.ts` 比较之前生产静态查询，共城市/高速 × MINI/US22 四组，每组 1440 次，交替执行顺序、先热身并逐姿态确认命中一致。中位耗时约 0.0071–0.0240 ms → 0.0022–0.0080 ms，下降约 57–77%，见 `collision-query-profile.jsonl`。只是本机 CPU 查询耗时，不等于整帧、GPU、手机或温升数据。

### 音频与触屏独立复验

- 使用独立、临时用户目录的桌面 Headless Chrome 156，真实 WebAudio 状态连续 20 次暂停/恢复通过，`audio-headless.json`。
- 实际环线高速场景连续 8 次打开设置 / 继续驾驶，音频 suspended / running 转换通过；关闭总声音到 disabled、重新开启到 running，无页面脚本错误，`game-morning.json`。
- 首次实际游戏检查复现静音按钮被左后视镜拦截。`UIOverlay.tsx` 将按钮置于镜面上方，保持可点；总静音不再重设发动机 / 雷达 / 转向各独立偏好。再次实际点击通过，见 `game-morning-before-mute-fix.json` 失败记录和 `game-morning.json` 成功记录。
- 追加浏览器检查确认独立声源偏好保留；触屏油门低速由 0 到 1 km/h、触屏刹车回 0，`game-driving.json` / PNG。只属于短时基础冒烟，不能代替高速、多指真机、擦碰或热机验收。
- 原应用内浏览器的原生 resume 偶发挂起仍未定位。独立 Chrome 通过提供额外证据，不能声称覆盖所有浏览器 / Android。未更改系统音频设置。

### 回归与交付

- 全链 `npm test` PASS：`test-results-03.txt`；typecheck PASS：`typecheck-03.txt`。历史 JSON 按运行前字节恢复。当前轮新增浏览器成功记录曾被全目录恢复回旧状态，现从保留的实际成功日志重建；以后备份测试会写的历史 `docs/round*/` JSON，勿还原正在产出结果的本轮目录。
- `mobile:sync` 完成客户端、Android / iOS 资源同步；Android 本地持久签名构建成功，`mobile-sync-03.txt` / `mobile-build-03.txt`。apksigner 验证通过（显式使用现有 Java 21，无新安装）。
- 新包 `release/Parking-Master-Pro-0.26.0-android-morning-02-test.apk`，27,052,263 字节；SHA-256 `2e00c6ee44d11e54e4f1f1b8cba2013e5522ed1fa958e33827f481cf94c42cc0`。APK 内 96 个正式网页资源与 dist 逐字节一致，Android / iOS 资源目录也逐字节一致，`package-02.json`。
- 没有安装、唤醒、启动或压测手机。手机上仍是先前包；这次包含 03:07 轮拱及上午代码，不含正式逐轮驱动切换，未发布/推送。
- 功能 HTML 增至43条，新增 F041 轮拱、F042 音频、F043 碰撞查询；最新状态与手机短测顺序已写入。原发展报告顶部加入最新进度入口，保留其原评估时点与商业化内容。

### 后续按顺序推进

1. Android 同条件持续负载、温升与前后台声音验收；不要用桌面查询耗时推断手机发热改善。用户方便测试后再安装当前包。
2. L80 A 柱/窗饰视野，重卡、大巴主观比例复核；任何新资产编辑仍须 Blender 渲染和游戏内独立检查。不要重新把轮径统一放大 1.4 倍。
3. NPC 高速事故受损 / 散架和多车相撞的预算控制；正式逐轮驱动的制动/ABS/接触耦合保持隔离，不混入当前生产模式。


## 0.27.0 已发布（用户授权版本升级 / 推送 / COS）

后续新修复和发布验证转入 docs/round41/VALIDATION.md。新增移动 NPC 相对速度车损、质量冲量、停止后从零起步、横向滑行同步；修正合批大灯误报。代码已推送，5个下载包已在 GitHub/COS 发布，CDN 清单已切换0.27.0；公网APK下载复核SHA通过。在线44项清单：https://cdn.btbon.cn/parking-master/features.html#overnight-progress 。没有进行新的安卓实机或温升测试。此更新遵循用户最新发布授权，取代最初夜间“不发布”的临时限制。


## 0.27.1 续作完成（按用户最新暂缓范围）

暂缓温升、A柱、NPC完整散架、正时 / 正式逐轮驱动。本轮修复天气/昼夜耦合随机夜晚、高海拔雨雪与雪速刷新率依赖、重置后旧触控重踩油门、隐藏期间键盘输入残留，以及V空挡/雨刮冲突（雨刮改K，自定义绑定优先）。完整回归/类型检查、Chrome真实游戏与生产构建输入检查、多端构建/资源一致性通过；新功能清单47项，F045–F047。代码提交19606e9已推送，GitHub及COS/CDN发布0.27.1，公网APK完整下载SHA复核通过。详见docs/round42/VALIDATION.md。没有进行手机或温升测试，不把暂缓项标记完成。
