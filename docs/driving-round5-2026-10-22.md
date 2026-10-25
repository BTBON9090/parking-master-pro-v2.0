# 第五轮：真实车体座舱、连续输入、训练变速箱、非铺装地形与录音音频

日期：2026-10-22  
范围：A1–A4 + B5–B6。未改外部 GLB 资产文件；未恢复菜单音乐；单 3000 服务。所有训练数据为游戏标定，不是厂商/法规认证。

## A1. 真实车体座舱（第 4 次几何修正，待截图）

失败迭代见 `round5-cockpit-stage*.png`。根因不是“再挖一个盒子”，而是：
- 默认轿车玻璃是独立 primitive（`Body_Cube001-Mesh_3` / `Material.006`，实测局部 y≈9.86–14.49，z≈-8.39–16.46）；
- 车漆 `Material.001` 是整块实心壳，**不能整车 DoubleSide**，否则内壁/保险杠/灯背铺满屏幕；
- 真实 hood 上表面中心约 y/h≈0.69–0.71、z/l≈0.186–0.374、ny≈0.98–1；上一版 `ly<0.58` 把真正 hood 删掉，只留碎面；
- 原眼位 0.72h 几乎与 hood 同高。

当前实现：
- 第一人称只隐藏车轮总成；原车漆壳仍用于镜面/俯瞰/外部。
- 用**源 GLB 几何**构建一个第一人称 frame：
  - 玻璃 primitive 单独识别，HOOD 中设为透明（0.16，depthWrite false），不再黑玻璃遮顶；
  - 仅 `Material.001` 等车漆参与；`Material.004` 灯、`Material.005` 黑保险杠/饰件排除；
  - **hood**：只保留 `z/l 0.18–0.40`、`y/h 0.62–0.78`、`ny>0.85` 的朝上三角面，FrontSide；排除下前脸/灯背/保险杠内面；
  - **frame**：从实测玻璃上沿附近的真实车漆三角面生成，深灰哑光、DoubleSide；A 柱向内收的上半段依据玻璃边界保留，不再用统一 `lx>0.4` 筛掉；
  - 下层中央壳面丢弃；不再整车 DoubleSide，也没有假 hood/假 A 柱/假窗。
- 眼位按玻璃高度带提高到 **0.85h**，z 回到车舱内；仪表缩放从 0.78 降到 0.70。
- 内饰随眼位重标定：方向盘中心 **0.65h**、z≈0.065l（上缘约 0.768h，投影约 y=851/1134，底部 1/4）；倾斜仪表台上表面从 hood 后端/风挡下沿 y≈0.735h,z≈0.19l 连续下沉到 y≈0.605h,z≈0.015l；防火墙/前围覆盖下部，封住透地；两侧门内衬覆盖 0.41–0.63h，遮住侧窗下空洞。测试同时做 hood 后端→仪表台前缘投影（<90px 差）和轮缘投影。真实 A 柱/顶棚/窗框仍来自源几何。
- 7 车型使用各自源几何 profile，不再用 sedan 比例（lz 采用车根居中 -0.5..+0.5，front 为 +）：
  - 实际模型三角面审计：SEDAN 54/612、SUV 54/551、SPORTS 361/3298、TRUCK 94/951、SU7 438/5474、YU7 441/5590、ZUNJIE 476/5965（hood/frame）；不是人造测试点；
  - SEDAN hood 实测 0.69–0.71h；SUV hood 在 0.30–0.68h / 0.55–0.995l；SU7/YU7/ZUNJIE 使用各自低前舱带；SPORTS/TRUCK 独立；
  - 眼点从每车**实测玻璃带**取比例，SUV/SU7 不再把 .85h 硬套到高车身；profile 偏移叠加在用户 eye height/forward/lateral 调参之上，不覆盖；
  - 每车 dashboard/防火墙/轮心 z/y 使用 profile，SUV/SU7 方向盘中心/仪表台随车校准；
  - 多材质 SUV 车体按**材质 group**拆 frame，不再把整块 body 当玻璃；HOOD 只隐藏 paint material，保留真实玻璃；model 方向盘在 HOOD 隐藏，通用轮盘始终可见；
  - 向下 roof/header slab 丢弃，避免黑顶整片。
- 测试 `classifyCockpitPaintTriangle` 使用实测点：hood 0.70h/0.28l/ny0.99 保留，下前脸 0.40h 丢弃，向内 A 柱 0.20w/0.80h 保留，下层中央丢弃。

**仍未通过视觉验收**：最新 `round5-cockpit-stage4.png` 暴露上版筛掉 hood/A 柱；本版按实测 hood 带/玻璃边界改成源几何 frame，必须再次实机确认默认轿车前方/左看，再抽查 7 车型。

## A2. 连续转向、回中与键位

- 审计结论：没有显式 12 格输入取整；12 段是 `TurnSignalGauge` 显示。42° 旋钮步进和 `centeringGain` 非对称回轮才是可疑来源。
- 旋钮 42°→**12°**，小数保留、平滑；显示灯不写回输入。
- 删除手动回轮 `centeringGain` 乘数；手动去/回同增益。
- `snapSteeringCenter`：输入结束后 `|angle|≤2.2°`（方向盘角）归零，覆盖键盘±1°/±2°微调；**不依赖速度、自动回正开关或 Logitech 旋钮模式**；输入进行中不吸附，连续跨 0/立即反向不被拦。旋钮也可回中。
- 鼠标/键盘/触摸/旋钮共用连续角度；触摸拖动已接入。测试：等量去回精确回 0、跨 0、无 12 档量化、±1°/±2° 松手吸附、2.6° 不吞、输入中不吸附。`Alt+C` 为明确的手动转向归中。

## A3. 转头观察

- **Alt+J / Alt+L** 看左/右，**Alt+K** 回正，**Alt+鼠标左键拖动**观察。Alt 组合避开 Logitech 模式 `j/l/k` 的换挡/刹车和 L 灯光；帮助写入 HUD 与训练提示。
- 仅 HOOD 相机局部 yaw ±75°、pitch ±12°；不改车辆 heading、前轮、镜面；切视角/暂停/失焦/退出 reset。
- 测试 clamp/平滑/reset；实机方向需确认。

## A4. 手挡训练传动

- 移除 0–100 secant 校准；A 由 `torqueNm × topGearRatio × finalDrive × 0.90 / wheelRadius / mass` 直接计算；0–100 仅仿真输出。
- 齿比/红线（游戏训练标定）：轿车 38/70、SUV 40/69、运动 58/90、皮卡 36/64、大型 42/75 km/h；正常升挡 20/38、22/42、35/65、16/32、28/55。
- 新增 `normalBandMinKmh/MaxKmh`：HUD 显示“正常带 / 红线”，二挡下限非 0；调参面板同步。
- 近红线收扭、功率上限、高挡低扭、4/5 拖挡熄火、危险降挡、EV 单速保留。测试：轿车 20 km/h 牵引 1 挡 0.0279 > 2 挡 0.0176；18% 坡 1 挡 1.330 > 4 挡 0.847。

## B5. 非铺装训练支路与悬架

- 新增训练碎石支路：从训练停车区南侧 x≈1300 进入，通向 x≈1500/y≈5000 的非铺装高度场；有可见“非铺装训练支路”路牌、入口锥桶和训练提示。
- 共享解析高度场 `utils/trainingTerrain.ts`：
  - 边缘平滑回 0；连续缓坡、交叉车辙、多处明显坑洼；
  - 同一函数驱动静态 **80×100** 地形网格、四轮接触高度、车体平均高度和纵向坡度；没有每帧全图 raycast 或几何重建；
  - 中心约 **17.2u≈1.72m**，全场高差约 **17.4u≈1.74m**，最大局部坡度 **11.8%**；入口路线更缓；
  - 坑洼/车辙为 0.08–0.18m 级，80×100 网格与解析高度最大偏差自动测试 **≤0.068u**；
  - 高度场位于历史街区和 31 个大建筑之外，训练扩展仍明确标注。
- 悬架改为共享 `utils/suspension.ts`：
  - 每车型集中 massKg/spring/damping(阻尼比)/travel/antiRoll；
  - 运行时和测试共用 `stepSuspension`，四轮输入是真实轮心世界位置换算到车体局部（不是 GLB mount.position 直接当车体坐标）；
  - 物理单位明确：game unit=0.1m；k=spring×500000 N/m，c=2ζ√(km_corner)，质量实际进入 k/m、c/m；
  - 固定 1/240s 子步，15/30/60/120Hz 稳定；输出轮行程/限幅、body heave/pitch/roll；
  - 调参面板显示地形高度、车身升沉、俯仰/侧倾、四轮行程、四轮 G/-- 与接地高度、surface。
  - 测试：质量×1.7 响应改变；同坑不同速度响应改变；各 fps 峰值收敛且不超 travel；每车响应不同。
- body corner clearance 采样同一高度场防穿地；SUV 长行程、运动短行程、皮卡重阻尼。
- 坡度进入纵向动力：18% 坡测试 1 挡比 4 挡爬得更快；低挡牵引/高挡弱保留。
- 地形网格静态一次生成，cast 阴影关闭、receive 开启；不逐帧更新。
- 入口有 **3m 窄门**：两侧改为低矮 1m 石墩/护栏（x=1500±20、宽10、纵深60），仍留30u净宽并保留碰撞；`buildBoxMesh` 不再生成6米高巨墙。
- 新增 **可点击“非铺装训练入口”按钮**（停稳才可点），跳转到支路入口；路线小地图绘制地形区域/“非铺装”标签。不使用隐藏 window。
- 自动测试：中心/高差/11.8% 坡度；80×100 网格误差；碎石支路、路牌、地图区域；3m 门；地形不与建筑重叠；18% 坡低挡爬坡。

## B6. 真实录音音频

- 7 个本地 WAV：发动机 idle/load 两层、沥青 road loop、碎石拟音、滑胎 loop、两个金属碰撞；48 kHz mono，总约 **2.1 MB**。
- 来源/裁剪/许可详见 [audio-round5.md](audio-round5.md)：
  - Peugeot 107 车内实录 Joseph SARDIN / BigSoundBank CC0，切 52–57 怠速、20–25 负荷、36–41 道路；
  - 轮胎尖叫 BigSoundBank CC0；
  - 自行车碎石实录 CC0，明确不是汽车录音；
  - BMacZero metal thud CC0；
  - 不使用同录音变调冒充多 RPM，不使用 GPL3 金属档。
- 处理后零交叉端点 + 1ms 去咔哒、软压缩、峰值 <0 dBFS；循环首尾样本为 0。测试读 WAV 头/首尾/峰值。
- WebAudio 只有一套循环节点；按 rpm/throttle/速度/路面/滑移/碰撞混合；EV 无燃油机层；雷达仍合成；按钮保留；无菜单音乐。
- Pause/失焦/页面隐藏：持久 lifecycle 状态与 enabled/volume 共同决定 master，不会被下一帧 params.paused=false 恢复；窗口 blur/focus 监听命名并在 cleanup 成对移除；异步 load 有 generation/AbortController，dispose 后不会创建节点。调参面板显示 ACTIVE/MUTED 与 surface。
- 普通直线减速刹车不触发尖叫；只有真实滑移/漂移或高速急转制动触发 skid。
- 可重跑处理脚本 `scripts/process-audio-round5.mjs`，源文件放 `public/audio/source` 或 `AUDIO_SOURCE_DIR`。
- 失败 fallback：任一素材解码失败则整体保留 synth fallback，并在调参面板显示 loaded/total/failed，不假装成功。
- 调参面板新增音频素材状态，无需隐藏 window。

## 验证

- `npm run typecheck`：通过。
- `npm test`：通过。
- `npm run build`：通过；仅既有大 chunk 警告。
- 服务：单实例 `http://127.0.0.1:3000/`；`/audio/engine-idle-loop.wav` 返回 200。
- 自动证据：
  - `Terrain: centre 17.20u, relief 17.37u, max grade 11.8%, 3m gate ...`
  - `Terrain grade: 18% slope, 1st 1.330 > 4th 0.847`（独立坡度测试）
  - `Suspension: 15/30/60/120 Hz peaks ... by car; mesh error <=0.068u.`
  - `Audio lifecycle: persistent blur/visibility/UI pause, stale-load generation guard.`
  - `Audio assets: 7 ... zero-crossing loop endpoints, peaks below 0 dBFS.`
  - `Cockpit: source geometry classifies measured hood/frame...`
  - 全 7 车型实际 GLB/程序化 paint 三角面 hood/frame 非空审计；eye/hood/wheel profile 投影与轮缘主视口断言；
  - 方向盘在自身深度必须高于该处仪表台顶面，避免“投影在屏幕内但被 dashboard 实体遮挡”；
  - 已读取 SUV 第二轮截图；本轮修复仍未实机复验。
  - 转向/转头/齿比/正常带/牵引/地形/音频文件回归。

## 未验证 / 待 Codex 实机

- **A1 座舱第 8 次修正**：已读取 `docs/round5-suv-crosscheck2.png`（SUV 顶黑区约200px；轮缘未见，前风挡 y592–634 有孤立黑条）。本版改用真实面法线分类（不再依赖 GLB 顶点法线）、SUV 方向盘抬高至0.62h/后移 z0.09l、加粗并提亮轮缘；新增 dashboard 同深度遮挡断言。必须看实机，未截图。`round5-cockpit-stage6.png` 和 `round5-suv-crosscheck.png` / `round5-su7-crosscheck.png` 是上一版失败证据。
- 仪表 0.70 缩放/眼位 0.85h、物理仪表台遮挡是否合适。
- 地形坑洼/悬架实际观感、四轮压缩/车体姿态、高速稳定性、入口可达性。
- 音频真实听感、发动机分层/路面切换、循环无咔声、碰撞/滑胎平衡、EV 无发动机声；未写听感通过。
- 真实浏览器长期性能/draw calls/FPS；报告不称全程 60 fps。
- 所有齿比/建议带仅为训练标定，不宣称实车参数。

## 改动文件

- A：`App.tsx`、`utils/steering.ts`、`utils/headLook.ts`、`utils/cockpitCutout.ts`、`utils/hoodCamera.ts`、`utils/powertrain.ts`、`constants.ts`、`three/driverInterior.ts`、`components/GameCanvas3D.tsx`、`components/UIOverlay.tsx`、`components/TuningPanel.tsx`
- B：`utils/trainingTerrain.ts`、`utils/recordingAudio.ts`、`utils/beijingMap.ts`、`three/sceneBuilder.ts`、`public/audio/*.wav`
- 测试：`tests/driving.test.ts`、`tests/systems.test.ts`
- 文档：本文件、`docs/audio-round5.md`

## Codex 最终独立复验

2026-10-22 14:13：最后版本已独立通过 typecheck、全套 test、build，并重载实测默认轿车、SUV、SU7 座舱、转头、方向盘归中、音频状态与非铺装驾驶。具体证据、截图及未验证边界以 [round5-codex-independent-qa.md](round5-codex-independent-qa.md) 为准；上文“待 Codex 实机”是实现方当时的交接状态。服务与游戏页继续保持运行。
