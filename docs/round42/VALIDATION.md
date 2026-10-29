# 0.27.1 验证记录

用户最新要求先跳过温升、A柱、NPC完整散架、正时及正式逐轮驱动，推进能独立验证的修复；沿用更新版本、推送及COS发布授权。未操作手机，未新建续作自动化。

## 修复与证据

1. 旧版按住油门后重置，再移动旧指针，油门从0重新变成100%。真实React事件复现见 before.json。新版清空所有接触记录、边缘转向定时器与键盘状态；Chrome CDP双触点保持两个手指情况下验证旧指针无效、新触点有效，browser.json。
2. document.hidden且未触发blur时释放键盘/触控，拦截隐藏期间重复keydown；模拟visibilitychange在实际游戏验证油门回零。该事件模拟不等于Android系统生命周期验收。
3. 昼夜不再由开启天气或入图随机产生；可选择、即时生效、保存。八种雨雪雾组合、关闭天气不改变夜晚、重新加载保存设置均通过浏览器检查。
4. PrecipitationField保持900雨线/800雪点预算，按累计模拟时间计算位置；高海拔锚定路面，动画包围球覆盖全过程。30/60/90/120/144 Hz、暂停与长间隔、全部组合、几何/材质释放、雾/时段切换缓冲复用的回归见 tests/precipitation.test.ts。
5. V 空挡恢复，K 雨刮；空挡不自动拉驻车手刹。已有自定义绑定优先。游戏内按键检查通过。

## 测试方法与中间失败

browser-first-failure.json 是CDP测试脚本错误地用touchEnd传剩余触点的失败记录，随后将两指维持到断言再全部释放，真实指针事件记录见browser.json；没有因此放宽断言。before.json 的旧代码合成指针复现与新版真实CDP触点检查属于不同层证据，均保留。weather-day-snow.png已独立查看，雨雪为现有低多边形视觉风格。

## 边界

没有新的Android实机/温升数据，不把桌面帧率或CDP手势当作手机结论。没有改车辆模型，无新增付费资产、引擎或服务；逐轮实验仍隔离。隧道屋顶逐粒子遮雨、全面气象模型不在本轮范围。

## 构建与发布

版本0.27.1，Android/iOS构建号2701。完整回归、构建及远端核验结果在本轮完成后追加。

- 完整 npm test PASS，历史round JSON按运行前字节恢复；typecheck PASS。旧JSON和Blender缓存的既有本地变化保留。
- 实际雪岭地图高海拔场景及暂停时开启雨已检查，粒子锚点与路面一致；截图 weather-settings.png / mountain-weather.png 已独立查看。browser.json 含实际高度、设置八组合及无页面脚本异常结果。
- Android签名验证通过；APK、iOS工程ZIP、两种Mac app.asar 各96个网页资源与dist逐字节一致，版本0.27.1。见package-check.json / mac-package-check.json。
