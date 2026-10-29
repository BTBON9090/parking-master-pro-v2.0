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

- 正式dist浏览器独立复验通过：无开发car钩子，K重绑油门不会触发雨刮，V重绑车灯不会换挡；无页面脚本错误，production-browser.json。
- 源码提交19606e99f35eb61ff2808924156a563e610b819a已推送。GitHub Actions 40818340096与该提交一致，Windows和iOS无签名编译均success。
- HTML桌面1280px/手机390px布局与F046检索通过，report-browser.json；新增F045–F047，总47项。

- Windows原代理下载较慢，改从GitHub API取限时产物地址直接下载；zip的服务器SHA-256和workflow head均匹配。停止了仅本轮的冗余代理传输，未改系统代理。windows-artifact.json保留核验结果，无凭据/限时URL落盘。
- Windows安装包内96个资源：88个逐字节一致，8个仅平台换行（index.html含空行）差异；JS/CSS/模型/声音全部逐字节一致，windows-package-check.json。
- 发布清单与静态下载链接生成；releases.test.ts再次通过。

## 发布完成

- GitHub v0.27.1已公开，五个包和SHA256SUMS共6项服务器digest与本地完全一致，github-published.json。
- COS先上传并核验不可变安装包，再上传下载站和两份报告，最后发布latest.json；cos-assets.txt / cos-publish.txt记录顺序。
- COS源站/CDN清单均为0.27.1。下载页、功能索引、发展报告公开内容与本地逐字节一致；CDN完整下载Android包27,053,039字节，SHA-256 d4be86b0104cf762947eac2e97b24bea2c674bbbea50587267a383f293ee4fef。
- 公网浏览器检查版本、Android链接、47项计数及F047检索通过，无页面脚本错误，online-browser.json。
- 下载：https://cdn.btbon.cn/parking-master/index.html#download
- 清单：https://cdn.btbon.cn/parking-master/features.html#overnight-progress
- 所有本轮浏览器已关闭；临时生产预览5312端口已停止，用户原有5190/4311预览保留。没有操作手机、付费或改系统设置。
