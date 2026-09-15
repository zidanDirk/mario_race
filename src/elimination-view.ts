import type { EliminationSnapshot } from './elimination';
import './elimination.css';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const value = document.createElement(tag);
  value.className = className;
  value.textContent = text;
  return value;
}

function setText(target: HTMLElement, value: string) {
  if (target.textContent !== value) target.textContent = value;
}

function clock(seconds: number) {
  const tenths = Math.floor(Math.max(0, seconds) * 10 + 1e-7);
  return `${Math.floor(tenths / 600).toString().padStart(2, '0')}:${Math.floor(tenths / 10) % 60 < 10 ? '0' : ''}${Math.floor(tenths / 10) % 60}.${tenths % 10}`;
}

/** Presentation only: the elimination system owns timing, order and final places. */
export function mountEliminationView(app: HTMLElement, roster: { id: string; name: string }[], playerId: () => string) {
  const names = new Map(roster.map(driver => [driver.id, driver.name]));
  const nameOf = (id: string | undefined | null) => id ? names.get(id) ?? '车手' : '—';
  const hud = element('aside', 'elimination-hud');
  hud.id = 'elimination-hud';
  hud.hidden = true;
  hud.setAttribute('aria-label', '末位淘汰赛况');
  const top = element('div', 'elimination-hud-top');
  const title = element('strong', 'elimination-hud-title', '末位淘汰');
  const count = element('span', 'elimination-active-count');
  top.append(title, count);
  const timing = element('div', 'elimination-timing');
  const seconds = element('b', 'elimination-seconds');
  const timingLabel = element('span', 'elimination-timing-label');
  timing.append(seconds, timingLabel);
  const lastLine = element('div', 'elimination-risk-line');
  const last = element('strong', 'elimination-driver-name');
  lastLine.append(element('span', '', '末位'), last);
  const penultimateLine = element('div', 'elimination-risk-line elimination-runner-line');
  const penultimate = element('strong', 'elimination-driver-name');
  penultimateLine.append(element('span', '', '倒数第二'), penultimate);
  hud.append(top, timing, lastLine, penultimateLine);
  app.append(hud);

  return {
    render(snapshot: EliminationSnapshot | null, mode: string) {
      hud.hidden = !snapshot || snapshot.complete || !['racing', 'paused', 'countdown'].includes(mode);
      if (!snapshot) return;
      const lastId = snapshot.order.at(-1);
      const penultimateId = snapshot.order.at(-2);
      const remaining = Math.max(0, Math.ceil(snapshot.remaining - 1e-7));
      hud.dataset.warning = String(snapshot.warning);
      hud.dataset.danger = String(lastId === playerId());
      hud.dataset.paused = String(mode === 'paused');
      setText(title, mode === 'paused' ? '比赛暂停' : '末位淘汰');
      setText(count, `${snapshot.activeIds.length} 人存活`);
      setText(seconds, `${remaining}`);
      setText(timingLabel, mode === 'countdown' ? '秒后首次淘汰' : mode === 'paused' ? '秒 · 已暂停' : snapshot.warning ? '秒！末位出局' : '秒后淘汰');
      setText(last, `${nameOf(lastId)}${lastId === playerId() ? ' · 你' : ''}`);
      setText(penultimate, `${nameOf(penultimateId)}${penultimateId === playerId() ? ' · 你' : ''}`);
      last.title = last.textContent ?? '';
      penultimate.title = penultimate.textContent ?? '';
      penultimateLine.hidden = !penultimateId;
    },

    result(container: HTMLElement, snapshot: EliminationSnapshot, stats: { overtakes: number; bestPlace: number | null; saved: boolean }) {
      container.querySelector('.elimination-results')?.remove();
      const section = element('section', 'elimination-results');
      section.setAttribute('aria-label', '末位淘汰赛结算');
      const currentPlayer = playerId();
      const won = snapshot.winnerId === currentPlayer;
      const playerElimination = snapshot.eliminated.find(driver => driver.id === currentPlayer);
      const heading = element('div', 'elimination-result-heading');
      heading.append(element('strong', '', won ? '最后的车手 · 冠军！' : playerElimination ? `第 ${snapshot.playerPlace ?? playerElimination.place} 名 · 本场止步` : '末位淘汰赛'),
        element('span', 'elimination-result-badge', won ? '★ 冠军' : playerElimination ? '已淘汰' : '赛况'));
      section.append(heading);
      const metrics = element('dl', 'elimination-result-metrics');
      for (const [label, value] of [
        ['存活时间', clock(playerElimination?.at ?? snapshot.elapsed)],
        ['超车次数', String(stats.overtakes)],
        ['本机最佳', stats.bestPlace === null ? '—' : `第 ${stats.bestPlace} 名`],
      ]) {
        const metric = element('div', '');
        metric.append(element('dt', '', label), element('dd', '', value));
        metrics.append(metric);
      }
      section.append(metrics);
      if (snapshot.winnerId) section.append(element('p', 'elimination-winner-note', `${nameOf(snapshot.winnerId)}坚持到最后，赢得本场比赛。`));
      section.append(element('h3', 'elimination-timeline-title', '淘汰时间线'));
      const timeline = element('ol', 'elimination-timeline');
      for (const eliminated of snapshot.eliminated) {
        const row = element('li', '');
        row.dataset.player = String(eliminated.id === currentPlayer);
        row.append(element('time', '', clock(eliminated.at)),
          element('strong', '', `${nameOf(eliminated.id)}${eliminated.id === currentPlayer ? ' · 你' : ''}`),
          element('span', '', `第 ${eliminated.place} 名`));
        timeline.append(row);
      }
      section.append(timeline);
      if (!snapshot.winnerId && snapshot.activeIds.length) {
        const survivors = element('div', 'elimination-survivors');
        survivors.append(element('strong', '', '仍在赛场'),
          element('span', '', snapshot.activeIds.map(id => nameOf(id)).join('、')));
        section.append(survivors);
        section.append(element('p', 'elimination-result-note', '你已被淘汰，本次挑战结束；其余车手不结算最终名次。'));
      }
      section.append(element('p', 'elimination-result-rule', '首次淘汰在 30 秒，之后每 20 秒淘汰末位。同赛程沿用上一排序。'));
      section.append(element('p', stats.saved ? 'elimination-result-note' : 'elimination-storage-warning', stats.saved
        ? '成绩保存在本机，独立于三圈竞速榜和每日成长。'
        : '本机存储不可用，本场成绩未保存；可以继续挑战。'));
      container.append(section);
    },
  };
}
