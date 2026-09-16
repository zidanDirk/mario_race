export type Item = 'mushroom' | 'green-shell' | 'red-shell' | 'banana' | 'triple-mushroom' | 'super-horn' | 'bomb' | 'star';

export const isBoostItem = (item: Item | null): boolean => item === 'mushroom' || item === 'triple-mushroom';
export const isHoldableItem = (item: Item | null): boolean => item === 'green-shell' || item === 'red-shell' || item === 'banana';

export interface ItemSlot {
  item: Item | null;
  pending: Item | null;
  remaining: number;
  elapsed: number;
  /** Remaining uses; optional for legacy single-use slot literals. */
  charges?: number;
}

const ORDER: Item[] = ['mushroom', 'green-shell', 'banana', 'triple-mushroom', 'super-horn', 'bomb', 'star', 'red-shell'];
export type ItemAcquireContext = { time: number; /** Distance behind the leader, in metres. */ gap: number };
const STRONG_COOLDOWN: Partial<Record<Item, number>> = { 'triple-mushroom': 10, bomb: 10, star: 24 };
const NAMES: Record<Item, string> = {
  mushroom: '蘑菇加速',
  bomb: '炸弹 · 延时爆炸',
  star: '无敌星 · 加速突破',
  'green-shell': '绿龟壳 · 直射',
  'red-shell': '红龟壳 · 追踪',
  banana: '香蕉 · 向后放置',
  'triple-mushroom': '三重蘑菇 · 分次加速',
  'super-horn': '超级喇叭 · 范围防御',
};
const mushroom = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 38h24v15c0 11-24 11-24 0Z" fill="#fff8dc" stroke="#283b38" stroke-width="3"/><path d="M5 31C5-3 59-3 59 31c0 14-54 14-54 0" fill="#f05743" stroke="#283b38" stroke-width="3"/><ellipse cx="32" cy="18" rx="9" ry="10" fill="#fff8dc"/><ellipse cx="10" cy="28" rx="5" ry="8" fill="#fff8dc"/><ellipse cx="54" cy="28" rx="5" ry="8" fill="#fff8dc"/><path d="M27 47v5m10-5v5" stroke="#283b38" stroke-width="3" stroke-linecap="round"/></svg>';
const shell = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 45C6 6 58 6 56 45Z" fill="#55b66f" stroke="#213f39" stroke-width="3"/><path d="m25 18 15 0 8 16-16 12-16-12Zm7 28v10M16 34 8 39m40-5 8 5" fill="none" stroke="#237445" stroke-width="3"/><ellipse cx="32" cy="47" rx="28" ry="10" fill="#fff6d8" stroke="#213f39" stroke-width="3"/><ellipse cx="32" cy="49" rx="14" ry="6" fill="#294438"/></svg>';
const banana = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M29 12 32 5l5 2-2 10c-1 14 13 23 22 29-12 8-25-4-25-15-5 13-16 23-25 16 12-7 18-18 22-35Z" fill="#ffe14f" stroke="#6b591a" stroke-width="3" stroke-linejoin="round"/><path d="M32 29c-1 12 0 20 5 26 9-8 8-15-5-26Z" fill="#ffec82" stroke="#6b591a" stroke-width="3"/><path d="M29 24v3m7-3v3" stroke="#423719" stroke-width="2.5" stroke-linecap="round"/></svg>';
const tripleMushroom = '<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#283b38" stroke-width="2.5"><path d="M25 21h14v15H25Z" fill="#fff8dc"/><path d="M15 20C15 0 49 0 49 20c0 9-34 9-34 0Z" fill="#f05743"/><path d="M10 47h14v13H10Zm30 0h14v13H40Z" fill="#fff8dc"/><path d="M2 44C2 23 32 23 32 44c0 8-30 8-30 0Zm30 0c0-21 30-21 30 0 0 8-30 8-30 0Z" fill="#f05743"/></g><g fill="#fff8dc"><ellipse cx="32" cy="12" rx="5" ry="6"/><ellipse cx="17" cy="36" rx="5" ry="6"/><ellipse cx="47" cy="36" rx="5" ry="6"/></g></svg>';
const horn = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 25h16L43 10v44L26 39H10Z" fill="#ef6651" stroke="#283b38" stroke-width="3" stroke-linejoin="round"/><path d="M16 39v16h10V39" fill="#ffcc52" stroke="#283b38" stroke-width="3"/><ellipse cx="43" cy="32" rx="7" ry="22" fill="#ffce55" stroke="#283b38" stroke-width="3"/><ellipse cx="44" cy="32" rx="3" ry="13" fill="#5c4356"/><path d="M54 22q8 10 0 20M58 14q12 18 0 36" fill="none" stroke="#75dbe7" stroke-width="3" stroke-linecap="round"/></svg>';
const bomb = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M34 18q-4-13 10-11" fill="none" stroke="#bf9654" stroke-width="4"/><path d="m46 3 2 6 6-3-3 6 7 3-8 1-1 7-4-6-6 3 3-7-5-3 7-1Z" fill="#ffbe32"/><path d="M25 17h16v11H25Z" fill="#8c9ca6" stroke="#243544" stroke-width="3"/><ellipse cx="32" cy="42" rx="23" ry="21" fill="#243544" stroke="#142535" stroke-width="3"/><ellipse cx="22" cy="35" rx="6" ry="8" fill="#587384"/><path d="M30 40v7m10-7v7" stroke="#fff8dc" stroke-width="4" stroke-linecap="round"/></svg>';
const star = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 3 9 18 20 3-15 15 4 21-18-10-18 10 4-21L3 24l20-3Z" fill="#ffe25e" stroke="#886418" stroke-width="3" stroke-linejoin="round"/><path d="M26 27v10m12-10v10" stroke="#4b412a" stroke-width="4" stroke-linecap="round"/><path d="m32 9 5 12-7-2Z" fill="#fff9ba"/></svg>';
const ICONS: Record<Item, string> = {
  bomb,
  star,
  mushroom,
  'triple-mushroom': tripleMushroom,
  'super-horn': horn,
  'green-shell': shell,
  'red-shell': shell.replaceAll('#55b66f', '#e7403a').replaceAll('#237445', '#a9242b'),
  banana,
};

/** Simulation-time inventory: pausing the race also pauses the roulette. */
export class ItemInventory {
  readonly slots: ItemSlot[] = [];
  private revealRemaining = 0;
  private simulationTime = 0;
  private strongReadyAt: Partial<Record<Item, number>> = {};

  get item(): Item | null { return this.slots[0]?.item ?? null; }
  get rolling(): boolean { return this.slots.some(slot => slot.pending !== null); }
  get canCollect(): boolean { return this.slots.length < 2; }

  acquire(rank: number, random: () => number, context?: ItemAcquireContext): boolean {
    if (!this.canCollect) return false;
    // Award-time cooldowns include pending roulette/reserve slots and use race time only.
    if (context && Number.isFinite(context.time) && context.time >= 0) this.simulationTime = Math.max(this.simulationTime, context.time);
    const position = Number.isFinite(rank) ? Math.max(1, Math.min(6, rank)) : 1;
    const weights = position <= 2 ? [.12, .25, .35, .03, .10, .06, .01, .08]
      : position <= 4 ? [.21, .16, .13, .15, .09, .11, .07, .08] : [.23, .08, .06, .23, .06, .08, .16, .10];
    if (context && Number.isFinite(context.gap)) {
      const gap = Math.max(0, Math.min(1, context.gap / 100));
      // A close pack gets fewer strong catch-up items than a genuinely distant trailer.
      weights[3] *= .55 + gap * .9;
      weights[6] *= .25 + gap * 1.5;
    }
    for (let i = 0; i < ORDER.length; i++) {
      const item = ORDER[i];
      if (STRONG_COOLDOWN[item] && (this.simulationTime < (this.strongReadyAt[item] ?? -Infinity) ||
          this.slots.some(slot => slot.item === item || slot.pending === item))) weights[i] = 0;
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const value = random();
    let roll = (Number.isFinite(value) ? Math.max(0, Math.min(.999999, value)) : 0) * total;
    let pending = ORDER[ORDER.length - 1];
    for (let i = 0; i < ORDER.length; i++) {
      roll -= weights[i];
      if (roll < 0) { pending = ORDER[i]; break; }
    }
    const cooldown = STRONG_COOLDOWN[pending];
    if (cooldown) this.strongReadyAt[pending] = this.simulationTime + cooldown;
    this.slots.push({ item: null, pending, remaining: 1.5, elapsed: 0 });
    return true;
  }

  step(dt: number): Item[] {
    if (!Number.isFinite(dt) || dt <= 0) return [];
    this.simulationTime += dt;
    this.revealRemaining = Math.max(0, this.revealRemaining - dt);
    const revealed: Item[] = [];
    for (const slot of this.slots) {
      if (!slot.pending) continue;
      slot.elapsed += dt;
      slot.remaining = Math.max(0, slot.remaining - dt);
      if (slot.remaining <= 1e-8) {
        slot.remaining = 0;
        slot.item = slot.pending;
        slot.pending = null;
        slot.charges = slot.item === 'triple-mushroom' ? 3 : 1;
        revealed.push(slot.item);
      }
    }
    if (revealed.length) this.revealRemaining = .7;
    return revealed;
  }

  consume(): Item | null {
    const item = this.item;
    if (!item) return null;
    const slot = this.slots[0];
    const charges = slot.charges ?? (item === 'triple-mushroom' ? 3 : 1);
    if (item === 'triple-mushroom' && charges > 1) slot.charges = charges - 1;
    else this.slots.shift();
    this.revealRemaining = this.item ? .45 : 0;
    return item;
  }

  hurry(): void {
    const slot = this.slots.find(entry => entry.pending !== null);
    // A press can stop the roulette sooner, but cannot fire an unseen item.
    if (slot) slot.remaining = Math.min(slot.remaining, .22);
  }

  reset(): void {
    this.slots.length = 0;
    this.revealRemaining = 0;
    this.simulationTime = 0;
    this.strongReadyAt = {};
  }

  give(item: Item | null): void {
    this.reset();
    if (item) this.slots.push({ item, pending: null, remaining: 0, elapsed: 0, charges: item === 'triple-mushroom' ? 3 : 1 });
  }

  render(button: HTMLButtonElement, label: HTMLElement, active: boolean): void {
    const cluster = button.closest('.item-cluster');
    let reserve = cluster?.querySelector<HTMLElement>('.item-reserve');
    if (cluster && !reserve) {
      reserve = button.ownerDocument.createElement('div');
      reserve.className = 'item-reserve';
      reserve.setAttribute('role', 'img');
      cluster.append(reserve);
    }
    const paint = (element: HTMLElement, slot: ItemSlot | undefined, index: number) => {
      const displayed = slot?.pending ? ORDER[(Math.floor(slot.elapsed / .085) + index * 2) % ORDER.length] : slot?.item;
      const key = displayed ?? 'none';
      const charges = displayed === 'triple-mushroom' && !slot?.pending ? slot?.charges ?? 3 : 0;
      if (element.dataset.item !== key || element.dataset.charges !== String(charges)) {
        element.dataset.item = key;
        element.dataset.charges = String(charges);
        element.innerHTML = displayed ? ICONS[displayed].replace('</svg>', charges ? `<circle cx="51" cy="51" r="12" fill="#243948" stroke="#fff8dc" stroke-width="2"/><text x="51" y="57" text-anchor="middle" font-size="17" font-family="sans-serif" font-weight="bold" fill="white">${charges}</text></svg>` : '</svg>') : '<span aria-hidden="true">?</span>';
      }
      element.classList.toggle('rolling', !!slot?.pending);
      element.classList.toggle('ready', !!slot?.item);
      element.classList.toggle('item-reveal', !!slot?.item && this.revealRemaining > 0);
      element.style.setProperty('--roulette-progress', `${slot?.pending ? Math.min(100, slot.elapsed / (slot.elapsed + slot.remaining) * 100) : 100}%`);
    };
    const itemName = (slot: ItemSlot) => slot.item ? NAMES[slot.item] + (slot.item === 'triple-mushroom' ? ` · 剩余 ${slot.charges ?? 3} 次` : '') : '';
    const front = this.slots[0];
    paint(button, front, 0);
    button.disabled = !active || !front;
    button.setAttribute('aria-label', front?.pending ? '道具抽取中，点击加快轮盘' : this.item ? `使用${itemName(front)}` : '道具栏为空，撞击问号箱拾取道具');
    button.setAttribute('aria-busy', String(!!front?.pending));
    if (reserve) {
      paint(reserve, this.slots[1], 1);
      reserve.classList.toggle('empty', !this.slots[1]);
      reserve.setAttribute('aria-label', this.slots[1]?.pending ? '备用道具抽取中' : this.slots[1]?.item ? `备用道具：${itemName(this.slots[1])}` : '备用道具栏为空');
    }
    const status = front?.pending ? '抽取中 · 按键加快' : this.item ? itemName(front) : '撞击问号箱获取道具';
    if (label.textContent !== status) label.textContent = status;
    label.setAttribute('aria-live', 'polite');
    label.setAttribute('aria-atomic', 'true');
  }
}
