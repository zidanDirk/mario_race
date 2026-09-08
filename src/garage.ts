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
    <div><dt><kbd>E</kbd> / <kbd>Q</kbd></dt><dd>使用道具</dd></div>
    <div><dt><kbd>C</kbd></dt><dd>向后看</dd></div>
    <div><dt><kbd>ESC</kbd></dt><dd>暂停</dd></div>
    <div><dt><kbd>BACKSPACE</kbd></dt><dd>回到赛道</dd></div>
    </dl></section><section><h3>手柄</h3><dl>
    <div><dt>左摇杆</dt><dd>转向</dd></div>
    <div><dt>A 键</dt><dd>加速</dd></div>
    <div><dt>B 键</dt><dd>刹车 / 倒车</dd></div>
    <div><dt>右肩键 R / RB</dt><dd>起跳 · 按住漂移</dd></div>
    <div><dt>左肩键 L / LB</dt><dd>使用道具</dd></div>
    <div><dt>上方按键</dt><dd>向后看</dd></div>
    <div><dt>START / MENU</dt><dd>暂停</dd></div>
    </dl><p class="guide-gamepad-note">连接后按任意手柄键启用。识别到 Nintendo / Switch 手柄时，右侧 A 加速、下方 B 刹车；其他标准手柄为下方 A、右侧 B。</p></section></div>
    <div class="guide-tips"><p><b>① 入弯</b>保持加速并转向，按下漂移键起跳，再持续按住。</p><p><b>② 蓄力</b>调整转向控制弧线，火花由蓝 → 橙 → 紫逐级蓄力。</p><p><b>③ 出弯</b>松开漂移键，释放迷你加速。倒数「2」时开始按住油门，可获得起步加速。</p></div>
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
