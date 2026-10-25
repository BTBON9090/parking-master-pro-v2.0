# 第六轮实现记录：踏板、动态姿态、静态 NPC、挑战环线、碰撞层

日期：2026-10-22  
项目：`/Users/aiden/Desktop/工程/Car/parking-master-pro-v2.0`  
分工：DeepSeek-V4.1-Flash / Max 实现；Codex 规划与独立实机复验。  
本轮保留第五轮座舱、转向、音频、动力和最近碰撞修复，不覆盖回退。单 3000 服务未重启。

## 1. 键盘踏板

纯函数 `utils/keyboardPedals.ts`，运行时/测试共用：

| 输入 | 结果 |
|---|---:|
| W | 油门 15% |
| Shift+W | 油门 30%，无键盘全油门 |
| S | 制动 12% |
| Shift+S | 制动 100% |
| W+S | 制动优先，油门为 0 |
| Space | 手刹保持；W/Shift 不会清除正在按住的 Space |

- 用独立 held 状态跟踪 W/S/Shift/Space；Shift 先按、后按、松开，W/S 组合，keyup 和窗口失焦都重新解析。
- Space 优先通过 `resolveKeyboardHandbrake` 固定；只有 Space 未按住且油门有效时才释放手刹。
- 窗口 blur/pause 仍清空踏板/转向/键盘 held。
- 帮助文案同步为 15%/30%/12%/100%。

## 2. 动态俯仰与读数

- `utils/bodyPitch.ts`：实际纵向加速度先低通（`filterLongitudinalAccel`），再映射到小型俯仰目标；不再用按键瞬间值。
- 轻油门/轻刹车小幅；重刹目标上限 0.050 rad；重踩不夸张。
- 地形 road pitch、悬架 articulation 独立叠加，不写入动态俯仰。
- 30/60/120fps 测试通过。
- T 面板实时显示实际油门/刹车、纵向 g、动态俯仰、路面高度、NPC 静态数。
- 现有 W 4 秒约 13 km/h 的实机反馈属于轻油门预期范围，本轮不暗中放大。

## 3. 静态 NPC

- 移除了所有关卡里的 active AI 生成（level 1/2/6），`updateTraffic()` 不再调用；无追驰、鸣笛、车道阻塞。
- Level 1 改为 8 辆固定路边 NPC；总固定车 30 辆（含既有停车/路边车）。位置/朝向外侧肩部，不占主路。
- 重置/换关后由同一 level data 克隆，位置不变；测试重建 level 后逐车 id/x/y 相同。
- 物理：静态车由高度感知 kinematic 求解器处理，使用实际模型 hull；不再给地面加 Cannon 盒造成桥上层假碰撞。
- Cannon 创建循环使用构建后已回填 metadata 的 `staticLevelData.obstacles`（即 live obstaclesRef），不再读未解析的 `levelData.obstacles`。
- 主车 Cannon 刚体 y 使用实时 `car.roadHeight + 5`，桥上层/地面层道具不会跨层误碰；动态道具按 terrain/slope 支撑。
- 运行时 collision 空间索引统一使用 `utils/collisionSpatial.ts`：wall/car 以及 **非 movable box/cone** 进入静态候选；movable 道具留给 Cannon。崎岖路 gate 因此经过与运行时相同的 buildCollisionGrid/queryCollisionGrid 路径，而不是只测几何原语。
- 测试点碰撞验证改为 `(2040,4100,PI/2)`，正对固定停车 NPC `(2040,4195)`，安全间距。
- 动态锥桶/箱子：同一 terrain/slope 采样计算支撑高度；每帧在 Cannon 步进后把刚体最低中心钳制到该高度并清零向下速度，再同步可见 mesh。动态道具即使放在 17u 崎岖路上也不会掉回 y=0。静态 gate 不进入 movableMeshes/Cannon movable。
- 旧 tips 中“活跃交通跟驰/鸣笛”已删除。

## 4. 挑战环线

从既有厂区环线东侧 `(3320,3800)` 接出，连续可行驶：

- 接入路：`(3320,3800) → (4200,3800) → (4200,4500)`。
- **环岛**：中心 `(4700,4500)`，半径 150，中心岛有可视圆形与独立 100×100 碰撞岛；入口道路与环线相接。
- 桥西引道/桥东引道：`y=4500`；桥定义中心 `(6500,4500)`，长 2200、宽 130，**deckHeight=65u=6.5m**（满足最高皮卡 19.3u 的桥下净高），双端 rampLength=500u=50m（约 13%）。
- **桥下通道**：`x=6500` 南北向地面路，穿过桥下；同一 XY 用高度层区分。桥面有 2.2u 厚板、可见桥底和阴影；桥墩 22u，从地面到桥面。
- **S 弯**：东端 `(8200,5150)` → `(7950,5500)` → `(7600,5700)` → `(7000,5800)` → `(6400,5750)` → `(5800,5600)` → `(5300,5400)` → `(4900,5100)` → `(4850,4500)` 闭环。
- 可选坡：`(7350,5450)` 附近 `peakHeight=12u`，S 弯可绕行。
- 三处挑战停车湾，配套 120×90 铺装 pad；不落草地。
- 标线：接入/桥/S 方向中心虚线；桥有自定义中心虚线与边缘栏杆/立柱。
- 桥面/坡道 mesh 由 `elevatedRoadProfile` 同一 profile 生成；轮胎、车体、相机使用同一 height sampling。
- 环岛可见岛半径 112.8u（低矮升台），碰撞使用同一半径的 32 边凸多边形，不再用 100×100 方块/空气墙。
- 为避让新路线，生成式建筑在 `x 3200..8400 / y 2900..6000` 停排；既有冲突仓库移出；补 8 个低层厂房 filler，最终 31 个大建筑。
- 路线小地图绘制 challenge terrain zone 与桥面轮廓/“桥”标记。

## 5. 碰撞边界（本轮最高重点）

### 玩家

- `utils/collisionFootprint.ts` 统一从实际模型 mesh 顶点生成 convex hull。
- **删除**旧的 `cfg.width*0.51` / `cfg.length*0.51` 裁剪；包含轮胎、后视镜和真实车角。
- 7 车型每个都断言：
  - footprint 长/宽跟随实际 model bbox（容差 0.75u，不再用 12% 宽松框作为契约）；
  - 实际车头重叠碰撞、鼻端外 2.5u 不碰撞；
  - 实际侧面重叠/外侧 1.5u 分离。
- 碰撞 body 仍用真实 hull，不以 `cc.width/length` 矩形替代。

### NPC

- `addParkedCarInstances` 对每辆固定车使用与实际渲染一致的矩阵：
  `placement * source.matrixWorld`，并额外使用新圆轮的 `wheelWorld * protoMesh.matrix` 实际顶点。
- **排除被隐藏的原 GLB 轮胎**，避免 hull 使用不可见旧胎。
- 生成局部 convex hull 写回 `Obstacle.collisionFootprint`；GameCanvas 的 live clone 再复制。
- 实体静态车身不再用 `width/height` 矩形替代；碰撞网格使用这些 hull。

### 高度分层

`vehicleLayersCompatible` 改为**垂直区间重叠**，不再是中心高度差 ≤4u：

- 车辆: `base = roadHeight`, `top = base + cc.height`。
- 障碍: `base = elevation`, `top = base + verticalHeight`（默认按类型）。
- 桥 rail：沿 ramp/deck profile 切成 88 个短段，每段 `elevation` 为该处真实高度，`verticalHeight=5`；不是一条 65u 高的整段墙。可视化连续横杆与同一 88 段的尺寸/位置一致。
- 桥墩：22×22u，`elevation=0, verticalHeight=65`，从地面延伸到桥面；visual 22×22，桥下/桥上都按区间判定。
- 桥面/桥下分离回归覆盖：ground car 通过桥下 rail；deck car 撞 deck rail；ramp car 撞 ramp rail；ground/deck car 均与桥墩区间相交。
- 删除 `slope-rail-overpass` 按车头方向 `cos<0.65` 的猜测跳过；改为高度区间。
- Cannon 不为 collision-only 桥栏杆/桥墩建立地面盒；akınematic solver 负责分层。

## 6. T 面板验收入口

- T 面板新增可见测试点按钮（停稳后传送）：
  平直加速、环岛、桥坡入口 `(5300,4500,0)`、桥上入口 `(6050,4500,0)`、桥下 `(6500,4250,PI/2)` 真正向前穿过桥下、S 弯按道路切线、崎岖、碰撞验证 `(2040,4100,PI/2)` 正对固定停车 NPC `(2040,4195)`，安全间距。
- **碰撞线框**开关：青色=玩家实际 hull，红=地面障碍 hull/矩形，黄=高架层障碍；不是隐藏 window。
- 实时读数：实际油门/刹车、纵向 g、动态俯仰、路面高度、NPC 静态数量、四轮行程/接地、音频 active。
- 已复现并读取 `docs/round6-terrain-collision-failure.png`：崎岖路 gate 箱体画面在地面下、红框在另一层。
- 修复补充：所有障碍在 scene build 回填 elevation/verticalHeight；静态 gate 不再被 Cannon 地面 pose 覆盖；Cannon movable 用 elevation 初始 y 并按实时 terrain/slope 支撑。
- 修复：scene build 统一回填所有障碍 `elevation=terrainHeightAt(x,y)+layer*.5`（显式桥层保留），`verticalHeight` 按 box/cone/car/wall 类型回填；静态 gate 不再加入 `movableMeshes`/Cannon movable，避免物理 pose 拉回地下；Cannon movable 的初始 y 加 elevation；静态墙 Cannon 位置加 elevation。场景后复制 metadata 包含 elevation。
- 小窗口 640×630：面板最大高按 `100vh - top - 12px`，除固定 header/footer 外的**全部内容区**放入同一可滚动容器（车型参数、实时状态、开关、测试点、参数一起滚动）；碰撞开关和测试点不再被裁出屏幕。
- 碰撞线框 group 在 `buildScene` 完成后迁移到真实 scene；initial visible 与 ref 一致，cleanup 移除 toggle listener、清线并 dispose 材质。T 面板测试点已改为：桥坡入口、桥上、桥下向前穿行、S 弯道路切线。
- 面板顶部关闭按钮保留。

## 7. 自动验证

- `npm run typecheck`：通过。
- `npm test`：通过。
- `npm run build`：通过；仅既有 chunk 警告。
- 关键输出：
  - `Keyboard pedals: W=0.15 Shift+W=0.3 S=0.12 Shift+S=1, brake priority; Space handbrake priority.`
  - `Pitch: light<0.025rad, heavy 0.02..0.051rad, 30/60/120 Hz convergent.`
  - `NPC/bridge: 30 fixed cars; deck 65u, 88 profile rails, pier interval 0..65u; reset positions identical.`
  - `Beijing scene: 31 large buildings ... 0 NPCs, 4 curved roads ... building/road SAT clear.`
  - 7 车实际 footprint/collision 通过。
  - `Movable props: local terrain floor support enforced above Cannon ground plane.`
  - 崎岖 gate 碰撞 base 与可见 terrain 高度一致。
  - 既有转向/座舱/音频/悬架/地形测试通过。

## 8. 明确限制 / 未验证

- 未做真实浏览器桥面/桥下/碰撞线框截图；需 Codex 实机。
- 桥面/ramp 是低模可玩表面，不是测绘级道路；环岛/S 弯/桥墩外观仍需实机检查和微调。
- 未做隧道、山体大型视觉；只保留低层厂房 filler；避免装饰拖慢。
- 挑战停车湾数量/位置需实机确认可入位。
- NPC hull 由实际实例矩阵 `placement*source.matrixWorld` 与新圆轮 `wheelWorld*protoMesh.matrix` 生成；已排除被隐藏的原 GLB 轮胎。自动测试覆盖玩家 7 车实际 hull；NPC 仍建议实机看碰撞线框。
- 可选 12u 陡坡可能不适合低动力车坡中起步；S 弯绕行可用。
- 未恢复菜单音乐；未改外部 GLB 资产。
