# 可借鉴的官方赛车机制

调研日期：2026-09-15。仅核实机制与可借鉴点；不代表项目已实现。下文的实现方式是本项目设计建议，并非任天堂公开的算法或数值。

## 控制与路线

| 已核实机制 | 版本和直接来源 | 适合当前项目的借鉴点 |
| --- | --- | --- |
| 紧跟对手时出现气流，保持跟车后获得短暂尾流加速；文中描述约两个车身距离开始出现气流。 | **Mario Kart 8 Deluxe**：[任天堂刊载的进阶教程](https://www.nintendo.com/jp/ichikara/aabpa/02_en.html)，Slipstream 小节。该文署名 GameWith 编辑部，为任天堂官网刊载，不能称为任天堂开发者技术文档。 | 按前后距离、侧向距离、朝向和持续时间判定；双方都可使用；用风线/蓄力提示让触发原因可见。不能声称本项目的秒数和距离完全复刻原版。 |
| 在跳台起跳时按技巧键，成功动作在落地时提供短加速。 | **Mario Kart 8 Deluxe**：[任天堂刊载的基础教程](https://www.nintendo.com/jp/ichikara/aabpa/index_en.html)，Drops and ramps 小节；**Mario Kart 8 / Wii U**：[官方电子说明书，第 15 页](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/wii_u_6/mario_kart_8/ElectronicManual_WiiU_MarioKart8_EN.pdf)，Jump Boost。 | 先做短跳台和落地奖励，失败只失去奖励；保留旁边地面安全线。需要真实离地/落地状态和碰撞判定，不能仅播放车身动画。 |
| 自动加速免去持续按油门；智能转向帮助防止出界。 | **Mario Kart 8 Deluxe**：[任天堂官方支持](https://support-jp.nintendo.com/app/answers/detail/a_id/34440)。 | 可选辅助，明确状态并保存偏好；不要悄悄把玩家传回道路中央。辅助参数/成绩规则需项目自行设计。 |
| 雨、雪等表面更容易打滑；蘑菇可穿越通常会减速的路面抄近路。 | **Mario Kart 8 Deluxe**：[任天堂刊载的进阶教程](https://www.nintendo.com/jp/ichikara/aabpa/02_en.html)，Slow down / Use Mushrooms to take shortcuts 小节。 | 在现有平面驾驶中加入短段抓地差异及清晰材质提示；让路线选择与刹车/道具时机产生联系。具体摩擦系数、赛道配置均属自设计。 |

## 道具

以下均有 **Mario Kart 8 Deluxe** [任天堂官方道具页](https://www.nintendo.com/ph/switch/aabp/item/index.html) 直接支持：

- **三重蘑菇**：三份蘑菇。Wii U 版 [官方电子说明书第 19 页](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/wii_u_6/mario_kart_8/ElectronicManual_WiiU_MarioKart8_EN.pdf) 明确逐次使用。本项目可复用蘑菇加速，加剩余次数与逐次消耗。
- **超级喇叭**：声波击退附近车辆和道具。本项目适合实现一次范围检测，同时清除范围内可防御弹体；要有可见半径和及时反馈。
- **炸弹兵（Bob-omb）**：计时结束或车辆接触爆炸，范围内车辆受影响。本项目适合前抛/后放、倒计时闪光、有限爆炸半径，并明确投掷者也可能被炸。
- **超级星星**：暂时无敌、提高速度并撞翻其他车辆。本项目可复用加速/命中系统，引入限时状态、醒目闪光；护栏与赛道边界仍应遵守，官方道具页没有说明可穿墙。
- **害羞幽灵（Boo）**：暂时隐形并穿过香蕉/龟壳，同时盗取其他玩家道具。本项目可后续加入，但需完善目标选择、被盗反馈、无可偷道具时的规则，工作量高于三重蘑菇/喇叭。

## 版本边界与建议

- **蓄力跳、滑轨、墙面骑行**是 **Mario Kart World** 的新一层机制；[任天堂 World 官方技巧文](https://www.nintendo.com/us/whatsnew/get-a-head-start-on-mario-kart-world-with-a-few-tips/) 逐项介绍，不能说成 MK8 Deluxe 的技巧。当前平面驾驶项目若引入完整滑轨/墙跑，需要额外移动状态和相机/路径系统，不适合本轮低风险方案。
- **工厂传送带、固定预警后切换双路线**可作为本项目原创机关设计。本次查到的官方资料不足以证明某种具体传送带周期/预警时间就是原版规则；提案应明确为设计建议。
- 推荐第一组以“跟车超越 → 跳台操作 → 三重蘑菇或喇叭的时机选择”为连贯循环；第二组以“辨认路面 → 选择有机关的路线 → 炸弹封路/星星突破”为循环。数值先保守，用实际多圈驾驶验证后调整。
- 两组都需要 AI 同样受加速、地面和机关影响；避免玩家受罚、AI 无视机关。计时赛应保持确定性，并为驾驶/路线规则变更区分成绩版本。
