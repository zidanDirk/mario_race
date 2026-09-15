import { CUP_TRACKS, CUP_TRACK_LABELS, type CupSnapshot } from './cup';
import './cup.css';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

/** Pure presentation: CupSeries owns points, round progression and tie resolution. */
export function mountCupView(app: HTMLElement) {
  const hud = node('aside', 'cup-stage');
  hud.id = 'cup-stage';
  hud.hidden = true;
  hud.setAttribute('aria-label', '杯赛进度');
  app.append(hud);
  return {
    render(snapshot: CupSnapshot | null, mode: string) {
      hud.hidden = !snapshot || !['racing', 'paused', 'countdown'].includes(mode);
      const text = snapshot ? `双站杯 · 第 ${snapshot.stageIndex + 1}/2 站 · ${CUP_TRACK_LABELS[CUP_TRACKS[snapshot.stageIndex]]}` : '';
      if (hud.textContent !== text) hud.textContent = text;
      hud.dataset.track = snapshot ? CUP_TRACKS[snapshot.stageIndex] : '';
    },
    result(container: HTMLElement, snapshot: CupSnapshot) {
      container.querySelector('.cup-results')?.remove();
      const section = node('section', 'cup-results');
      section.setAttribute('aria-label', snapshot.complete ? '双站杯最终积分' : '双站杯本站积分');
      const player = snapshot.standings.find(driver => driver.id === snapshot.playerId)!;
      const heading = node('div', 'cup-result-heading');
      heading.append(node('strong', '', snapshot.complete ? '双站杯 · 最终积分' : '首站完成 · 杯赛积分'),
        node('span', 'cup-difficulty-tag', snapshot.difficulty === 'casual' ? '休闲' : '标准'));
      section.append(heading);
      if (snapshot.complete) {
        const podium = node('div', 'cup-podium');
        podium.setAttribute('aria-label', '杯赛前三名');
        for (const [index, driver] of snapshot.standings.slice(0, 3).entries()) {
          const column = node('div', 'cup-podium-place');
          column.dataset.place = String(index + 1);
          column.append(node('span', 'cup-medal', ['🥇', '🥈', '🥉'][index]),
            node('strong', 'cup-podium-name', driver.name), node('small', '', `${driver.points} 分`));
          podium.append(column);
        }
        section.append(podium);
        section.append(node('p', 'cup-player-summary', player.rank === 1
          ? `你赢得了双站杯！总积分 ${player.points} 分` : `你获得总排名第 ${player.rank} 名 · ${player.points} 分`));
      }
      const table = node('table', 'cup-table');
      const caption = node('caption', '', '每站积分：15 / 12 / 10 / 8 / 6 / 4');
      const head = node('thead', '');
      const headRow = node('tr', '');
      for (const label of ['排名', '车手', '蘑菇', '城堡', '积分']) {
        const cell = node('th', '', label);
        cell.scope = 'col'; headRow.append(cell);
      }
      head.append(headRow);
      const body = node('tbody', '');
      for (const driver of snapshot.standings) {
        const row = node('tr', '');
        row.dataset.player = String(driver.id === snapshot.playerId);
        row.append(node('td', 'cup-rank', String(driver.rank)));
        const name = node('th', 'cup-driver', driver.name);
        name.scope = 'row';
        if (driver.id === snapshot.playerId) name.append(node('small', 'cup-you', '你'));
        row.append(name);
        for (let i = 0; i < 2; i++) row.append(node('td', '', driver.places[i] ? `第${driver.places[i]}名` : '—'));
        row.append(node('td', 'cup-points', String(driver.points)));
        body.append(row);
      }
      table.append(caption, head, body); section.append(table);
      if (!snapshot.complete) section.append(node('p', 'cup-next-stage', '下一站：城堡夜赛 · 带着首站积分争夺总冠军'));
      section.append(node('p', 'cup-result-rule', '本站名次按玩家冲线时赛况结算；已完赛车手按用时，其余按赛道进度。'));
      section.append(node('p', 'cup-result-rule', '同分依次比较获胜次数、名次总和、末站名次。杯赛独立结算，不计入单场用时榜。'));
      container.append(section);
    },
  };
}
