# AI道具攻防

目标：对手通过实际道具箱拿到道具，在有机会时进攻或加速；玩家在进攻和留物防守之间做选择。沿用现有赛道、60Hz驾驶与扫掠碰撞，不增加新地图或新道具。

首版：六车道具竞速中的AI使用蘑菇、绿壳、红壳、香蕉；独立轮盘/库存、实际接触箱子、选择时机、可读的手持道具提示。玩家短按E/Q或点道具栏释放，持续按住约0.22秒后挂香蕉/龟壳，松开投出（香蕉向后、壳默认向前，按C向后）。蘑菇及轮盘按下立即生效。触屏长按与手柄保持同样语义。暂停、失焦、pointercancel取消输入但保留未发出的库存，不能凭空发射；阻挡一次攻击消耗后挂物，不能自动消耗第二格。

公平性：休闲与标准仅开赛前可选，AI攻击频率不同，速度保持原来调校。全局玩家定向攻击间隔、开场宽限、受击后免遭道具连击的喘息期、同一时间最多一枚追踪玩家的红壳。AI也会攻击AI，不只针对玩家。红壳选择前方最近合适对手、设置最小发射距离；绿壳仅在较直且目标同车道时使用；香蕉避开贴脸投放；蘑菇用于追赶且不能覆盖受击。计时模式没有AI/道具，保留原规则与幽灵。

来袭提示：真实威胁靠近时显示方向和类型，红壳被锁定时提前预警；提示防御/躲避操作，屏幕上不过量堆叠。实际弹道、所有者出生免撞、后挂位置与拦截、障碍遮挡、库存消耗一致。

排行榜：新版标准道具竞速规则版本3，与旧版纪录隔离；计时保持规则2。休闲比赛保存任务/经验和比赛记录，但不进入标准竞速榜。普通用户无需理解规则编号，菜单/结算标明休闲不计竞速排名。

AI模块约定（独立worker）：src/ai-combat.ts 导出 Difficulty='casual'|'standard'; CombatRacer={id:string,t:number,lane:number,speed:number,stun:number,immune:number,finished:boolean}; AiUse={racerId:string,item:Item,targetId:string|null,rear:boolean}; class AiCombat.reset(ids:string[]), inventory(id):ItemInventory, collect(id,rank,random,time):boolean, plan(dt,{time,difficulty,playerId,trackLength,racers,playerProtected:boolean,playerRedThreat:boolean}):AiUse[], stats:{collected:number,used:number,playerAttacks:number}; exported boxLane(racer,boxes:{t:number,lane:number,available:boolean}[],trackLength):number|null。root在实际碰撞成功后调用collect，plan消费库存并返回动作；AI只用模拟时钟，随机由调用者提供collect。全局频率限制包含所有AI对玩家的定向shell/banana动作，击中后root提供playerProtected。测试证明轮盘延迟、四道具决策、玩家攻击间隔、休闲更宽松、暂停/reset与计时跳过。

独立云端worker：server+src/cloud.ts。cloud.startRace(character,mode,difficulty='standard')，result不需传difficulty；服务器凭证绑定difficulty；TT只接收standard。/me和/leaderboard始终标准榜，GP规则3、TT规则2，casual不进入榜。receipt含difficulty，casual显示已保存休闲成绩/每日成长而不显示null名次。保留onProgress/onAccount所有功能，现有DB向后迁移difficulty列默认standard。

验证：道具出生安全、四类AI行动、实际吃箱、持有防御一次拦截/消耗、短按长按/取消、键鼠触屏/手柄、预警、护栏遮挡、防围攻、模式隔离、两档完整三圈、成长和云端幂等回归。
