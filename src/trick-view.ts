import {trickRating,type TrickSnapshot} from './tricks';
import './tricks.css';

const numberFormat = new Intl.NumberFormat('zh-CN');
const finite = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const integer = (value: number) => Math.floor(finite(value));
const fullNumber = (value: number) => numberFormat.format(integer(value));
function compactNumber(value: number) {
  const n = integer(value);
  return n >= 1_000_000 ? `${(n / 10_000).toFixed(n < 10_000_000 ? 1 : 0)}万` : fullNumber(n);
}
function multiplierLabel(value: number) {
  return `×${Math.max(1, finite(value)).toFixed(1).replace(/\.0$/, '')}`;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
function replaceText(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value;
}

/** Presentation only: the trick system owns scoring, timing, and record eligibility. */
export function mountTrickView(app: HTMLElement) {
  const hud = node('aside', 'trick-hud');
  hud.id = 'trick-hud';
  hud.hidden = true;
  hud.setAttribute('aria-label', '技巧得分');
  const heading = node('div', 'trick-heading');
  heading.append(node('span', 'trick-eyebrow', '技巧分'));
  const chain = node('span', 'trick-chain', '等待连击');
  heading.append(chain);
  const row = node('div', 'trick-score-row');
  const score = node('strong', 'trick-score', '0');
  score.id = 'trick-score';
  const multiplier = node('b', 'trick-multiplier', '×1');
  multiplier.id = 'trick-multiplier';
  row.append(score, multiplier);
  const meter = node('div', 'trick-meter');
  meter.setAttribute('aria-hidden', 'true');
  const bar = node('div', 'trick-bar');
  bar.id = 'trick-bar';
  meter.append(bar);
  const event = node('div', 'trick-event', '漂移 · 超车 · 穿越捷径');
  event.id = 'trick-event';
  const announcement = node('span', 'trick-announcement');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  hud.append(heading, row, meter, event, announcement);
  app.append(hud);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastSerial: number | null = null;
  let lastBreak = '';
  let pulse: Animation | undefined;

  return {
    render(snapshot: TrickSnapshot, state: { mode: string; raceMode: string; best: number | null }) {
      const visible = state.mode === 'racing' || state.mode === 'paused';
      hud.hidden = !visible;
      hud.dataset.raceMode = state.raceMode;
      const activeChain = integer(snapshot.chain);
      const remaining = Math.min(8, finite(snapshot.remaining));
      const nextBreak = snapshot.breakReason || '';
      replaceText(score, compactNumber(snapshot.score));
      score.setAttribute('aria-label', `${fullNumber(snapshot.score)} 技巧分`);
      hud.title = state.best === null ? '本模式暂无本机技巧纪录' : `本模式本机技巧纪录：${fullNumber(state.best)}`;
      replaceText(multiplier, multiplierLabel(snapshot.multiplier));
      replaceText(chain, activeChain > 0 ? `${compactNumber(activeChain)} 连击` : '等待连击');
      hud.dataset.active = String(activeChain > 0);
      bar.style.transform = `scaleX(${remaining / 8})`;
      meter.dataset.urgent = String(activeChain > 0 && remaining < 2);
      if (nextBreak && activeChain === 0) {
        replaceText(event, `${nextBreak} · 得分已保留`);
        event.dataset.kind = 'break';
      } else if (snapshot.last) {
        replaceText(event, `${snapshot.last.label} +${compactNumber(snapshot.last.points)}`);
        event.dataset.kind = 'score';
      } else {
        replaceText(event, '漂移 · 超车 · 穿越捷径');
        event.dataset.kind = 'idle';
      }
      event.title = event.textContent || '';
      if (snapshot.last && snapshot.last.serial !== lastSerial) {
        lastSerial = snapshot.last.serial;
        if (visible) {
          replaceText(announcement, `${snapshot.last.label}，增加 ${fullNumber(snapshot.last.points)} 分，${activeChain} 连击`);
          pulse?.cancel();
          if (!reducedMotion.matches) {
            pulse = multiplier.animate([
              { transform: 'scale(1)', color: '#b96a20' },
              { transform: 'scale(1.18)', color: '#e16932' },
              { transform: 'scale(1)', color: '#b96a20' },
            ], { duration: 260, easing: 'ease-out' });
          }
        }
      } else if (!snapshot.last) {
        lastSerial = null;
      }
      if (nextBreak && nextBreak !== lastBreak && visible) {
        replaceText(announcement, `${nextBreak}，本次得分已保留`);
      }
      lastBreak = nextBreak;
      if (!visible) {
        pulse?.cancel();
        replaceText(announcement, '');
      }
    },

    result(container: HTMLElement, snapshot: TrickSnapshot, record: { best: number | null; improved: boolean; saved: boolean }) {
      container.querySelector('.trick-results')?.remove();
      const section = node('section', 'trick-results');
      section.setAttribute('aria-label', '本场技巧表现');
      const total = integer(snapshot.score);
      const evaluation = trickRating(total);
      const top = node('div', 'trick-result-heading');
      top.append(node('span', 'trick-result-label', '本场技巧表现'), node('strong', 'trick-evaluation', evaluation));
      const summary = node('div', 'trick-result-summary');
      const scoreColumn = node('div', 'trick-result-total');
      scoreColumn.append(node('strong', '', fullNumber(total)), node('small', '', '技巧分'));
      const chainColumn = node('div', 'trick-result-chain');
      chainColumn.append(node('strong', '', `${compactNumber(snapshot.maxChain)} 连击`), node('small', '', `最高倍率 ${multiplierLabel(snapshot.maxMultiplier)}`));
      summary.append(scoreColumn, chainColumn);
      const counts = node('dl', 'trick-result-counts');
      for (const [key, label] of [ ['orange', '橙火漂移'], ['purple', '紫火漂移'], ['overtake', '干净超车'], ['shortcut', '捷径穿越'], ['jump', '跳台技巧'] ] as const) {
        const entry = node('div', '');
        entry.append(node('dt', '', label), node('dd', '', fullNumber(snapshot.counts[key])));
        counts.append(entry);
      }
      const local = node('div', 'trick-local-record');
      const bestText = record.best === null ? '暂无' : fullNumber(record.best);
      local.append(node('span', '', `本模式 · 本机技巧纪录 ${bestText}`));
      if (record.improved && record.saved) local.append(node('strong', 'trick-new-best', '新纪录'));
      section.append(top, summary, counts, local);
      if (record.improved && !record.saved) {
        section.append(node('p', 'trick-save-warning', '当前浏览器未能保存纪录'));
      }
      container.append(section);
    },
  };
}
