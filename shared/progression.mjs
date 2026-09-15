const DAY = 86400000;
const templates = {
  finish: {title:'跑起来，就有收获',description:'完成一场三圈比赛，任意模式均可。',target:1},
  drift: {title:'橙色弯道大师',description:'累计释放三次橙色或紫色漂移加速。',target:3},
  coins: {title:'金币收藏家',description:'在一场完整比赛中拾取十枚金币，受击丢失不影响计数。',target:10},
  clean: {title:'自己驶向终点',description:'不用手动或自动救援，完成一场比赛。',target:1},
  shortcuts: {title:'寻找更快的路',description:'累计触发两次捷径出口加速。',target:2},
  trial: {title:'向自己的纪录出发',description:'完成一场计时挑战，无需打破纪录。',target:1},
};
const rotations = [['finish','drift','coins'],['clean','shortcuts','trial'],['finish','shortcuts','drift'],['clean','coins','trial']];
export const rewardCatalog = [
  {id:'mint',kind:'paint',name:'薄荷车漆',xp:100},
  {id:'violet',kind:'trail',name:'紫色尾焰',xp:300},
  {id:'star',kind:'title',name:'星光车手',xp:600},
];
export function dayKey(nowMs = Date.now()) {return new Date(nowMs+8*3600000).toISOString().slice(0,10);}
function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day;}
export function dailyTasks(day){if(!validDay(day))throw new Error('任务日期无效');return rotations[((Math.floor(Date.parse(day)/DAY)%4)+4)%4].map(id=>({id,...templates[id],xp:100}));}
export function emptyProgress(){return {version:1,xp:0,days:{},equipped:{paint:'standard',trail:'standard',title:'rookie'}};}
export function validateMetrics(metrics,timeMs=1800000){
  if(metrics===undefined)return;
  if(!metrics||typeof metrics!=='object'||Array.isArray(metrics))throw new Error('驾驶统计无效');
  const limits={orangeDrifts:Math.ceil(timeMs/300),coinsCollected:Math.ceil(timeMs/50),rescues:Math.ceil(timeMs/100),shortcutClears:6};
  for(const [key,max] of Object.entries(limits))if(!Number.isInteger(metrics[key])||metrics[key]<0||metrics[key]>max)throw new Error('驾驶统计无效');
}
export function equipProgress(state,equipped){
  if(!equipped||!['standard','mint'].includes(equipped.paint)||!['standard','violet'].includes(equipped.trail)||!['rookie','star'].includes(equipped.title))throw new Error('外观无效');
  if(rewardCatalog.some(r=>equipped[r.kind]===r.id&&state.xp<r.xp))throw new Error('外观尚未解锁');
  return {...state,equipped:{paint:equipped.paint,trail:equipped.trail,title:equipped.title}};
}
export function normalizeProgress(value){
  const empty=emptyProgress();
  if(!value||value.version!==1||!value.days||typeof value.days!=='object'||Array.isArray(value.days)||Object.keys(value.days).length>36600)return empty;
  const days={};let xp=0;
  for(const [day,values] of Object.entries(value.days)){
    if(!validDay(day)||!values||typeof values!=='object'||Array.isArray(values))return empty;
    const row={};
    for(const task of dailyTasks(day)){
      const n=values[task.id]??0;if(!Number.isInteger(n)||n<0||n>task.target)return empty;
      row[task.id]=n;if(n===task.target)xp+=task.xp;
    }
    days[day]=row;
  }
  if(value.xp!==xp)return empty;
  try{return equipProgress({version:1,xp,days,equipped:empty.equipped},value.equipped);}catch{return {...empty,xp,days};}
}
export function applyRace(state,race,day){
  validateMetrics(race.metrics);
  if(!['grand-prix','time-trial'].includes(race.mode))throw new Error('比赛模式无效');
  const next={...state,days:{...state.days},equipped:{...state.equipped}};
  const row={...state.days[day]};next.days[day]=row;
  const m=race.metrics;
  const amounts={finish:1,drift:m?.orangeDrifts??0,coins:m?.coinsCollected??0,clean:m&&m.rescues===0?1:0,shortcuts:m?.shortcutClears??0,trial:race.mode==='time-trial'?1:0};
  for(const task of dailyTasks(day)){
    const old=row[task.id]??0;
    const value=Math.min(task.target,task.id==='coins'?Math.max(old,amounts.coins):old+amounts[task.id]);
    row[task.id]=value;if(old<task.target&&value===task.target)next.xp+=task.xp;
  }
  return next;
}
export function snapshot(state,day){return {day,resetAt:Date.parse(day)+16*3600000,xp:state.xp,level:1+rewardCatalog.filter(r=>state.xp>=r.xp).length,tasks:dailyTasks(day).map(t=>({...t,progress:state.days[day]?.[t.id]??0,complete:(state.days[day]?.[t.id]??0)>=t.target})),rewards:rewardCatalog.map(r=>({...r,unlocked:state.xp>=r.xp})),equipped:{...state.equipped}};}
