# 角色与操控升级 · 最终验证

本记录对应 handling-v2。旧 pass-2/pass-3 文件保留为上一版历史证据，不能代表新物理系统。

## 改动

六位车手使用重建的头身比例、脸部、服装与标志性轮廓：马里奥的红色 M 帽、大鼻子和胡须，路易吉的瘦长比例，碧姬的王冠/金发/粉裙，奇诺比奥的红白蘑菇帽，耀西的恐龙轮廓，瓦力欧的黄紫服装。角色选择缩略图与比赛使用同一模型，选择实际替换玩家车手。

自由世界坐标驾驶取代赛道方向自动跟随；新增起跳、锁定漂移方向和反打调整、三级蓄力与松键加速、刹车倒车、低速原地转向、火箭起步及过早油门熄火、后视、顺序检查点与越界救援。绿壳直线并反弹，红壳追踪，香蕉落后方，蘑菇加速。键盘、触屏和标准手柄接入同一套运动逻辑；Nintendo 手柄自动按 A/B 的实际位置映射。

## 验证结果

- `npm run build`：TypeScript/Vite 构建通过。JS 589.67 kB，gzip 159.93 kB；CSS 22.54 kB，gzip 5.79 kB。单包超过 500 kB 的提示为非阻断提示。
- `node --experimental-strip-types tests/driving.mjs`：10 项物理检查通过，包括自由朝向、转向符号、起跳落地、反打保持漂移、紫色蓄力和释放、倒车/逆行、受击禁止倒车加速、原地转向、检查点防抄近路和救援。
- [浏览器行为测试](handling-v2/playtest.json)：17 项通过，浏览器错误为空。实际键盘输入连续经过第 1、2、3 圈，比赛时间 47.650 秒，第 1 名，626 次转向控制采样；没有通过测试接口改变这场完整比赛的进度。见 [全程数据](handling-v2/full-race.json) 与 [冲线](handling-v2/full-race-finish.png)。
- 起步、角色选择、指南、起跳/漂移、暂停冻结和恢复、后视、绿壳/红壳发射、金币/道具碰撞、冲线/重赛、触屏加速/转向、pointercancel 均通过。漂移蓄力最高记录 1.65；三级释放另由确定性物理测试覆盖。
- [手柄测试](handling-v2/gamepad.json)：6 项模拟输入检查通过，Nintendo 与 Xbox 布局分别验证 A 加速、B 刹车到倒车、操作指南阻止 START 开赛。通过注入浏览器 Gamepad 状态测试，未使用实体手柄。
- 完整比赛后只调整了 Nintendo 手柄映射及对应指南文案；该修改经重新构建、定向手柄测试和最终画面检查。键盘完整比赛证据保留。

## 画面

已目视检查角色正面、比赛追车视角、漂移动作、桌面操作指南、手机菜单和比赛画面。Mario 的帽徽/胡须/五官可见，Peach 和 Yoshi 等具有各自轮廓；实际比赛中前轮随转向偏转、四轮滚动，跳跃离地和漂移火花可见。

- [马里奥正面](handling-v2/hero-mario.png) · [路易吉](handling-v2/hero-luigi.png) · [碧姬](handling-v2/hero-peach.png)
- [奇诺比奥](handling-v2/hero-toad.png) · [耀西](handling-v2/hero-yoshi.png) · [瓦力欧](handling-v2/hero-wario.png)
- [起跳](handling-v2/hop.png) → [持续漂移](handling-v2/drift-hold.png) → [释放](handling-v2/drift-release.png)
- [桌面比赛](handling-v2/desktop-active.png) · [手机比赛](handling-v2/mobile-active.png) · [手机菜单](handling-v2/mobile-ready.png) · [操作指南](handling-v2/controls.png)

[桌面像素检查](handling-v2/desktop-active-play.json)和[手机像素检查](handling-v2/mobile-active-play.json)都通过非空渲染验证，无控制台或页面错误。测试 GPU 是 Apple M2 Max / ANGLE Metal。固定 active-play 状态：

| 指标 | 桌面 1280×720 | 手机仿真 390×664 |
|---|---:|---:|
| Draw calls | 300 | 263 |
| 三角形 | 537,938 | 518,360 |
| 几何对象 | 296 | 285 |
| 纹理 | 6 | 6 |
| 色彩熵 | 5.84 | 5.72 |
| 非主色像素占比 | 87.7% | 85.2% |

手机画面超过起始性能预算（150 calls / 300k triangles / 200 geometries），本次保留用户要求的角色细节；低端手机性能仍未实测，不能据桌面 GPU 推断手机帧率。当前 DPR 上限为手机 1.5、桌面 2，角色按材质合批。

## 边界与参考

角色是本地程序化雕塑，非任天堂原版资产，也不是原版物理的一比一复刻。Tripo / Gemini / ElevenLabs 的配置探测均缺失，未提交外部生成任务或付费任务；因此采用本地建模。用户提供的参考图用于识别角色视觉特征，没有作为运行时贴图。音频沿用合成引擎和事件声，未进行主观听音质量评测。单人本地模式，无联网多人。

操控参考：[任天堂基本操作](https://support-jp.nintendo.com/app/answers/detail/a_id/34439/)、[Mario Kart 8 官方说明书](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/wii_u_6/mario_kart_8/ElectronicManual_WiiU_MarioKart8_EN.pdf)。漂移、后视、火箭起步、倒车和龟壳区别参考其规则；具体速度、转向及三级蓄力阈值为本项目调校。

`artifacts/evidence.json` 已更新为本轮文件，所有引用存在。启动方式和完整操作见 [README](../README.md)。
