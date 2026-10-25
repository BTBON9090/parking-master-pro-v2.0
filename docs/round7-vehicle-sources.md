# 第七轮车型来源与测量口径

访问日期：2026-10-23。网络页面可能在地区/版本间变化；下表记录本轮实际打开的资料与代码采用的解释。

## 比亚迪 海豹08 DM-i

官方参数页（用户 Chrome 完整加载）：

- https://www.byd.com/cn/parameter-comparison?goodsId=10055

| 项目 | 官方值 | 代码采用 |
|---|---|---|
| 车身 | 5150×1999×1505 mm | 51.5×19.99×15.05 u |
| 轴距 | 3030 mm | 30.3 u |
| 前/后轮距 | 1715 / 1730 mm | 单一 `trackWidth=17.225` u（前后平均） |
| 整车质量 | 2145 kg（四驱 2270 kg） | 2145 kg，DM-i FWD 训练标定 |
| 电机 | 200 kW / 315 N·m，EHS 电混 | 200 kW / 315 N·m；保留明确标注的燃油 MT 训练模式 |
| 最小转弯半径 | **4.95 m**，官方页面未注明外廓/中心线/外轮定义 | 游戏采用**外前轮轨迹**口径；反求前轮锁角 38.13°，后轮 ±7° 反相 |

说明：4.95m 不是本实现声称的“官方外廓实测”；它官方只写“最小转弯半径”。外前轮是游戏验收采用的口径，已写进 `turningRadiusDefinition` 和测试。

## 小米 SU7

官方配置页（当前显示 SU7 Max / Pro / 标准版三列）：

- https://www.xiaomiev.com/car-config

官方三列均给出轴距 3000 mm、最小转弯半径 5.7 m。当前代码：

- wheelbase 30.0u，trackWidth 16.8u（轮距量级按实际轮组约 1.68 m，训练近似）；
- 采用外前轮口径反求锁角 36.83°；
- 不把任何未标注的外廓定义写成官方实测。

## 小米 YU7

- 官方页：https://www.xiaomiev.com/yu7

该页面目前混合了 YU7 GT 内容。本轮**没有**把 GT 的新参数用于普通 YU7；代码保留既有普通 YU7 训练值（轴距 30.0u、目标半径 5.9m、外前轮口径锁角 35.32°），并在车型表注明版本风险。待拿到普通 YU7 对应版本的独立参数页后再更新。

## 其他训练车型

- SUV / Concept GT / TRUCK / ZUNJIE 的 wheelbase、track、转向半径多为训练近似或模型拟合；不标成原厂公布值。
- Concept GT 是 Khronos `Car Concept` 免费模型进入 SPORTS 槽位的训练车，不是 Ferrari，也不是海豹；物理/轴距是训练标定。
- 外前轮/中心线/车身外廓不是同一个半径。代码测试同时给出：
  - 四轮共同 ICR：`q=(tanδf−tanδr)/L`；
  - 外前轮轨迹：`hypot(L−ICRx, ICRy+halfTrack)`；
  - 中心路径曲率：`q·cosβ`；
  - 车体中心路径长度严格等于传入 `distance`。

## Concept GT 模型许可

- 本地：`public/models/cars/concept-car.glb`
- 来源：https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
- 原始公域概念：Unity Fan（Sketchfab CC0）
- 清理/打包：© 2024 Darmstadt Graphics Group GmbH, Eric Chadwick
- 许可：CC BY 4.0
- 本地全文：`public/models/cars/concept-car.LICENSE.txt`

## 性能记录边界

用户实机记录（不是本实现自测）：

- Concept GT spawn：mean/p95 约 70/120 ms；
- Sea08 停车湾：约 40/104 ms，另一次约 17/27 ms；
- NPC 停车区：约 29/52 ms。

本轮优化为：NPC/停放车不再使用 Concept（低模池）、Concept 内饰外部隐藏、小内饰/刹车件不投影、第一人称禁用破碎 Concept 车壳、镜面恢复每帧合成（不再 scissor 限频以免露主相机）。未重新声称性能达标；需实机复测。
