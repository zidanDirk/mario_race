import {emptyProgress,normalizeProgress,dayKey,applyRace,snapshot,equipProgress,type Metrics,type Equipped,type Snapshot} from '../shared/progression.mjs';
import './progression.css';

type RaceMode='grand-prix'|'time-trial';
export function mountProgression({isTest,onOpen,onEquip}:{isTest:boolean;onOpen:()=>void;onEquip:(value:Equipped)=>void}){
  const storageKey='mushroom-driver-growth-v1'+(isTest?'-qa':'');
  let guest=emptyProgress();let notice='';
  try{const raw=localStorage.getItem(storageKey);if(raw&&raw.length<2000000)guest=normalizeProgress(JSON.parse(raw));}catch{notice='本机存储不可用，本次进度只保留到页面关闭。';}
  let userId:string|null=null,current=snapshot(guest,dayKey()),revision=0,busy=false,loaded=true;
  let active:{owner:string|null;day:string;mode:RaceMode;metrics:Metrics;finished:boolean;baseline:Snapshot}|null=null;
  let lastFocus:HTMLElement|null=null;
  const trigger=document.createElement('button');trigger.type='button';trigger.className='growth-trigger';trigger.setAttribute('aria-label','每日挑战与车手成长');
  trigger.innerHTML='<span aria-hidden="true">✦</span><b>每日挑战</b>';
  document.querySelector('.toolbar')!.prepend(trigger);
  const dialog=document.createElement('dialog');dialog.className='growth-dialog';dialog.setAttribute('aria-labelledby','growth-title');
  dialog.innerHTML='<header><div><span class="growth-kicker">DRIVER JOURNEY</span><h2 id="growth-title">每一次出发，都有收获。</h2></div><button class="growth-close" aria-label="关闭每日挑战" type="button">×</button></header><p class="growth-account"></p><p class="growth-notice" role="status"></p><section class="growth-level"></section><div class="growth-day"></div><section class="growth-tasks" aria-label="今日三个挑战"></section><h3>你的车库收藏</h3><p class="growth-fair">奖励仅改变外观，不影响速度与比赛排名。</p><section class="growth-rewards" aria-label="三档外观奖励"></section><footer><button class="growth-refresh" type="button">刷新进度</button><button class="growth-done" type="button">返回赛道 →</button></footer>';
  document.querySelector('#app')!.append(dialog);
  const get=(selector:string)=>dialog.querySelector<HTMLElement>(selector)!;
  async function api(path:string,body?:unknown):Promise<Snapshot>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);try{const res=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});const value=await res.json();if(!res.ok)throw new Error(value.error||'连接失败');return value;}finally{clearTimeout(timer);}}
  function persist(){try{localStorage.setItem(storageKey,JSON.stringify(guest));}catch{notice='无法写入本机存储，进度只保留到页面关闭。';}}
  function publish(){onEquip({...current.equipped});render();}
  async function refresh(){
    if(busy)return;
    if(!userId||isTest){if(!active)current=snapshot(guest,dayKey());publish();return;}
    const seq=revision,owner=userId;busy=true;render();
    try{const value=await api('/api/progression');if(seq!==revision||owner!==userId)return;current=value;loaded=true;notice='';publish();}
    catch{if(seq===revision)notice='成长服务暂时无法连接。可继续比赛，点击刷新重试；云端奖励以保存成功为准。';}
    finally{if(seq===revision){busy=false;render();}}
  }
  function close(){dialog.close();lastFocus?.focus();}
  function open(){if(dialog.open)return;lastFocus=document.activeElement as HTMLElement;onOpen();dialog.showModal();get('.growth-close').focus();void refresh();}
  trigger.addEventListener('click',open);get('.growth-close').onclick=close;get('.growth-done').onclick=close;get('.growth-refresh').onclick=()=>void refresh();
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  for(const name of ['keydown','keyup'])window.addEventListener(name,event=>{if(dialog.open){if((event as KeyboardEvent).code==='Escape'){event.preventDefault();close();}event.stopImmediatePropagation();}},true);
  async function equip(value:Equipped){
    if(busy||!loaded)return;
    if(!userId||isTest){guest=equipProgress(guest,value);persist();current=snapshot(guest,dayKey());publish();return;}
    const seq=revision;busy=true;render();
    try{const next=await api('/api/progression/equip',value);if(seq!==revision)return;current=next;notice='外观已保存到账号。';publish();}
    catch(error){if(seq===revision)notice=error instanceof Error?`装备未保存：${error.message}。请重试。`:'装备未保存，请重试。';}
    finally{if(seq===revision){busy=false;render();}}
  }
  function render(){
    trigger.title=`${current.equipped.title==='star'?'星光车手':'新晋车手'} · ${current.xp} XP`;
    get('.growth-account').textContent=isTest?'测试游客 · 与真实账号和游客进度隔离':userId?'账号成长 · 进度与外观保存在服务器':'游客成长 · 仅保存在本浏览器，登录后切换账号进度';
    get('.growth-notice').textContent=notice;
    const next=current.rewards.find(r=>!r.unlocked),level=get('.growth-level');
    level.innerHTML='<div><strong></strong><span></span></div><progress max="600"></progress><small></small>';
    level.querySelector('strong')!.textContent=`Lv.${current.level} · ${current.equipped.title==='star'?'星光车手':'新晋车手'}`;
    level.querySelector('span')!.textContent=`${current.xp} XP`;
    (level.querySelector('progress')!).value=Math.min(600,current.xp);
    level.querySelector('small')!.textContent=!loaded?'正在读取账号成长…':next?`再获得 ${next.xp-current.xp} XP 解锁${next.name}`:'三档外观已全部解锁，继续积累你的驾驶经验。';
    const baseline=active&&!active.finished?active.baseline:current;
    get('.growth-day').textContent=`${baseline.day} · 北京时间每天 00:00 更新${active&&!active.finished?' · 本场按开赛日期结算':''}`;
    const tasks=get('.growth-tasks');tasks.replaceChildren();
    for(const task of baseline.tasks){
      let pending=task.progress;
      if(active&&!active.finished){const m=active.metrics;const delta=task.id==='drift'?m.orangeDrifts:task.id==='shortcuts'?m.shortcutClears:0;pending=task.id==='coins'?Math.max(pending,m.coinsCollected):pending+delta;}
      pending=Math.min(task.target,pending);
      const row=document.createElement('article');row.className='growth-task';row.dataset.task=task.id;row.dataset.complete=String(task.complete);
      row.innerHTML='<div class="growth-task-top"><h4></h4><strong></strong></div><p></p><div class="growth-task-bottom"><progress></progress><span></span></div>';
      row.querySelector('h4')!.textContent=task.title;row.querySelector('strong')!.textContent=task.complete?'✓ 已获得 100 XP':'+100 XP';row.querySelector('p')!.textContent=task.description;
      const bar=row.querySelector('progress')!;bar.max=task.target;bar.value=pending;
      row.querySelector('.growth-task-bottom span')!.textContent=`${pending}/${task.target}${pending>task.progress?' · 完赛后结算':''}`;
      tasks.append(row);
    }
    const rewards=get('.growth-rewards');rewards.replaceChildren();
    for(const reward of current.rewards){
      const row=document.createElement('article');row.className=`growth-reward growth-${reward.kind}`;
      row.innerHTML='<span class="growth-swatch" aria-hidden="true"></span><div><h4></h4><small></small></div>';
      row.querySelector('h4')!.textContent=reward.name;row.querySelector('small')!.textContent=`${reward.xp} XP · ${reward.unlocked?'已解锁':'尚未解锁'}`;
      const button=document.createElement('button');button.type='button';const equipped=current.equipped[reward.kind]===reward.id;
      button.textContent=!reward.unlocked?'未解锁':equipped?'恢复默认':'装备';button.disabled=!reward.unlocked||busy||!loaded;button.setAttribute('aria-label',`${equipped?'恢复默认':'装备'}${reward.name}`);button.setAttribute('aria-pressed',String(equipped));
      button.onclick=()=>{const value={...current.equipped,[reward.kind]:equipped?(reward.kind==='title'?'rookie':'standard'):reward.id} as Equipped;void equip(value);};row.append(button);rewards.append(row);
    }
    (get('.growth-refresh') as HTMLButtonElement).disabled=busy;
  }
  function setAccount(id:string|null){if(isTest)id=null;if(id===userId)return;revision++;busy=false;userId=id;active=null;notice='';loaded=!id;current=id?snapshot(emptyProgress(),dayKey()):snapshot(guest,dayKey());publish();void refresh();}
  function resultNote(message:string){const host=document.querySelector('#result');if(!host)return;host.querySelector('.growth-result')?.remove();const row=document.createElement('div');row.className='growth-result';const text=document.createElement('span');text.textContent=message;const button=document.createElement('button');button.type='button';button.textContent='查看挑战与奖励 →';button.onclick=open;row.append(text,button);host.append(row);}
  function startRace(mode:RaceMode){if(!userId)current=snapshot(guest,dayKey());active={owner:userId,day:dayKey(),mode,metrics:{orangeDrifts:0,coinsCollected:0,rescues:0,shortcutClears:0},finished:false,baseline:structuredClone(current)};render();}
  function updateRace(metrics:Metrics){if(!active||active.finished)return;const changed=Object.keys(metrics).some(k=>metrics[k as keyof Metrics]!==active!.metrics[k as keyof Metrics]);active.metrics={...metrics};if(changed&&dialog.open)render();}
  function finishRace(metrics:Metrics){
    if(!active||active.finished||active.owner!==userId)return;active.finished=true;
    if(userId&&!isTest){resultNote('每日挑战随成绩保存到云端，等待服务器确认。');return;}
    const before=guest.xp;guest=applyRace(guest,{mode:active.mode,metrics},active.day);persist();current=snapshot(guest,dayKey());publish();resultNote(`本场成长 +${guest.xp-before} XP · 累计 ${guest.xp} XP${notice?' · 本机保存失败':''}`);
  }
  function acceptCloud(value:Snapshot){if(!userId||isTest)return;revision++;busy=false;const before=active?.baseline.xp??current.xp;current=value;loaded=true;notice='';if(active&&!active.finished){active.day=value.day;active.baseline=structuredClone(value);}publish();if(active?.finished)resultNote(`云端成长已保存 · 本场 +${Math.max(0,current.xp-before)} XP · 累计 ${current.xp} XP`);}
  function cancelRace(){active=null;if(!userId)current=snapshot(guest,dayKey());render();}
  setInterval(()=>{if(!active&&current.day!==dayKey())void refresh();},60000);
  publish();
  return {setAccount,startRace,updateRace,finishRace,cancelRace,acceptCloud,isOpen:()=>dialog.open,getSnapshot:()=>structuredClone(current)};
}
