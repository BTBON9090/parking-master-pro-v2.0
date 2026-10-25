# 第七轮实现记录：动力/制动、连续地形、后轮转向、停车反馈、座舱与免费模型

日期：2026-10-23  
分工：Codex 规划/独立实机；DeepSeek-V4.1-Flash / Max 实现。  
未提交、未推送；保留单实例 127.0.0.1:3000。

## 1. 踏板与手刹

- W = 15%，Shift+W = 30%；S = 12%，Shift+S = 100%；W+S 制动优先。
- Space 是**锁存**：每次非 repeat keydown 切换；keyup、W、Shift 都不会自动释放。窗口失焦只清踏板 held，不清已拉起的手刹。
- 游戏状态下 Space 在通用 `repeat` 早退之前调用 `preventDefault`，keyup 也在聚焦相机/测试点按钮时阻止原生 click；菜单、暂停设置和输入框保持原生键盘可访问。新增 `shouldHandleHandbrakeKey` 守卫和测试。
- 新增纯函数 `toggleKeyboardHandbrake` 并用测试覆盖；键盘/按钮共享同一 inputState.handbrake。
- 取消坡道 stationary autoHold：平地无油门仍不蠕行（无驱动、无坡道重力）；坡上松脚刹/手刹会自然溜车。
- 踏板意图保持纯函数 `resolveKeyboardPedals`；Shift 先/后/松开及组合均重新解析。

## 2. 动力/制动/换挡

- 取消 autoHold 力后，坡道制动仍由实际 brake force 与 gravity 对抗：
  - 12% 轻刹可停缓坡；18% 陡坡轻刹会溜，100% 重刹可停；
  - 松开重刹且手刹松开重新溜车。
- 低挡发动机制动沿用 effective ratio；N 不施加发动机制动。
- 高速降挡不再被 over-rev 硬拒绝：保留方向/倒车速度保护，发出 `gear-shift-warning`，离合仍渐进；不会瞬间截断速度。
- R：前进速度 >0.12 仍拒绝；向后溜车可在合理速度挂 R；D 反向仍拒绝。
- 1 挡低速耦合为单一连续 take-up 曲线（1.50→1.00，0.1–3.0 speed units），无 throttle/速度硬切；18% 坡 30% 油门 3 秒可从静止起步，15% 不保证。
- 现有 EV（SU7/YU7）仍为单速、无熄火；海豹08 标为训练模式，官方 DM-i 几何/电机参数已采用，变速箱仍是明确标注的训练 MT，不冒充出厂 EHS 参数。

## 3. 海豹08 来源与后轮转向

公开可核实项（2026 款，2026-07 上市资料）：

- 车长超 5.1 m、转弯半径实测约 **4.95 m**：  
  https://pcauto.pcvideo.com.cn/hj/video/3454165.html
- 后轮转向 **±7°**：  
  https://www.maiche.com/news/detail/3561071_2.html
- 官方参数入口（未能在离线环境读取具体表）：  
  https://prod.byd.com/cn/parameter-comparison?goodsId=10055

官方参数页（用户 Chrome 完整加载，2026-10-23）：

- https://www.byd.com/cn/parameter-comparison?goodsId=10055

已采用：5150×1999×1505mm、轴距3030mm、前/后轮距1715/1730mm、整车质量2145kg（四驱2270kg）、200kW/315Nm、FWD EHS、±7°后轮转向、官方“最小转弯半径4.95m”（未注明测量定义）。媒体实测页仍作为旁证，不替代官方参数。

当前实现：

- 代码尺寸 51.5×19.99×15.05u、轴距30.3u、平均全轮距17.225u、质量2145kg、200kW/315Nm；5MT 明确是训练模式，不是官方 EHS。
- `rearSteerMaxDeg=7.0`，20km/h 以下反相，20–55km/h 连续淡出；后轮按比例连续。
- 前/后轮视觉与路径使用共同 ICR；`advanceVehicleCenter` 的中心路径长度严格等于传入 distance；四轮 Ackermann 共用 ICR。
- 游戏明确采用**外前轮轨迹**口径反求，锁角 **38.13°**，实际几何测试外前轮半径 **4.95m**；官方未注明的定义不被冒充为“官方外廓实测”。
- `fourWheelSteeringGeometry` 正负舵角均取左右外轮最大值，centreRadius 使用 rearAxleOffset；负舵角归一化到 [-π/2,π/2]。

## 4. 连续地形/路缘/坡道

- 坡道 mesh 使用 `sampleSlopeProfile`，轮胎/车身读取同一 profile；坡面材质 polygonOffset，坡面抬高减少共面 z-fighting。
- 桥/坡道使用 `elevatedRoadProfile`；桥面、轮胎、相机共用同一高度，桥下有独立地面层。
- 打开训练支路、挑战入口附近的 curb，不再用连续路牙封住入口。
- 保留四轮独立接触/悬架/车身姿态；桥上层/地面层按垂直区间碰撞，不吸桥面。
- 仍未声称所有旧坡道视觉阶梯已完全消除；需实机逐坡检查。

## 5. 停车反馈

- 所有 `spots`（不只红色任务格）都参与：
  - 四个车身角完整在框内；
  - `abs(speed) < 0.5 km/h`；
  - 无 NPC/车辆占位；
  - 连续稳定 1 秒。
- 成功后显著奖励浮层/温和成功音（静音时不响）并把车位高亮成蓝色；同格只计分一次，驶出后可再次获得反馈但不重复刷分。
- 擦线/仅车头入框/经过/有 NPC 占位不成功；原任务奖励流程保留。
- T 面板“空车位前”测试点：`(4300,5260)`, rotation=π/2，正对挑战停车湾。

## 6. 座舱

- 第一人称仪表 cluster 最大缩放从 0.70 提高到 **0.89**（约 +27%）；在小窗口仍受底部固定总成约束。
- 实机 `round7-cockpit-occlusion.png`：原方向盘只露上环，被高大仪表台/防火墙遮挡。已将可见仪表台 clamp 到 0.57h 以下、防火墙降到轮毂以下，方向盘前移到 0.16L、中心 0.66h、半径缩小；hub 和四辐位于可见面，不再用整块黑板挡视线。
- `round7-concept-frame-failed.png` 的黑色碎片根因：Concept 专用分支填完数组后提前 `return`，跳过了 `addFramePart`，且其他 SPORTS 节点仍走 generic classify。现在 SPORTS 只允许 `BodyPillars/BodyRoofPanel/BodyHood` 三个真实节点进入，其他节点直接跳过；选中节点填完数组后继续共同收尾生成 frame。hood 保留原车漆，pillar/roof 使用深色内饰材质。
- 第二个根因：`mergeConceptBodyMeshes` 把 `BodyUnderside`（这三个节点的父 Mesh）作为合并源删除，连带移除了保留子树。现在合并前按对象身份记录三个节点，并跳过任何包含保留后代的合并源；独立 `round7-model-inspection.ts` 与 driving test 都在 `buildCarMeshFromGLB` 后确认三个真实节点仍存在。
- 第三个画面根因：手工重组三角形丢 UV、变换/负缩放 winding 不可靠，出现红薄片和黑三角。现在 Concept frame **直接 clone 三个真实 Mesh**：使用 `frameInverse × node.matrixWorld` 保留原 UV/贴图/世界变换，hood 用原车漆材质，pillars/roof 用深色内饰材质，全部 DoubleSide 避免负 determinant 破面；测试检查 3 个 clone、UV 保留、几何 extent。
- 共用 Sedan：不再把整个上半身都丢进 frame；只保留挡风玻璃带内、且三个顶点都在带内的真实 A柱/顶缘三角形，避免大幅门板三角横穿。
- 新增连续深色 cowl，但放在方向盘盘面之后：`frontZ > wheelZ + wheelRadius`，从眼位到 hub/四辐的射线先命中轮盘；之前 cowl 在轮盘前方形成半屏黑墙。
- Sedan cowl 上沿不再用 `0.55h` 压低，而按实际 `measuredEyeY + measuredHoodRear.y/z + cowl.z` 投影到 hood 后缘，形成接触/小重叠；测试还检查投影差<15px。
- Concept 不再用细横杆：`concept-continuous-front-bulkhead` 从挡风玻璃下缘投影高度一直延伸到车厢下部，宽度覆盖前围，位于轮盘 Z 后方；测试检查高度>0.25h且 `minZ > wheelZ+1.25`。
- Concept 真玻璃按材质 `Glass` 识别，不按 `Window` 节点名；HOOD 将 KHR transmission 置0，外视恢复，且只在视角切换时 needsUpdate。
- 3D 驾驶员方向盘增加第 4 根辐条；DOM 方向盘也补上辐条，中心 hub 保留。
- 中央后视镜宽度从 32vw/max520 缩小到 26.5vw/max430（约 -17%）；镜面渲染继续以 DOM rect 实测对齐。
- 移除中央后视镜下方重复转向指示器；只保留仪表顶部 TurnSignalGauge。
- Concept 第一人称不再使用破碎的红色车壳 frame，改用通用内饰+玻璃；HOOD 隐藏地面辅助线。
- 镜面每帧 scissor 合成；不再用 30Hz 跳过绘制，避免镜框露出主相机（蓝/灰闪烁）。
- 保留真实车壳 frame / A 柱 / 车顶 / 门框；驾驶室不露胎。

## 7. 免费模型

- 接入 Khronos glTF Sample Assets **Car Concept**：
  - 本地：`public/models/cars/concept-car.glb`（约 11 MB，离线缓存）
  - 来源：https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
  - 原始公域概念：Unity Fan, Sketchfab public domain CC0
  - 清理/glTF 打包：© 2024 Darmstadt Graphics Group GmbH, Eric Chadwick
  - 许可：CC BY 4.0（不是代码 MIT）
  - 本地许可：`public/models/cars/concept-car.LICENSE.txt`
- 现有 `CarType.SPORTS` 的模型从旧 `sports-orange.glb` 切换为该模型，显示名 **Concept GT**；物理仍是原有 SPORTS 训练数据，不冒充 Ferrari/海豹。
- 模型经归一化、原生四轮保留（原轮组几何/材质，绕各自轴心滚动）；轮距/轴距/胎径来自实际轮心；碰撞 hull 额外纳入原生轮组外缘，不截断。
- `targetWidth` 22.42 用于让车体可见宽度匹配 cfg 19.3。
- NPC/停放车不再使用 Concept，避免 11MB 高模每辆加载；Concept 仅玩家高细节。
- 11MB/较高面数是明确代价；未做 Draco/LOD 简化，需实机检查加载/帧率。
- 用户实测基线：Concept GT spawn mean/p95 约 70/120ms；Sea08 停车湾约 17–40/27–104ms；NPC 停车区约 29/52ms。最新外视优化后用户复测同一路段约17.6/33.0ms（旧33.8/92.2ms），已确认。
- 最新实机显示 Concept HOOD 约17.8/29.5ms，但外观同一路段33.8/92.2ms；定位为 KHR transmission 在主相机和三个镜面相机重复触发全场景透射 pass。现已在模型加载时把 Concept 全部 transmission 玻璃转换为普通透明/反射窗（transmission=0、opacity≈0.30、DoubleSide、needsUpdate仅一次），HOOD/外视/后视镜/预览统一使用；未降低镜面合成频率，未改物理/碰撞/地图。需同一路段复测。

## 8. T 面板测试点

停稳后传送：

- 平直加速 `(1180,3900,0)`
- 坡上朝上 `(5650,4500,0, deck=32.5)`，真实西侧坡中段
- 坡上朝下 `(7350,4500,0, deck=32.5)`，真实东侧坡中段
- 空车位前 `(4200,5350,0)`，东向开进空位
- 路缘入口 `(1300,4480,π/2)`
- 砂石路 `(1500,4750,π/2)`；Level 1 没有可命名的窄桥，因此不再把同一砂石点标成窄桥
- 桥坡 `(5300,4500,0)`、桥下 `(6500,4250,π/2)`、S 弯、崎岖、碰撞验证等保留。
- 碰撞线框 toggle、踏板/纵向 g/动态俯仰/后轮/路面高度/NPC 数量可读。

## 8.1 本轮追加校准（2026-10-23）

- 1 挡低速扭矩改为单一连续 take-up 曲线（1.50→1.00，0.1–3.0 speed units），删除 1.5/2 与 throttle=.05 的硬切、重复 1.35/1.42。
- 主车垂向：失支持面检测（前后轴独立符号）+ 最小向下速度 + 弹道 + 落地阻尼；正常缓坡/2.6u 路缘不触发。
- 低路缘按可见 `CURB_HEIGHT=2.6, CURB_WIDTH=4.2` 进入四轮采样；不是隐形墙。
- 四轮转向：前轮比例连续、后轮比例插值；中心路径按用户给出的 ICR 公式积分；四轮视觉使用共同 ICR Ackermann。
- 桥面 slab 改为 112 段连续封闭厚带，顶面低于行驶面；移除水平 Box slab。
- 海豹08 使用官方 3030/1715/1730mm 几何、2150 级质量/200kW/315Nm 标注；锁角按外前轮口径 38.13° 反求。
- 座舱：降低仪表台/防火墙、前移方向盘，使 hub/四辐位于可见面；Concept 第一人称关闭破碎红壳，使用通用内饰和玻璃；辅助线在 HOOD 隐藏。
- Concept 保留原装四轮，轮组按自身轴心滚动；车壳/车轮碰撞 hull 不截断。
- 镜面恢复每帧 scissor 合成；不再用 30Hz 跳过绘制（会露出主相机）。
- NPC 使用低模池，Concept 仅玩家高细节。
- 详见 `docs/round7-vehicle-sources.md`。

## 9. 验证与限制

- 已执行 `npm run typecheck`、`npm test`、`npm run build`，均通过；最终输出见交付回复。
- 自动测试新增/更新：坡上释放溜车、轻/重坡刹、30% 1 挡爬坡、Space 锁存、反向 R、高降挡警告、副车/后轮转向、停车条件/1s/重复反馈、模型 bbox/footprint、桥/路缘。
- 未做浏览器截图验收：海豹08 后轮视觉、停车浮层、0.89 仪表小窗口、Concept GT 模型加载/帧率、所有旧坡道视觉连续性；这些必须由 Codex 实机复验。
- 11MB Concept 模型是额外带宽/内存风险；未编造 Ferrari/Seal08 授权或参数。
