# 方案三：车手成长与每日挑战

目标：每场比赛除了名次和用时，还有可达成的小目标；通过不同驾驶方式完成每日任务，领取自动结算的外观奖励，再开始下一场尝试新目标。

首版六模板：完成一场比赛、累计释放三次橙色及以上漂移、单场拾取十枚金币、无救援完成一场、累计通过两次捷径出口、完成一场计时挑战。每天按北京时间零点轮换三个，所有玩家同日一致，每项100经验，每日最多300经验。只有完整完赛才累计任务，重开/退出不领奖。任务按开赛日期结算，跨午夜不改变本场目标。

三档奖励：100经验解锁薄荷车漆；300经验解锁紫色尾焰；600经验解锁星光车手称号。全部纯外观，不改变速度、碰撞和榜单规则；玩家可装备或恢复默认。称号在成长面板、玩家标签及用户榜单显示。

登录玩家进度与装备存入现有SQLite，通过比赛凭证幂等结算。游客在本浏览器独立体验，登录后切换账户数据，不自动合并游客经验。网络失败保留成绩重试，未确认的云端奖励不冒充成功。QA使用独立游客存储且禁止上传。

接口约定：
- `shared/progression.mjs` + `.d.mts` 提供 `dayKey(nowMs)`, `emptyProgress(day)`, `normalizeProgress(value,day)`, `applyRace(state,{mode,metrics},day)` 返回新state，`snapshot(state,day)` 返回下述Snapshot，`equipProgress(state,equipped)` 校验并返回新state。
- Metrics: `{orangeDrifts:number,coinsCollected:number,rescues:number,shortcutClears:number}`。均非负整数，默认兼容旧客户端时不推断clean任务。恢复默认也要通过装备校验。
- Equipped: `{paint:'standard'|'mint',trail:'standard'|'violet',title:'rookie'|'star'}`。
- Snapshot: `{day:string,resetAt:number,xp:number,level:number,tasks:Array<{id:string,title:string,description:string,target:number,progress:number,complete:boolean,xp:number}>,rewards:Array<{id:string,kind:'paint'|'trail'|'title',name:string,xp:number,unlocked:boolean}>,equipped:Equipped}`。
- `GET /api/progression` 登录后返回Snapshot，未登录401。`POST /api/progression/equip` 接收完整Equipped返回Snapshot。完赛payload增加可选`metrics`；成功receipt增加`progression:Snapshot`。服务端按race.started_at决定任务日期，提交重试不重复经验且不能替换原metrics。
- `mountProgression({isTest,onOpen,onEquip})` 返回 `{setAccount(userId:string|null),startRace(mode),updateRace(metrics),finishRace(metrics),cancelRace(),acceptCloud(snapshot),isOpen(),getSnapshot()}`。管理本机游客和登录API；finishRace仅结算游客，登录等待acceptCloud；startRace固定当天日期。
- Cloud新增可选回调onAccount(userId)、onProgress(snapshot)。主程序采集真实事件并传入上述接口，装备回调只影响渲染。

验证覆盖：六模板、日期轮换/跨午夜、三档解锁与装备权限、重复提交、旧库保留、多账户隔离、游客持久化、真实金币/漂移/救援事件、完整比赛结算、手机与桌面面板、原计时/竞速回归。
