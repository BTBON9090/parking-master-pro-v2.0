# 长途大巴：车轮和车身比例（2026-10-29）

- 应用户要求，COACH 原轮胎直径 1.0435 m × 1.4 = 1.4609 m；四只轮胎径向同比放大，轮胎宽保持 0.295 m，轮毂径向按比例增大，轮轴和轮拱同步调整。动力传动中的轮胎半径同步改成 0.73045 m；这是用户要求的游戏标定，不代表真实车型轮胎规格。
- 车身名义宽 2.55 m 保持不变，名义高从 3.865 m 调至 3.65 m；驾驶舱、眼点和物理配置按同一生成参数同步，含天线的模型顶点高度约 3.65 m。镜子向外突出，故含后视镜外宽约 3.21 m。
- 比例参考仅为[沃尔沃 9700 13.1 m 官方资料（2019）](https://www.volvobuses.com/content/dam/volvo-buses/markets/master/coaches/complete-coaches/volvo-9700/specifications/9700-downloads/data-sheet-9700-13-1-second-door-behind-rear-axle-euro-6-en-2019.pdf)：车身宽 2.55 m，车高含空调 3.65 m，轮胎 315/80 R22.5；本游戏车型并非该车复刻，也不宣称放大后的轮胎是这款车的规格。
- 四个 Blender 渲染为 `Coach-front.png`、`Coach-side.png`、`Coach-three-quarter.png`、`Coach-interior.png`，源文件为 `Blender-Coach.blend`。Chrome 游戏内独立选择 COACH，驾驶舱正前视野可见；在左正视角看到轮胎落在路面，静态无明显轮拱穿透。随后为消除天线造成的约 1.3 cm 高度偏差做最后一次重建，重新在游戏车库检查最终模型。安卓及车辆运动和复杂地形仍待验证。
- `tests/coachWheelEnlargement.test.ts` 检查四轮径向圆度、宽度、动力半径、静态着地、模型高度与轮拱三种悬架高度 × 三种横向位置 × 32 方向采样；`tests/driverSeatClearance.test.ts`（含 COACH）及 `tests/expansionVehicles.test.ts` 通过。采样并非对轮胎转向、全部悬架行程、碰撞几何和各种路况的穷举。
