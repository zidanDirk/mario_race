# 原创竞速配乐

本工程的原创旋律与程序合成编曲，源文件 `src/race-music.ts`。未使用原版游戏录音、第三方音乐采样、外部模型或生成服务。乐器是合成音色，不是真实乐队录音。

| 文件 | 曲名 | 节奏 | 长度 | 格式 |
| --- | --- | --- | --- | --- |
| mushroom-race.mp3 | 晴空冲刺 | 144 BPM | 53.333 秒，32 小节 | MP3 / 160 kbps / 32 kHz / 双声道 |
| castle-race.mp3 | 月下疾驰 | 152 BPM | 50.526 秒，32 小节 | MP3 / 160 kbps / 32 kHz / 双声道 |

明亮铜管主旋律、切分和弦、木琴式键盘、跳跃贝斯和鼓组。夜赛使用不同旋律/和声及更密的高音打击乐。最后一圈以 `2 ** (2 / 12)` 倍速播放，升高一个全音并提速约 12.2%，分别约 162 / 171 BPM；保持乐句位置。循环尾音预先折回开头。

运行时仅在用户手势后加载当前赛道 MP3，使用 Web Audio 解码与循环播放，按赛道缓存；不会现场合成整首曲子。音乐、引擎与提示音单独混音，提示音触发短暂音乐闪避；母线限幅。暂停、后台、切站、冲线和重赛停止或切换对应循环，暂停保留播放位置。

## 重新生成

先启动 Vite 本地预览，然后运行 `node tests/music-render.mjs`。该脚本离线渲染完整 WAV 到 `artifacts/audio-v1/*-loop.wav` 并检查音量、循环接缝和时长。随后分别编码（需要 ffmpeg）：

```sh
ffmpeg -hide_banner -loglevel error -y -i artifacts/audio-v1/mushroom-loop.wav -codec:a libmp3lame -b:a 160k -ar 32000 src/audio/mushroom-race.mp3
ffmpeg -hide_banner -loglevel error -y -i artifacts/audio-v1/castle-loop.wav -codec:a libmp3lame -b:a 160k -ar 32000 src/audio/castle-race.mp3
```

通过 `npm run test:audio` 验证生产构建与浏览器生命周期。完整渲染只用于制作素材，不属于运行时依赖。
