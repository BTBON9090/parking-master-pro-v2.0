# 0.25.0 车型资料与模拟标定

查阅日期：2026-10-28。全部模型由项目 Blender 脚本生成，为低面数风格化表达，不是原厂 CAD。完整车辆（含半挂车）不超过 8000 三角面。

| 车辆 | 公开资料用于校准的项目 | 来源 |
|---|---|---|
| 长途大巴 | 宇通 T12：12245 × 2550 × 3865 mm、轴距 6090 mm、295/80R22.5 轮胎、转弯直径 ≤18.5 m；对应外径约 1.044 m | [宇通 T12 官方参数](https://dk.yutong.com/products/T12-param.shtml) |
| MINI Cooper S 三门 | 3876 × 1744 × 1432 mm、轴距 2495 mm、DIN 质量 1285 kg、150 kW、300 Nm、7 挡 DCT、0–100 6.6 s、242 km/h、转弯直径 11.1 m | [BMW 官方技术表](https://www.press.bmwgroup.com/global/article/attachment/T0448167EN/628274) |
| Lamborghini Revuelto | 4947 × 2033 × 1160 mm、轴距 2779 mm、系统 747 kW、8 挡 DCT、四驱、四轮转向、前 265/35R20 后 345/30R21、2.5 s、超过 350 km/h | [官方产品册](https://www.lamborghini.com/sites/it-en/files/DAM/lamborghini/facelift_2019/model_detail/revuelto/2024/brochure/07_23/REVUELTO_DIGITAL_BROCHURE_EN_2024.pdf) |
| Bugatti Veyron 16.4 | 736 kW、1250 Nm、407 km/h、0–100 2.7 s、质量 1968 kg | [Bugatti 官方资料](https://newsroom.bugatti.com/press-releases/the-bugatti-veyron-on-the-track-of-the-targa-florio) |
| Tesla Cybertruck AWD | 5682.9 × 2031.6 × 1793.8 mm（不含镜宽）、轴距 3635 mm、方向盘总行程 340°、转弯直径约 13.25 m；四轮转向 | [Tesla 车主手册](https://www.tesla.com/ownersmanual/cybertruck/en_us/GUID-12A976DD-EB60-431B-AFF1-5A37E95006DB.html) |
| 尊界 V800 | 5495 × 2006 × 1850 mm、轴距 3430 mm；尊享版 390 kW、604 Nm、3120 kg、5.7 s；官方转弯半径 5.4 m，主动悬架行程 80 mm | [官方车型页](https://hima.auto/zunjie/v800/)、[配置页](https://hima.auto/zunjie/v800/configuration/) |
| 农场 145 | 原创通用拖拉机，以 Deere 6M 系列公开的 145 hp / 106.6 kW、7800 kg、50 km/h 等范围及前 600/60R28、后 710/60R38 尺寸为参考 | [Deere 6M 官方资料](https://www.deere.ie/en-ie/our-company/news/6m-series/) |
| 洲际重卡 | 原创通用 6×4 牵引车 + 双轴半挂：18 条轮胎。发动机功率参考 DD15 505 hp（约 377 kW）；游戏设定总质量 36 t、10 挡 | [Freightliner 官方产品册](https://www.freightliner.com.au/siteassets/documents/ftl0019_cascadia-brochure_2024.pdf) |
| 农用三轮货车 | 原创车型，970 kg、18 kW、55 km/h、5 挡，前单轮转向、后双轮驱动；不对应某一厂商型号 | 游戏模拟设定 |

## 公开参数与游戏参数的边界

- 弹簧刚度、阻尼、质心高度、轮胎力曲线、惯量、未公开的齿比及空气阻力均为游戏标定，并非原厂数据。
- Revuelto 的 1900 kg 是含运行装备的估计值，不能与官方 1772 kg 干重混称。游戏的等效系统扭矩不是发动机单机的 725 Nm。
- V800 后轮最大 12°、Revuelto 3°、Cybertruck 10°目前是配合转弯半径的模拟值，不能宣传为已核实的原厂极限角。
- 不同厂商的转弯直径可能采用路缘到路缘或墙到墙口径。游戏统一按外前轮轨迹半径反求虚拟单轨前轮角，再用阿克曼几何计算内外轮，便于可重复验收。
- 不将高速猛打方向等同于必然翻车：低重心跑车主要滑移，高重心 SUV 在足够侧向加速度和瞬态载荷转移下可能失稳，随后交给刚体模拟翻滚。
- 家用车满舵加速会走有限半径圆弧，不具备履带车辆的零半径原地旋转能力。油门力受轮胎横纵向抓地预算共同限制。
