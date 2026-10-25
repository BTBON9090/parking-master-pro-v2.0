# 第五轮音频素材与处理记录

## 第 20 轮更新（2026-10-25）

以下更新覆盖本文后面的早期混音描述：胎噪目前采用低通处理，驾驶舱隔音与车外音量独立设置；不再使用早期的 420 Hz 高通方案。EV 驱动声仍为低频负荷合成，下面的 EV 素材是上电/下电提示，不是车型专属电机实录。

| 新增文件 | 原始来源与作者 | 许可 | 处理 |
|---|---|---|---|
| `ice-start.wav` | [Car Engine Start 01](https://opengameart.org/content/car-engine-start-01)，looneybits | CC0 | 完整 1.647 秒，峰值 0.48 |
| `ice-stop.wav` | [Car on a road](https://bigsoundbank.com/car-on-a-road-s1286.html)，Joseph SARDIN / Peugeot 107 | CC0，[许可](https://bigsoundbank.com/licenses.html) | 60–64 秒，峰值 0.32 |
| `ev-start.wav` | [Interface Sounds](https://kenney.nl/assets/interface-sounds)，Kenney，`confirmation_002` | CC0 | 0.539 秒，峰值 0.25 |
| `ev-stop.wav` | 同上，`close_002` | CC0 | 0.314 秒，峰值 0.22 |

新文件统一为 44.1 kHz、单声道 16-bit PCM，去直流，25 ms 淡入与最多 160 ms 淡出。播放按发动机状态变化触发一次，稳态不重复，切换关闭音效会停止正在播放的片段。车内/车外使用不同的低通频率及音量。上述声源是通用录音与拟音，不冒充皮卡或电动车原厂声纹。

泊车提示改为 65 ms 短音，间隔至少 260 ms；只检测当前高度层的实体障碍，车速超过 15 km/h 不鸣响，静止 1.8 秒后停止，标线不参与障碍检测。

验证：浏览器显示 11/11 素材已解码；自动测试通过启动、关闭、重复触发抑制、音效关闭、暂停与失焦。尚未进行真人盲听，不将可读文件或节点测试当成主观听感验收。

本轮只使用明确 CC0 的真实录音/拟音，未使用商业游戏素材，也没有把同一录音变调冒充多份 RPM 实录。

## 素材清单

| 本地成品 | 来源页面 | 作者 / 性质 | 许可 | 原长 | 使用裁剪 |
|---|---|---|---|---|---:|---|
| `engine-idle-loop.wav` | https://bigsoundbank.com/voiture-sur-route-s1286.html | Joseph SARDIN，Peugeot 107 车内真实启动/加速/行驶/刹车/停机 | CC0（页面明示） | 70.632 s | 52–57 s 低负荷/怠速段 |
| `engine-load-loop.wav` | 同上 | 同一声源的车内负荷行驶段 | CC0 | 70.632 s | 20–25 s |
| `road-loop.wav` | 同上 | 同一声源的沥青/轮胎滚动底噪 | CC0 | 70.632 s | 36–41 s |
| `skid-loop.wav` | https://bigsoundbank.com/screeching-tires-1-s2368.html | 四轮胎尖叫实录 | CC0 | 2.208 s | 0.05–2.15 s |
| `gravel-loop.wav` | https://bigsoundbank.com/bike-on-gravel-mtb-1-s1284.html | 车载自行车碎石滚动拟音；**不是汽车录音** | CC0 | 19.824 s | 4.0–9.0 s |
| `metal-hit-1.wav` | https://opengameart.org/content/metal-impact-sounds | Brian MacIntosh / BMacZero，`thud2.wav` 金属碰撞拟音 | CC0 | 0.580 s | 0.0–0.45 s |
| `metal-hit-2.wav` | 同上 | `thud3.wav` | CC0 | 0.418 s | 0.0–0.35 s |

明确未使用：
- `racing-car-engine-sound-loops` 的“六档”只是同一录音变调，不作为六份不同 RPM 实录。
- `tire_rolling_1`（Freesound 390798）原档需要登录，未卡登录；改用上面的自行车碎石拟音并如实标注。
- 未使用 `large-metal-sheet-hitting` 的 GPL3 档。

## 处理

1. 下载源文件到临时目录；用 macOS `afconvert` 解码为 48 kHz / 16-bit / 单声道 WAV。
2. Node 处理：
   - 去 DC；
   - 循环段选**零交叉端点**，端点归零并加 ~1 ms 去咔哒窗（不是靠长淡入淡出来掩盖拼接）；
   - 软压缩：threshold 0.42、ratio 2.4；
   - 峰值归一化：循环 0.55–0.8，碰撞 0.9；
   - 碰撞做 8 ms 首尾淡出；
   - 输出 48 kHz mono 16-bit WAV。
3. 循环接缝断言：所有循环首/尾样本为 0，峰值 < 0 dBFS。`npm test` 中 `Audio assets` 会读 WAV 头和首尾样本。
4. 成品总计约 **2.1 MB**（7 文件）。原下载源文件不随产品发布，来源/裁剪/许可保留在本记录。
5. 可重跑脚本：`node scripts/process-audio-round5.mjs`；脚本内记录源 WAV 命名、裁剪区间、零交叉/1 ms de-click、压缩/归一化。源文件放 `public/audio/source` 或设置 `AUDIO_SOURCE_DIR`（源文件不随产品发布）。

处理参数（可复现）：
```text
afconvert -f WAVE -d LEI16@48000 source.mp3 source.wav
DC remove -> cut -> zero-crossing endpoints -> 1 ms de-click
soft compressor threshold .42 ratio 2.4 -> normalize peak 0.55..0.9
```

## 播放与混合

- `utils/recordingAudio.ts` 只创建一套循环节点；不重复初始化。
- 发动机：idle/load 两层按 rpm、throttle 交叉；EV 不启用燃油层。
- 道路：road-loop 来自燃油 Peugeot 车内录音，含发动机低频；播放层加 **420 Hz 高通** 分离道路/胎噪近似，EV 不启用发动机层，也不应被描述为纯 EV 实录。这是近似，不是盲听验证。
- 碎石：gravel-loop 只在训练碎石支路/高度场。
- 滑胎：skid-loop 仅在真实滑移/漂移或高速急转制动时触发；**普通直线减速刹车不无条件尖叫**。碰撞：metal-hit 一次性。
- 调参面板显示音频 loaded/total、ACTIVE/MUTED 和 surface；不是只听文件存在。
- 雷达：保留电子合成提示（如实标注）。
- 菜单无背景音乐；按钮声保留。
- Pause / 窗口失焦 / 页面隐藏：持久 lifecycle 状态与 enabled/volume 共同决定 master；不是一帧覆盖。
- 解码任一失败：整体保持 synth fallback，状态显示 failed，不把失败当成功。
- 调参面板显示 `音频素材 loaded/total`，无需隐藏 window 探针。

## 已存在/未验证

- 已自动验证：7 文件 WAV 可读、48 kHz、循环首尾为零、峰值 < 0 dBFS、生命周期/异步 generation 回归。
- 未验证：真实浏览器听感、发动机分层切换是否自然、碎石拟音是否合适、音乐/菜单音量平衡；需 Codex 实机。不能把未听过的音效写成“听感通过”。
