import './checkpoint-assist.css';

/** An explicit recovery choice: never changes position merely because a gate was missed. */
export function mountCheckpointAssist(parent:HTMLElement,onRecover:()=>void){
 const panel=document.createElement('aside');panel.className='checkpoint-assist';panel.hidden=true;
 panel.setAttribute('aria-label','检查点帮助');
 panel.innerHTML='<div role="status"><strong>检查点未通过</strong><p>小地图橙圈标出漏点。<br/>返回后顺向通过，继续计圈。</p></div><button type="button">回到检查点前</button><small>计时继续 · 最多扣 3 金币<br/>键盘 Backspace · 手柄 Select / −</small>';
 const button=panel.querySelector('button')!;
 button.addEventListener('click',()=>{onRecover();button.blur();});
 // Native button keyboard activation must not also become a hop or steering input.
 button.addEventListener('keydown',e=>{if(e.code==='Enter'||e.code==='Space')e.stopPropagation();});
 button.addEventListener('keyup',e=>{if(e.code==='Enter'||e.code==='Space')e.stopPropagation();});
 parent.append(panel);
 return {update(visible:boolean){panel.hidden=!visible;parent.classList.toggle('checkpoint-missed',visible);}};
}
