# 技巧连击验收

已实现四类技巧、8 秒窗口、最高 3 倍连击、重撞/受击/救援断连保分、近距离超车去重、完整捷径校验、比赛评价和按模式/难度区分的本机纪录。约定见 design.md；技巧不修改车速、云端用时榜或每日成长经验。

## 验证

- `npm run build` 通过；既有主包体积提示保留，未引入新运行时依赖或 3D 资产。
- `npm run test:unit` 通过 101 项检查，包括新增 21 项技巧规则、时间/冻结、去重、反向/远距/套圈/瞬移过滤和存储验证，见 unit.txt。
- `node tests/tricks-browser.mjs` 通过 10 组专项检查：真实油门近距离超车；橙/紫预设阈值下的实际释放；三倍上限与暂停；实际护栏撞击、道具受击、手动救援；真实驾驶通过两条捷径；出口切入不给分；完成场景的本机保存/重赛/模式分离。预设蓄力与完成场景仅用于边界集成，并不被称为完整比赛。见 browser.json。
- `node tests/tricks-race-browser.mjs` 通过 3 组真实键盘检查。先从实际起跳、按住、反打蓄力至橙色后释放；再正式开赛，实际驾驶三圈，51.200 秒完赛，取得 520 分，1 次橙色漂移、2 次近距超车，最高 3 连击／2 倍，完成本机纪录保存与重赛清零。完整比赛没有位置、圈数、蓄力或得分注入。见 race.json。
- `node tests/combat-browser.mjs` 通过上一版 10 组攻防回归，涵盖 AI 四类道具、后挂拦截、备用格保护、正面受击、暂停/触摸/模拟手柄取消、计时隔离和手机预警。副本见 combat-regression.json。
- `node tests/tricks-production.mjs` 使用真实生产构建与临时本地 HTTP 服务，通过 3 组检查：普通地址不暴露 QA；横屏和大分数无横向溢出；本机存储禁用时正确提示并允许重赛。见 production.json。
- 以上浏览器检查均无脚本异常。独立只读复查发现并修正同帧受击前提前计分、最后冲线帧漏记超车两处事件顺序问题。

## UI 证据

人工查看桌面与手机技巧面板、手机结算、横屏，以及技巧 HUD 和道具预警同时出现的截图。手机原有短提示移至右侧，技巧条位于左侧；结算可滚动，重赛按钮可达。

- desktop-combo.png / mobile-combo.png：五连击、三倍倍率的受控显示场景。
- close-overtake.png / real-orange-drift.png：真实输入触发。
- full-race-results.png：实际三圈得分结算。
- mobile-results.png / landscape.png / mobile-combat-warning.png：响应式与提示避让。
- large-score.png / storage-unavailable.png：长数字和存储故障。

## 运行和边界

本地预览 `http://localhost:5173/?v=tricks-v1`；开发预览启动后可用 `npm run test:tricks` 复跑本次全部技巧检查。核心模块 src/tricks.ts，UI src/trick-view.ts + src/tricks.css，main.ts 只衔接驾驶/碰撞/比赛生命周期，garage.ts 补充指南。

技巧纪录保存在本浏览器，三种比赛设置分别存储，QA 使用独立命名空间；不新增技巧云榜或跨设备同步。未验证实体手机或实体手柄，移动检查采用 Chrome 视口和指针模拟。已有微信/Google真实凭据、阿里云部署与权威反作弊仍不在本次实现范围。
