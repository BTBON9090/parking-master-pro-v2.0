# 真实录音分层（2026-10-29）

所有新增原始素材来自 Joseph SARDIN / BigSoundBank，页面标注 CC0，可用于商业游戏、裁剪和再分发。

| 素材家族 | 来源 | 裁剪区间（秒） | 适用车型 |
| --- | --- | --- | --- |
| farm | https://bigsoundbank.com/small-tractor-s0499.html | 7–10、11–14 | 拖拉机、两款三轮车 |
| heavy | https://bigsoundbank.com/truck-engine-2-s1443.html | 4–8、38–42 | 大巴、中巴、重卡、矿卡、履带车、运输起竖车 |
| diesel | https://bigsoundbank.com/truck-engine-big-accelerations-s1147.html | 1–3、9–12 | 吉普、皮卡、轻卡、接驳车 |

源文件：https://bigsoundbank.com/UPLOAD/mp3/0499.mp3 、1443.mp3、1147.mp3。同一编号路径。源为真实户外录音；不是各车型专属的原厂录音。矿卡/大巴使用卡车录音作为通用柴油机音色，不能表述为这些车型的实录。车内区别由低通、音量及隔音混音实现，不是新增独立驾驶舱麦克风录音。

afconvert 解码 48kHz mono PCM；脚本 process-audio-round44.py 去直流、80ms overlap-add、归一峰值和1ms端点窗。引擎居中；道路/碎石左右对称声像，6/14ms短反射，双声道输出；原素材仍为单声道。碰撞继续使用已有两份 CC0 金属拟音分层，车内外不同滤波。电动车保留现有电驱合成。

验证状态：6 份新增循环已检查峰值、响度、端点（全部端点为 0、峰值 21000，无削波）；游戏已解码全部 17 份音效，失败数为 0。暂停/恢复门控、左右对称声像及双声道输出通过自动测试。未进行真人耳机听感验收。详见 audio-check.json、portal-live.json 与 test-logs/。
