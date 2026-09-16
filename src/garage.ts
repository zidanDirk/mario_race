import * as THREE from 'three';
import { createKart } from './world';
import './garage.css';

type Driver = { name: string; key: string; color: number };

/** Character portraits use the same model as the track, so the choice is honest. */
export function mountGarage(roster: Driver[], onSelect: (key: string) => void) {
  const menu = document.querySelector<HTMLElement>('#menu')!;
  menu.classList.add('with-garage');
  const section = document.createElement('section');
  section.className = 'garage';
  section.setAttribute('aria-label', '选择车手');
  section.innerHTML = '<div class="garage-heading"><span>选择车手</span><strong class="garage-driver"></strong><small>DRIVER</small></div><div class="garage-roster"></div>';
  menu.querySelector('.race-settings')!.before(section);
  const driverName = section.querySelector<HTMLElement>('.garage-driver')!;
  const row = section.querySelector<HTMLElement>('.garage-roster')!;
  const buttons = new Map<string, HTMLButtonElement>();
  const images = new Map<string, HTMLImageElement>();
  for (const driver of roster) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'garage-choice';
    button.dataset.driver = driver.key;
    button.style.setProperty('--driver-color', `#${driver.color.toString(16).padStart(6, '0')}`);
    button.setAttribute('aria-label', `选择${driver.name}`);
    button.title = driver.name;
    const portrait = document.createElement('img');
    portrait.alt = '';
    portrait.width = 192;
    portrait.height = 192;
    const label = document.createElement('span');
    label.textContent = driver.name;
    button.append(portrait, label);
    button.addEventListener('click', () => { select(driver.key); onSelect(driver.key); });
    row.append(button);
    buttons.set(driver.key, button);
    images.set(driver.key, portrait);
  }

  function select(key: string) {
    const driver = roster.find(candidate => candidate.key === key);
    if (!driver) return;
    for (const [candidate, button] of buttons) button.setAttribute('aria-pressed', String(candidate === key));
    driverName.textContent = driver.name;
    const note = menu.querySelector('.start-note');
    if (note) note.textContent = `驾驶${driver.name} · 按 ENTER 即刻出发`;
  }
  select(roster.some(driver => driver.key === 'mario') ? 'mario' : roster[0]?.key);

  // Reuse one offscreen renderer for all thumbnails; shared world materials and
  // geometry must stay alive because the race renderer also uses them.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(192, 192);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x687682, 2.7));
  const keyLight = new THREE.DirectionalLight(0xfff3df, 3.2);
  keyLight.position.set(-3, 6, 8);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xc8edff, 1.8);
  rimLight.position.set(4, 4, -3);
  scene.add(rimLight);
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 30);
  camera.position.set(3.1, 3.8, 8);
  camera.lookAt(0, 2.65, 0);
  camera.zoom = 1.12;
  camera.updateProjectionMatrix();
  try {
    for (const driver of roster) {
      const kart = createKart(driver.color, driver.key);
      scene.add(kart);
      renderer.render(scene, camera);
      images.get(driver.key)!.src = renderer.domElement.toDataURL('image/png');
      scene.remove(kart);
    }
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'driving-guide';
  dialog.setAttribute('aria-labelledby', 'driving-guide-title');
  dialog.innerHTML = `
    <div class="guide-top"><div><span class="guide-eyebrow">DRIVING SCHOOL</span><h2 id="driving-guide-title">像赛车手一样过弯</h2></div><button class="guide-close" type="button" aria-label="关闭操作指南">×</button></div>
    <p class="guide-intro">自己掌握方向与油门。入弯起跳，持续漂移，出弯释放加速。</p>
    <div class="guide-columns"><section><h3>键盘</h3><dl>
    <div><dt><kbd>W</kbd> / <kbd>↑</kbd></dt><dd>加速</dd></div>
    <div><dt><kbd>S</kbd> / <kbd>↓</kbd></dt><dd>刹车 / 倒车</dd></div>
    <div><dt><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd></dt><dd>转向</dd></div>
    <div><dt><kbd>SPACE</kbd> / <kbd>R</kbd></dt><dd>起跳 · 按住漂移</dd></div>
    <div><dt><kbd>E</kbd> / <kbd>Q</kbd></dt><dd>短按投出 · 长按后挂</dd></div>
    <div><dt><kbd>C</kbd></dt><dd>向后看</dd></div>
    <div><dt><kbd>ESC</kbd></dt><dd>暂停</dd></div>
    <div><dt><kbd>BACKSPACE</kbd></dt><dd>回到赛道</dd></div>
    </dl></section><section><h3>手柄</h3><dl>
    <div><dt>左摇杆</dt><dd>转向</dd></div>
    <div><dt>A 键</dt><dd>加速</dd></div>
    <div><dt>B 键</dt><dd>刹车 / 倒车</dd></div>
    <div><dt>右肩键 R / RB</dt><dd>起跳 · 按住漂移</dd></div>
    <div><dt>左肩键 L / LB</dt><dd>短按投出 · 长按后挂</dd></div>
    <div><dt>上方按键</dt><dd>向后看</dd></div>
    <div><dt>START / MENU</dt><dd>暂停</dd></div><div><dt>SELECT / −</dt><dd>漏点时返回检查点前</dd></div>
    </dl><p class="guide-gamepad-note">连接后按任意手柄键启用。识别到 Nintendo / Switch 手柄时，右侧 A 加速、下方 B 刹车；其他标准手柄为下方 A、右侧 B。</p></section></div>
    <div class="guide-tips"><p><b>① 入弯</b>保持加速并转向，按下漂移键起跳，再持续按住。</p><p><b>② 蓄力</b>调整转向控制弧线，火花由蓝 → 橙 → 紫逐级蓄力。</p><p><b>③ 出弯</b>松开漂移键，释放迷你加速。倒数「2」时开始按住油门，可获得起步加速。</p></div>
    <p class="guide-gamepad-note"><b>技巧竞速：</b>同向紧跟前车积累尾流，完成后获得短加速。蘑菇赛道后段右侧有两个低跳台，左侧保留平路；起跳前后短窗口内点按漂移键，落地触发技巧加速。一直按住不会重复奖励。<br/><b>道具攻防：</b>对手也会吃箱和使用八类道具。短按 E / Q、道具栏或手柄左肩键投出，长按后挂香蕉或龟壳，松开释放；按住 C 可向后投壳。后挂物抵挡一次攻击后消耗，第二格不会自动释放。来袭时注意方向提示；休闲难度有更长攻击间隔与受击保护，不计标准榜。三重蘑菇占一格、分三次使用；超级喇叭按下立即清除近处道具并击退近车，墙体可阻挡。炸弹短按前抛，按住后视 C 再用道具则后放；橙圈标出爆炸范围，提前离开。星星持续 5 秒提速并免疫道具伤害，仍需转向避开护栏。计时模式没有道具攻防。</p>
    <p class="guide-gamepad-note"><b>漏过检查点：</b>小地图橙圈标出位置。可以自行返回顺向补过，也可点击「回到检查点前」、按 Backspace 或手柄 Select / −；计时继续、最多扣 3 金币，返回后向前加速补过，不会自动补算圈数。</p>
    <p class="guide-gamepad-note"><b>技巧连击：</b>释放橙色漂移 +100、紫色漂移 +180、近距离超车 +120、完整通过捷径 +160、跳台技巧落地 +120。8 秒内连续完成动作，倍率从 ×1 逐步升到 ×3；重撞、受击或救援中断连击，已得分保留。每圈同一对手、同一捷径只奖励一次。完整完赛保存本机技巧纪录，标准、休闲、计时分别记录；技巧分不加车速，也不影响用时排名。</p>
    <p class="guide-gamepad-note"><b>机关战术：</b>城堡蓝色内线湿滑，干燥外线更稳；双传送带中央保留普通路面。看箭头走顺向，每 12 秒换向，最后 2 秒变黄预警。可在赛车配置中先选「城堡机关 · 20 秒试驾」练习。</p>
    <p class="guide-gamepad-note"><b>双站杯赛：</b>蘑菇赛道与城堡夜赛各三圈，每站按名次获得 15 / 12 / 10 / 8 / 6 / 4 分。中场点「下一站」继续；「重跑本站」只撤销当前站结果。夜赛窄桥会逐渐收窄，沿青色路缘通行。杯赛与技巧纪录存本机，不计单场云榜或每日成长。</p>
    <p class="guide-gamepad-note"><b>双捷径：</b>小地图青绿线是花园路，金色线是工坊路。喷气口绿灯安全、黄灯预警两秒、红灯喷发，可走右侧绕行；移动路障需要松油门观察空位。彩色出口板每圈提供一次加速，宽阔主路始终可走。</p>
    <p class="guide-gamepad-note"><b>计时挑战：</b>单人跑完三圈，首次完赛建立本机最佳幽灵。再次挑战会出现蓝色半透明赛车，不会碰撞或抢金币，可在左侧面板关闭。每圈四个分段，负差值表示比此前最佳更快；只有更快的完整成绩才会更新幽灵。此模式关闭随机道具，保留漂移、金币、捷径与机关。</p>
    <button type="button" class="guide-done">了解，准备出发 →</button>`;
  document.body.append(dialog);
  let previousFocus: HTMLElement | null = null;
  function showControls() {
    if (dialog.open) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    (dialog.querySelector('.guide-close') as HTMLButtonElement).focus();
  }
  function closeControls() {
    if (!dialog.open) return;
    dialog.close();
    previousFocus?.focus();
  }
  dialog.querySelector('.guide-close')!.addEventListener('click', closeControls);
  dialog.querySelector('.guide-done')!.addEventListener('click', closeControls);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeControls(); });
  window.addEventListener('keydown', event => {
    if (!dialog.open) return;
    // Capture keyboard input before the game's window-level controls.
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { event.preventDefault(); closeControls(); }
  }, true);
  window.addEventListener('keyup', event => { if (dialog.open) event.stopImmediatePropagation(); }, true);

  const menuHelp = document.createElement('button');
  menuHelp.type = 'button';
  menuHelp.className = 'garage-help';
  menuHelp.textContent = '操作指南 · 键盘 / 手柄';
  menuHelp.addEventListener('click', showControls);
  menu.append(menuHelp);
  const pauseHelp = document.createElement('button');
  pauseHelp.type = 'button';
  pauseHelp.className = 'secondary-button guide-pause-help';
  pauseHelp.textContent = '查看操作指南';
  pauseHelp.addEventListener('click', showControls);
  document.querySelector('#overlay .dialog')?.append(pauseHelp);
  return { select, showControls, closeControls };
}
