# Mario Kart · 蘑菇王国大奖赛

本地 Three.js 卡丁车游戏：选择马里奥、路易吉、碧姬、耀西、奇诺比奥或瓦力欧，与五名 AI 对手竞速三圈。角色为本地重建的立体模型，非原版游戏资产；操控参考马里奥赛车的基本规则，物理参数为本项目调校。

## 启动

```sh
npm install
npm run dev
```

打开 http://localhost:5173 。生产版本运行 `npm run build`，然后 `npm run preview`。

## 操作

| 动作 | 键盘 |
|---|---|
| 加速 | W / ↑ |
| 刹车、停车后倒车 | S / ↓ |
| 左右转向 | A、D / ←、→ |
| 起跳、持续漂移 | 加速转向时按住 Space / R |
| 使用道具 | E / Q / 点击道具栏 |
| 向后看 | 按住 C |
| 暂停、继续 | Esc / P |
| 回到赛道 | Backspace，损失 3 枚金币 |
| 开始 | Enter / 开始比赛按钮 |

- 车辆按自己的朝向自由行驶。入弯起跳并按住漂移键，反打方向可以调整弧线；路面上蓄力，蓝、橙、紫三个阶段，松开漂移键释放涡轮加速。
- 倒数「2」时开始按住油门，可获得火箭起步；过早长按会短暂熄火。加速与刹车同时按住，在低速时可快速原地转向。
- 金币最多 10 枚，每枚提高极速。蘑菇提供 2.2 秒冲刺；绿龟壳直线飞行并反弹，红龟壳追踪前方对手，香蕉留在车后。
- 草地减速，严重偏离路线会自动救援。按顺序经过八个检查点才计入完整一圈。
- 手机支持屏幕加速、刹车、转向、漂移和后视；点击道具栏释放道具。
- 浏览器标准手柄：左摇杆转向，A 加速，B 刹车，右肩键跳跃/漂移，左肩键道具，上方键后视，START 暂停。识别到 Nintendo / Switch 手柄时使用右侧 A / 下方 B，其他手柄使用下方 A / 右侧 B。
- 完赛显示名次和用时；最佳用时存于当前浏览器。声音按钮开启合成引擎与事件音效，默认静音。

## 实现与验证

`src/driving.ts` 实现固定 60 Hz 的世界坐标运动、漂移和检查点；`src/characters.ts` 构造角色；`src/world.ts` 构造赛道与赛车；`src/garage.ts` 提供选择界面与操作指南；`src/main.ts` 集成比赛、输入、相机、道具和 HUD。

运行生产预览后执行 `npm test`，覆盖物理规则及浏览器真实键盘输入完整比赛、道具、暂停/重赛、触屏操作。`npm run test:visual` 输出角色、桌面及手机截图。测试使用 macOS Google Chrome；`CHROME_PATH` 可覆盖行为测试的浏览器路径。检查接口仅在 `?test=1` 启用。

验证记录见 [artifacts/final-evidence.md](artifacts/final-evidence.md)。生产文件在 `dist/`。单人本地游戏，无联网多人模式；手柄未做实体硬件验证，手机为浏览器尺寸和触控仿真验证。

规则参考：[任天堂基本操作](https://support-jp.nintendo.com/app/answers/detail/a_id/34439/) · [Mario Kart 8 官方说明书](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/wii_u_6/mario_kart_8/ElectronicManual_WiiU_MarioKart8_EN.pdf)。
