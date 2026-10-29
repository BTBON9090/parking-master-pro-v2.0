# Round 39 · 重卡车轮与车厢

用户在安卓反馈两款重卡轮胎和车厢重叠，车身仍显瘦高，并怀疑放大前的轮径更合适。

- SEMI、US22 的牵引车和挂车胎径恢复到 **1.06 m**、轮胎宽度不变。此为游戏标定；例如米其林公开的 295/80 R22.5 产品外径为 [1.052 m](https://business.michelinman.com/tires/michelin-x-coach-z)，并不证明游戏模拟了该型号。物理传动半径同步 0.53 m；挂车滚动和接地继续按各轮实际半径。
- 从 Round38 前带有原点和驾驶舱等 extras 的原始 GLB 恢复车轮与原车轴间距；为车身及挂箱重新开挖轮拱、清除轮胎内侧模型面及布尔切割端面，轮胎圆度不变。`scripts/blender/round39_heavy_wheels.py` 可从此目录 `base/` 的原模型重建，并另存两车 Blender 源文件及四视图。两个模型导出保留 fixed_origin 和驾驶舱、挂车标定数据。
- 新增 `tests/heavyTrailerDynamics.test.ts` 加载实际两车 GLB，在平路和 ±2% 坡上模拟各 120 帧，检查各轮接地和轮胎与全部挂车网格的 32 径向、三个轴向切片交叉；静态轮拱另检查最大左右转向和三种悬架高度。有限采样不证明所有连续转角、坡度和碰撞状态都没有穿模。
- Chrome 中使用独立开发服务、城市地图及左正视角，观察两车车身、挂车及轮胎，均可挂一挡低速起步（US22 约 3 km/h，SEMI 约 2 km/h）；静止和低速侧视未见明显轮胎穿入箱体。Android 及驾驶中复杂路面尚待复验。
- 宽高视觉：两车进入游戏时模型和车身 world scale 均为 `[10,10,10]`，未观察到非均匀压缩；US22 主体包围盒约宽 2.436 m、高 3.357 m，SEMI 约 2.475 m × 3.292 m，挂车箱体约宽 2.50 m。正视正交图见对应文件夹的 `front-straight.png`。用户对比例的观感仍未通过安卓验收，本轮没有依据主观感受任意扩大总宽。
- `tests/heavyWheelSize.test.ts`、`tests/trailerWheelRoundness.test.ts`、`tests/heavyVehicleRuntime.test.ts`、`tests/heavyTrailerDynamics.test.ts`、`tests/driving.test.ts` 均通过。后续全量回归须包含新增动态测试。
