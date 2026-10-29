# 老司机是怎样炼成的

基于 React、TypeScript、Three.js / WebGL2 与 cannon-es 的单机网页驾驶游戏。车辆、地图与模拟在浏览器本地运行，不需要游戏服务器、数据库或模型 API Key。保存的偏好在当前浏览器中。

9 个地图入口：城市与青岚山、综合驾驶试验场、三层地库、环线高速及五条挑战路线。24 辆可选座驾；车辆公开资料与游戏调校见 `docs/`，未核实参数不视作厂家标定。

## 本机运行

安装 Node.js 22 LTS，然后在项目目录运行：

```sh
npm ci
npm run dev
```

打开 http://localhost:3000 。正式版本检查：

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

`preview` 只用于本机预览，不用作正式公网服务器。浏览器需支持 WebGL2，并启用硬件加速。声音在第一次点击后解锁。

## 部署

本项目可以部署为纯静态网站。所有游戏依赖和 Tailwind 样式在构建时打包，模型、音频、缩略图随 `dist/` 输出；Google Fonts 只是可选的字体增强，断网时会使用系统字体。

### GitHub Pages

1. 仓库 Settings → Pages → Source 选择 **GitHub Actions**。
2. Actions → **Deploy game to GitHub Pages** → Run workflow，分支选 **main**。
3. 等待部署成功，打开该任务输出的网站地址。

工作流只手动触发，提交不会自动公开新版本，也不会创建 `gh-pages` 分支。针对本仓库的地址通常是 `https://btbon9090.github.io/parking-master-pro-v2.0/`，须以部署结果为准；推送源码不等于网站已部署。

### 其他静态主机 / Nginx

构建命令 `npm run build`，发布目录 `dist`。把 `dist/` 的**内容**上传到站点根目录，开启 HTTPS 和 gzip/Brotli；哈希文件可长期缓存，`index.html` 使用短缓存。

若发布在子目录，例如 `/driving/`，构建时设置：

```sh
BASE_PATH=/driving/ npm run build
```

不要直接双击 `index.html`（file:// 不适合加载游戏资源），也不要把开发端口暴露为正式服务。

参考：[Vite 静态部署](https://vite.dev/guide/static-deploy)、[资源路径](https://vite.dev/guide/assets.html)。

## 操作

- W 很轻油门，Shift+W 轻油门；S 轻刹，Shift+S 重刹。
- Space 按住手刹，松开放开。ABS 在设置中切换。
- D 前进挡，倒挡等以设置中的按键绑定为准；燃油皮卡提供手动挡。
- 左键拖动环视；驾驶舱双击回正；右键拖动方向盘。
- L 切换灯光，M 暂停 / 换车 / 换图，T 查看实时标定。
- 事故不暂停模拟；**R** 回到事故前最近的安全记录点并修复车辆。主动打开设置会暂停驾驶。

## 配置建议与限制

这些是开发阶段建议，**不是经过硬件矩阵测试的最低配置或 60 FPS 保证**。

| 目标 | 建议 |
| --- | --- |
| 日常体验 | Apple M1/M2 或同级 CPU、16 GB 内存、近期 Chromium 浏览器、硬件加速 |
| 1080p 高画质留余量 | Apple M1 Pro / M2 Pro 或 Windows 六核 CPU + GTX 1660 / RTX 2060 同级独显、16 GB 内存 |
| 输入 | 键盘 + 鼠标；笔记本接电，关闭其他重负载 WebGL 页面 |

本轮在 Apple M1 / 16 GB 上验收；帧时间记录见 `docs/round21/`。4K、高像素密度、多个实时后视镜和事故碎片会提高负载。暂未覆盖手机和低端集显，也不是工业级车辆仿真。资源授权与出处见 `public/models/`、`public/audio/` 和历史验收文档。
