# 重车资产独立复核 · 0.26.0 基线后的本轮修复

## 洲际长头 US22

- 原 Blender 生成器拉长货箱时对挂车子树中所有网格顶点的本地 Y 轴乘以 1.42，连带把原有 8 条轮胎和轮毂压成椭圆；实测其中轮胎 Y / Z 直径约为 1.06 m / 1.505 m。后加的 4 条轮胎为圆形。
- 生成器现在只拉长货箱及非车轮几何，并调整轮组位置；车轮网格保持圆形。`tests/trailerWheelRoundness.test.ts` 覆盖普通半挂 8 个、US22 12 个挂车轮，在 0° / 45° / 90° 的圆度与尺寸。
- Blender 文件及 4 张渲染图在 `vehicles/Blender-US22.blend` 和 `vehicles/US22-*.png`；游戏内 Chrome 真实场景侧视图为 `vehicles/US22-ingame-side.png`。浏览器内 P 解除后挂 1 挡、按油门，仪表显示 5 km/h。此验证不等于 Android 真机验收。
- 原游戏车侧镜头只框住牵引车，远跟镜头落在挂箱内；针对 SEMI / US22 增加挂车尺度对应的侧视及跟随距离。截图显示整套牵引车与挂车。

## 矿用自卸车 MINING

- 原车身实心几何在后轮中心上方约 1.355 m 处与轮胎径向射线相交，轮胎半径约 2.02 m，属于约 0.665 m 的几何重叠。现于前后、左右及双胎区建立 2.20 m 半径轮拱，保留静态 0.18 m 径向设计余量。
- `tests/miningWheelClearance.test.ts` 对各轮中心在侧平面发射 32 条射线，测试射线从中心到轮胎外沿内侧 0.03 m 不与车身 Body 相交。它并非所有悬架行程与所有内胎表面上的完整三维体积证明。
- Blender 文件与渲染图在 `vehicles/Blender-MINING.blend` 和 `vehicles/MINING-*.png`；`vehicles/MINING-ingame-side.png` 是独立游戏视角检查。矿卡侧视镜头同步拉远；浏览器内 P 解除并挂 D 后起步至 2 km/h，非 Android 真机结果。

## 重建命令

在项目根目录依次执行：

```sh
FLEET31_ONLY=US22 FLEET31_OUTPUT_DIR="$PWD/docs/round32/vehicles" /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/build_round31_heavy.py
FLEET31_ONLY=MINING FLEET31_OUTPUT_DIR="$PWD/docs/round32/vehicles" /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/build_round31_heavy.py
```

每条命令只重新生成指定模型的 public GLB 和本轮输出，不覆盖其他车型及 round31 证据。注意运行后仍需实际游戏内检查，再同步目标端的包。

## 其余待独立核对

- 静态轮心射线初筛：轻卡、中巴后轮上缘可能与 InteriorLeather 分别有约 0.05 / 0.085 m 重叠；普通半挂第二后轴可能与 TrailerShell 有约 0.04 m 重叠。射线初筛不能证明外表面可见穿模，需 Blender 与游戏内复核后再修。
- 矿卡 DriverEye 平视射线曾在左右约 30°–35° 命中 CabShell；后续视野复查与调整见下文，其他车型仍需单独核查。
- 胎径仅为游戏资产几何 / 游戏标定数值，不能据此称已按某个具体厂家车型认证。除本次针对 US22、MINING 的定向修改，不代表其他车轮或车宽已全部修正。
- Android 上轮胎运动、相机表现、帧率与发热需由主任务单独验证。

## 驾驶舱 A 柱视线复查

- `scripts/probe-driver-visibility.ts` 对真实 GLB 经游戏归一化、座椅调整后的驾驶眼位，在水平面向前 ±90° 以 1° 间隔逐条检测车壳。此测量只描述几何遮挡，不包括后视镜、驾驶员、界面和道路，并不是实际视野标准认证。
- 原 L80 车壳遮挡 −54° 至 −51° 和 +22° 至 +27°；左右不对称部分是驾驶眼位偏置，并不能只据此证明 A 柱过宽。当前未修改 L80，应结合用户实际手机画面与座椅、镜头设定进一步核对。
- 原矿卡驾驶舱车壳遮挡 −38° 至 −30° 和 +30° 至 +38°，分别为每侧 9 条射线。将驾驶舱前窗小幅加宽，并使侧窗前沿向前延伸后，遮挡为 −36° 至 −31° 和 +31° 至 +36°，每侧 6 条射线；0° 正前及 ±29° 范围在该水平截面无遮挡。A 柱仍存在，外形为原创的艺术近似，不代表特定真实矿卡尺寸。
- 修改前对照位于 `vehicles/mining-visibility-before/`，最新 Blender 内外渲染位于 `vehicles/MINING-*.png`，真实游戏高速驾驶舱静态画面位于 `vehicles/MINING-ingame-cockpit-visibility.jpg`。本次使用桌面 Chrome，并非 Android 实机；不同竖向角度、左右转头、行驶中悬架与长期视线舒适度仍需真机验证。
- `tests/miningVisibility.test.ts` 检查游戏眼位前方和两侧 A 柱的水平采样角度，`tests/miningWheelClearance.test.ts` 的矿卡轮拱回归通过。该可视角测试不能替代完整视觉、碰撞或结构安全验收。
- L80 实际驾驶舱静态截图在 `vehicles/L80-ingame-cockpit-visibility.jpg`，驾驶侧 A 柱确实显眼；补充射线确认除车体外 `Surface_CarRoot_BlackTrim` 也构成窗边遮挡。L80 车壳的窗洞、玻璃与密封条采用整车连续结构，且资产后来有 round15 门槛/轮拱修补，直接重跑 round9 原始生成器会丢失后续修补。尚未取得能同时保持玻璃密封、车壳和轮拱的局部重建验收，因此本次没有改 L80，留待逐项重建和双重检查。
