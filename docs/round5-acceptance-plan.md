# 第五轮独立验收计划

分工：Codex 规划与实测，Chrome Car 专项会话的 DeepSeek-V4.1-Flash / Max 实施。

## 必测行为

- 转向：任意小数角连续变化；相同量正反输入返回零；跨零立即换向；中心辅助不吞掉连续微调；观察镜头不改变方向盘/挡位。
- 座舱：与第三人称使用同一车壳；原车头/窗框/车顶关系正确；左右侧窗可观察；没有外露轮胎或漂浮内饰；默认轿车和不同车身类别切换复核。
- 传动：记录各挡红线与建议速度带；一、二挡持续油门达到有限速度；升挡转速下降且能继续加速；低挡爬坡牵引更强；高挡低速拖挡、熄火、重启；电车无燃油熄火。
- 地形：从铺装道路可达训练支路；路面与采样高度一致；四轮接地独立响应；车身俯仰/侧倾/升沉衰减且受限；低速不穿透地面；不同车型配置有效；不同帧率稳定。
- 音频：本地样本实际存在且可解码；记录来源/许可/裁切；怠速、负荷、速度、路面、滑移、撞击分别驱动；熄火/暂停/失焦/静音生效；EV不混入燃油声；无菜单音乐。
- 回归：无油门静止、W/Shift+W、刹车、危险降挡拦截、镜框、地图定位、道路标线、NPC；typecheck/test/build；浏览器错误及当前窗口帧时。

## 来源核查

- BigSoundBank 1286，Peugeot 107 车内启动/加速/行驶/刹车/停机实录，CC0：https://bigsoundbank.com/voiture-sur-route-s1286.html
- BigSoundBank 2368，轮胎滑移录音，CC0：https://bigsoundbank.com/screeching-tires-1-s2368.html
- Freesound mhad 390798，碎石轮胎录音，CC0，原档下载需要登录：https://freesound.org/people/mhad/sounds/390798/
- 备选 BigSoundBank 1284，自行车碎石滚动实录，CC0；只能标注为接触拟音，不冒充汽车录音：https://bigsoundbank.com/bike-on-gravel-mtb-1-s1284.html
- OpenGameArt BMacZero / Brian MacIntosh，金属冲击拟音，CC0：https://opengameart.org/content/metal-impact-sounds
- OpenGameArt domasx2 引擎循环来自公共领域启动录音；六个文件仅变调差异：https://opengameart.org/content/racing-car-engine-sound-loops
- Mazda 官方正常加速换挡建议不等于各挡红线极速；只用于原理参考，不能声称是游戏其他车型的实车参数：https://www.mazda.ca/en/digital-owners-manual/2024/mazda3/contents/65740200.html

最终以独立复验记录为准。实现方报告、单元测试、实机视觉、主观听感必须分别描述，不能互相替代。
