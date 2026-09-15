import { LOADOUTS, type LoadoutId } from './loadouts';
import './loadout.css';

type Options = {
  getSelected: () => LoadoutId;
  onSelect: (id: LoadoutId) => void;
  onTestDrive: () => void;
  canOpen: () => boolean;
};

const FEEL: Record<LoadoutId, { response: string; cornering: string; icon: string }> = {
  light: { response: '快', cornering: '均衡', icon: '01' },
  speed: { response: '慢', cornering: '需提前减速', icon: '02' },
  drift: { response: '适中', cornering: '更稳定', icon: '03' },
};

export function mountLoadoutView(options: Options) {
  const opener = document.createElement('button');
  opener.id = 'loadout-open';
  opener.type = 'button';
  opener.setAttribute('aria-haspopup', 'dialog');
  opener.setAttribute('aria-controls', 'loadout-dialog');
  opener.innerHTML = '<span>赛车配置</span><strong></strong><span aria-hidden="true">›</span>';
  const menu = document.querySelector<HTMLElement>('#menu')!;
  const settings = menu.querySelector('.race-settings');
  if (settings) settings.after(opener);
  else menu.append(opener);

  const dialog = document.createElement('dialog');
  dialog.id = 'loadout-dialog';
  dialog.className = 'loadout-dialog';
  dialog.setAttribute('aria-labelledby', 'loadout-title');
  dialog.setAttribute('aria-describedby', 'loadout-description');
  dialog.innerHTML = `
    <header class="loadout-header"><div><small>KART SETUP</small><h2 id="loadout-title">赛车配置</h2></div><button class="loadout-close" type="button" aria-label="关闭赛车配置">×</button></header>
    <p id="loadout-description" class="loadout-intro">三种配置全部开放。找到适合自己的节奏，出弯抢先一步。</p>
    <div class="loadout-options" role="group" aria-label="选择驾驶配置"></div>
    <p class="loadout-footnote">极速为 0 金币、无加速时的参考值。选择立即生效，比赛中不可更换。</p>
    <div class="loadout-actions"><button id="loadout-test-drive" type="button">20 秒试驾 <span aria-hidden="true">↗</span></button><button class="loadout-done" type="button">完成，返回车库 <span aria-hidden="true">→</span></button></div>`;
  const cards = new Map<LoadoutId, HTMLButtonElement>();
  const grid = dialog.querySelector('.loadout-options')!;
  for (const id of Object.keys(LOADOUTS) as LoadoutId[]) {
    const config = LOADOUTS[id];
    const feel = FEEL[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'loadout-choice';
    card.dataset.loadout = id;
    card.innerHTML = `
      <span class="loadout-card-top"><span class="loadout-number" aria-hidden="true">${feel.icon}</span><span class="loadout-selected"></span></span>
      <strong class="loadout-name">${config.name}</strong>
      <span class="loadout-tagline">${config.tagline}</span>
      <span class="loadout-stats">
        <span><span>参考极速</span><b>${Math.round(config.handling.topSpeed * 3.1)} <small>km/h</small></b></span>
        <span><span>起步响应</span><b>${feel.response}</b></span>
        <span><span>过弯稳定</span><b>${feel.cornering}</b></span>
        <span><span>漂移蓄力</span><b>×${config.handling.chargeRate}</b></span>
      </span>
      <span class="loadout-tradeoff">${config.tradeoff}</span>`;
    card.addEventListener('click', () => {
      if (!options.canOpen()) return;
      options.onSelect(id);
      refresh();
    });
    cards.set(id, card);
    grid.append(card);
  }
  document.body.append(dialog);
  let previousFocus: HTMLElement | null = null;

  function refresh() {
    const selected = options.getSelected();
    const allowed = options.canOpen();
    opener.querySelector('strong')!.textContent = LOADOUTS[selected].name;
    opener.setAttribute('aria-label', `赛车配置：${LOADOUTS[selected].name}，点击更换或试驾`);
    opener.disabled = !allowed;
    for (const [id, card] of cards) {
      card.setAttribute('aria-pressed', String(id === selected));
      card.querySelector('.loadout-selected')!.textContent = id === selected ? '✓ 已选' : '可选择';
      card.disabled = !allowed;
    }
    (dialog.querySelector('#loadout-test-drive') as HTMLButtonElement).disabled = !allowed;
    if (!allowed && dialog.open) close();
  }
  function open() {
    if (!options.canOpen() || dialog.open) return;
    refresh();
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    cards.get(options.getSelected())?.focus({ preventScroll: true });
    dialog.scrollTop = 0;
  }
  function close() {
    if (!dialog.open) return;
    dialog.close();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
  opener.addEventListener('click', open);
  dialog.querySelector('.loadout-close')!.addEventListener('click', close);
  dialog.querySelector('.loadout-done')!.addEventListener('click', close);
  dialog.querySelector('#loadout-test-drive')!.addEventListener('click', () => {
    if (!options.canOpen()) return;
    close();
    options.onTestDrive();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  window.addEventListener('keydown', event => {
    if (!dialog.open) return;
    event.stopImmediatePropagation();
    if (event.code === 'Escape') { event.preventDefault(); close(); }
  }, true);
  window.addEventListener('keyup', event => { if (dialog.open) event.stopImmediatePropagation(); }, true);
  refresh();
  return { refresh, close, isOpen: () => dialog.open, open };
}
