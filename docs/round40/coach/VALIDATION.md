# 大巴轮胎与车身比例检查

2026-10-29，针对用户反馈上一版放大车轮后车身仍显瘦高、怀疑原轮径更合适：

- COACH 四轮恢复到约 1.0435 m 直径，轮宽 0.295 m 不变；动力学轮胎半径同步恢复到 0.52175 m。这个游戏参数由 295/80 R22.5 的名义尺寸换算，另一款 315/80 R22.5 名义直径约 1.0755 m；[Volvo 9700 公布了这两种规格与 2.55 m 宽、3.65 m 高的车型示例](https://www.volvobuses.com/content/dam/volvo-buses/markets/master/coaches/complete-coaches/volvo-9700/specifications/9700-downloads/data-sheet-9700-13-1-second-door-behind-rear-axle-euro-6-en-2019.pdf)。本游戏大巴并非对该车的官方复刻，名义尺寸不代表厂商实测。
- 车身外宽 2.55 m、整车含天线模型最高点约 3.65 m 保持；调整生成模型车顶肩部宽度由约 2.35 m 至约 2.50 m，并适当加宽前挡风玻璃开口，使顶部不再明显向内收窄。最大车身宽度、轮距、碰撞宽度不变。此次属于造型改善，不代表已解决用户在所有设备上的瘦高观感。
- 检查 `normalizeModel` 与模型注册表：本车使用统一 10 倍缩放；车库预览对三轴整体缩放、游戏摄像机按画布宽高设置 aspect。Chrome 游戏画面 CSS 与画布宽高比约 2.0566 与 2.0583，未发现显著横纵向非均匀拉伸；这不能代替特定安卓设备/视角检查。
- 重新 Blender 四视图渲染并保存 Blender 工程：`Coach-front.png`、`Coach-side.png`、`Coach-three-quarter.png`、`Coach-interior.png` 与 `Blender-Coach.blend`。真实 Chrome 游戏最终模型驾驶舱和静态外部侧视可见路面、轮胎圆形且在平路接地，截图 `Coach-cockpit-final.png`、`Coach-ingame-side-final.png`，车库预览 `Coach-garage-final.png`。动态悬架、极限转向/碰撞及安卓实机尚未验收。
- `tests/coachWheelEnlargement.test.ts`（轮胎尺寸、圆度、轮宽、悬架行程采样、车顶宽度和配置）、`tests/round28.test.ts`（前窗视野、轮胎）、`tests/driverSeatClearance.test.ts` 和 `tests/expansionVehicles.test.ts` 通过；Blender 输出三角形数 7668，低于 8000 预算。轮拱仅按固定离散位置采样，并非所有路况穷举。
