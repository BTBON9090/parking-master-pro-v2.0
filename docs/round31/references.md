# 车型、图形与实现参考

## 可核实公开资料

- 中国国防部关于 100 式的公开介绍：https://eng.mod.gov.cn/2025xb/D/V/16466555.html 和 https://www.mod.gov.cn/gfbw/wzll/yw_214068/16407637.html 。只据其外形与履带形式制作驾驶演示；本项目的 7.3×4×2.7 m、42 t、1000 kW、悬架与转向标定均为游戏估计，不是官方参数，无武器操作。
- Cat 797F 官方产品：https://www.cat.com/en_US/products/new/equipment/off-highway-trucks/mining-trucks/18093014.html 。2983 kW 使用公布额定功率；游戏矿卡外形、空载质量、转向与简化悬架仅作风格化参考，不是 Cat 授权复刻。
- 长头重卡外形参考 Kenworth W990：https://www.paccar.com/media/qjchqyol/w990-brochure.pdf 、https://www.kenworth.com/media/s2ulps2v/hd-bbm-2022-03012022.pdf 。22 轮组合、牵引车轴距和挂箱配置为原创组合与游戏参数，不等于官方固定配置。
- 前批车型来源保留在 ../round30/vehicle-references.md。

## 素材与实现

- 车辆为 Blender 脚本生成的连续壳体低多边形资产，独立车轮、车厢、驾驶舱等可追溯到 scripts/blender。手臂属于独立角色，不计入车辆资产三角面预算。
- Tesla / Lamborghini / Bugatti / MINI 图形来自 Simple Icons（CC0），标识版权仍属于各品牌。见 public/brands/ATTRIBUTION.md。
- 启动图标为本项目生成的三版原创图；运行时图标沿用 Lucide。
- 三轮车/拖拉机声音采用低频燃烧脉冲与已有录音声底混合，并非对应厂家现场录音。
- Three.js 0.185.1 + cannon-es 0.20.0 + 本项目纵横向/四轮接触求解。改进渲染资源复用和物理接触实现；不把升级实现称为更换整套渲染/物理引擎。
