import './cloud.css';
import {LOADOUTS,isLoadout,type LoadoutId} from './loadouts';
import type {Metrics,Snapshot} from '../shared/progression.mjs';

export type RaceDifficulty = 'standard' | 'casual';
export type RaceMode = 'grand-prix' | 'time-trial';
const modeNames: Record<RaceMode, string> = { 'grand-prix': '标准道具竞速', 'time-trial': '计时挑战' };
type User = { id: string; displayName: string; avatarUrl: string | null; provider: string };
type Account = { mode?: RaceMode; user: User | null; stats: { bestTimeMs: number | null; totalRaces: number; rank: number | null } | null };
type Config = { providers: { google: boolean; wechat: boolean }; devLogin: boolean };
type Entry = { rank: number; userId: string; displayName: string; avatarUrl: string | null; bestTimeMs: number; character: string; loadout?:string; title?:'rookie'|'star' };
type Board = { mode: RaceMode; entries: Entry[]; track: string; rulesVersion: number };
type Result = { timeMs: number; character: string; position: number; coins: number; metrics?:Metrics };
type Receipt = { progression?:Snapshot; mode: RaceMode; difficulty: RaceDifficulty; saved: true; bestTimeMs: number | null; rank: number | null };
const drivers: Record<string, string> = { mario: '马里奥', luigi: '路易吉', peach: '碧姬', yoshi: '耀西', toad: '奇诺比奥', wario: '瓦力欧' };
const providers: Record<string, string> = { google: 'Google', wechat: '微信', dev: '本地测试' };
const time = (ms: number | null | undefined) => ms == null ? '—' : `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms) % 1000).padStart(3, '0')}`;
class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
async function request<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) throw new ApiError(response.status, typeof data?.error === 'string' ? data.error : data?.error?.code ?? 'unavailable');
    return data as T;
  } finally { window.clearTimeout(timer); }
}
function failure(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return '登录已过期，请重新登录后开始新比赛。';
    if (error.status === 404 || error.status === 410) return '本场比赛凭证不存在或已过期，请重新开始比赛。';
    if (error.status === 429) return '操作有些频繁，请稍后重试。';
    if (error.status === 400 || error.status === 409 || error.status === 422) return '本场成绩未通过服务器校验，请重新开始比赛。';
    if (error.status === 403) return '服务器暂未允许此操作，请检查登录或站点配置。';
  }
  return '暂时无法连接成绩服务器，请稍后重试。';
}
function avatar(name: string, url: string | null, className = '') {
  const box = document.createElement('span');
  box.className = `cloud-avatar ${className}`;
  box.textContent = Array.from(name.trim())[0] || '车';
  if (url) {
    try {
      const safe = new URL(url);
      if (safe.protocol === 'https:' && !safe.username && !safe.password) {
        const img = document.createElement('img');
        img.src = safe.href; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
        img.addEventListener('error', () => img.remove(), { once: true });
        box.append(img);
      }
    } catch { /* Keep the initial when an upstream avatar is invalid. */ }
  }
  return box;
}

/** Account state is independent from the six AI racers and their race positions. */
export function mountCloud({ onOpen, isTest, onAccount, onProgress }: { onOpen: () => void; isTest: boolean; onAccount?:(userId:string|null)=>void; onProgress?:(value:Snapshot)=>void }) {
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'cloud-trigger'; trigger.setAttribute('aria-label', '用户登录与云端排行榜');
  trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v5a4 4 0 0 1-8 0V3Z M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 2h8"/></svg><span>登录 · 排行榜</span><i></i>';
  document.querySelector('.toolbar')!.prepend(trigger);
  const dialog = document.createElement('dialog');
  dialog.className = 'cloud-dialog'; dialog.setAttribute('aria-labelledby', 'cloud-title');
  dialog.innerHTML = `
    <header class="cloud-heading"><div><span class="cloud-eyebrow">MUSHROOM CUP · ONLINE</span><h2 id="cloud-title">每一圈，都值得上榜。</h2></div><button class="cloud-close" type="button" aria-label="关闭排行榜">×</button></header>
    <div class="cloud-mode-tabs" role="group" aria-label="排行榜模式"><button type="button" data-mode="grand-prix" aria-pressed="true">标准道具竞速榜</button><button type="button" data-mode="time-trial" aria-pressed="false">计时挑战榜</button></div>
    <p class="cloud-notice" role="status" aria-live="polite"></p>
    <div class="cloud-columns"><section class="cloud-account" aria-label="用户信息"><div class="cloud-profile"></div><div class="cloud-login"></div><p class="cloud-privacy">登录后，新比赛成绩会保存到服务器。昵称、头像和最佳成绩会在排行榜公开展示。微信与 Google 暂为独立账号。</p></section>
    <section class="cloud-ranking" aria-labelledby="cloud-board-title"><div class="cloud-board-heading"><div><span class="cloud-eyebrow">TOP 10 / 150cc / COURSE 02</span><h3 id="cloud-board-title">蘑菇赛道 · 全球前十</h3></div><button class="cloud-refresh" type="button" aria-label="刷新排行榜">↻</button></div><p class="cloud-board-caption">标准难度 · 每位用户最佳三圈用时 · 休闲成绩不计排名</p><div class="cloud-board" aria-live="polite"></div></section></div>
    <footer class="cloud-footer"><span>先登录，再开始一场新的比赛。</span><button type="button" class="cloud-done">返回赛道 →</button></footer>`;
  document.querySelector('#app')!.append(dialog);
  const get = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const profile = get('.cloud-profile'); const login = get('.cloud-login'); const board = get('.cloud-board'); const notice = get('.cloud-notice');
  let viewedMode: RaceMode = 'grand-prix';
  let account: Account = { user: null, stats: null }; let config: Config | null = null;
  let online = false; let refreshing = false; let pendingAction = false; let revision = 0; let raceSequence = 0; let offlineNotice = false;
  type Race = { loadout:LoadoutId; mode: RaceMode; difficulty: RaceDifficulty; sequence: number; userId: string | null; ticket: Promise<{ raceId: string } | null>; finished: boolean };
  let race: Race | null = null;
  let previousFocus: HTMLElement | null = null;
  function setNotice(message: string, kind = '') { notice.textContent = message; notice.dataset.kind = kind; }
  function open() { if (dialog.open) return; previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; onOpen(); dialog.showModal(); get<HTMLButtonElement>('.cloud-close').focus(); void refresh(); }
  function close() { dialog.close(); if (previousFocus?.isConnected) previousFocus.focus(); else trigger.focus(); }
  trigger.addEventListener('click', open);
  get('.cloud-close').addEventListener('click', close); get('.cloud-done').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } });
  for (const eventName of ['keydown', 'keyup'] as const) window.addEventListener(eventName, event => { if (dialog.open) event.stopImmediatePropagation(); }, true);
  function actionButton(label: string, className: string, action: () => void) {
    const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label; button.addEventListener('click', action); return button;
  }
  function renderMode() {
    dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === viewedMode)));
    get('#cloud-board-title').textContent = `${modeNames[viewedMode]} · 全球前十`;
    get('.cloud-board-caption').textContent = viewedMode === 'time-trial' ? '独立计时榜 · 无对手 / 无道具 · 每位用户最佳三圈用时' : '标准难度 · 每位用户最佳三圈用时 · 休闲成绩不计排名';
  }
  function setMode(mode: RaceMode) {
    if (viewedMode === mode) return;
    viewedMode = mode;
    account = { ...account, stats: null };
    board.replaceChildren(); renderMode(); renderAccount(); void refresh(true);
  }
  dialog.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode as RaceMode)));
  renderMode();
  function renderAccount() {
    profile.replaceChildren(); login.replaceChildren();
    const user = account.user;onAccount?.(user?.id??null);
    trigger.classList.toggle('signed-in', !!user); trigger.querySelector('span')!.textContent = user ? '我的成绩' : '登录 · 排行榜';
    trigger.title = user ? `${user.displayName} · 我的成绩与排行榜` : '用户登录与云端排行榜';
    trigger.dataset.online = String(online);
    const head = document.createElement('div'); head.className = 'cloud-identity'; head.append(avatar(user?.displayName || '车手', user?.avatarUrl || null, 'cloud-avatar-large'));
    const names = document.createElement('div'); const name = document.createElement('h3'); name.textContent = user?.displayName || '游客车手';
    const source = document.createElement('p'); source.textContent = user ? `${providers[user.provider] || '第三方'}账号${online ? ' · 已登录' : ' · 连接中断'}` : '自由驰骋，登录后记录成绩'; names.append(name, source); head.append(names); profile.append(head);
    const stats = document.createElement('dl'); stats.className = 'cloud-stats';
    for (const [label, value] of [[`${modeNames[viewedMode]}最佳`, time(account.stats?.bestTimeMs)], ['全球排名', account.stats?.rank ? `#${account.stats.rank}` : '未上榜'], ['完成比赛', String(account.stats?.totalRaces ?? 0)]]) {
      const item = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value; item.append(dt, dd); stats.append(item);
    }
    profile.append(stats);
    if (user) {
      const logout = actionButton('退出登录', 'cloud-secondary', () => void perform(async () => { await request('/api/logout', {}); cancelRace(); account = { user: null, stats: null }; setNotice('已退出登录，仍可作为游客比赛。'); await refresh(true); }));
      logout.disabled = pendingAction; login.append(logout); return;
    }
    for (const provider of ['wechat', 'google'] as const) {
      const enabled = !!config?.providers[provider] && online;
      const button = actionButton(`${provider === 'wechat' ? '微信扫码登录' : '使用 Google 登录'}${enabled ? '' : ' · 待配置'}`, `cloud-provider cloud-${provider}`, () => { location.assign(`/api/auth/${provider}`); });
      button.disabled = !enabled || pendingAction; button.title = enabled ? `使用${providers[provider]}登录` : '管理员配置应用凭据后开放登录';
      const mark = document.createElement('span'); mark.className = 'cloud-provider-mark'; mark.setAttribute('aria-hidden', 'true'); mark.textContent = provider === 'wechat' ? '◉' : 'G'; button.prepend(mark); login.append(button);
    }
    if (config?.devLogin && online) {
      const form = document.createElement('form'); form.className = 'cloud-dev';
      form.innerHTML = '<label for="cloud-dev-name">本地开发测试（非微信 / Google 登录）</label><div><input id="cloud-dev-name" name="displayName" autocomplete="nickname" maxlength="24" placeholder="输入测试昵称" required /><button type="submit">测试登录</button></div>';
      form.querySelector('button')!.disabled = pendingAction;
      form.addEventListener('submit', event => { event.preventDefault(); const value = form.querySelector('input')!.value.trim(); if (!value) return; void perform(async () => { await request('/api/auth/dev', { displayName: value }); cancelRace(); setNotice('已登录本地测试账号，成绩仅保存在当前服务器。'); await refresh(true); }); });
      login.append(form);
    }
    if (!online) login.append(actionButton('重新连接服务器', 'cloud-secondary', () => void refresh()));
  }
  function renderBoard(data: Board) {
    board.replaceChildren();
    if (data.entries.length === 0) { board.innerHTML = '<div class="cloud-empty"><span aria-hidden="true">🏁</span><strong>冠军席位，虚位以待</strong><p>登录并完成一场比赛，留下第一个纪录。</p></div>'; return; }
    const list = document.createElement('ol'); list.className = 'cloud-ranks';
    for (const entry of data.entries.slice(0, 10)) {
      const row = document.createElement('li'); row.className = 'cloud-rank'; row.classList.toggle('cloud-rank-you', entry.userId === account.user?.id);
      const rank = document.createElement('span'); rank.className = 'cloud-rank-number'; rank.textContent = String(entry.rank).padStart(2, '0');
      const identity = document.createElement('div'); identity.className = 'cloud-rank-identity'; const name = document.createElement('b'); name.textContent = `${entry.displayName}${entry.userId === account.user?.id ? ' · 你' : ''}`;
      const driver = document.createElement('small'); driver.textContent = (drivers[entry.character] || '蘑菇杯车手')+(isLoadout(entry.loadout)?' · '+LOADOUTS[entry.loadout].name:'')+(entry.title==='star'?' · 星光车手':''); identity.append(name, driver);
      const score = document.createElement('time'); score.className = 'cloud-rank-time'; score.textContent = time(entry.bestTimeMs);
      row.append(rank, avatar(entry.displayName, entry.avatarUrl), identity, score); list.append(row);
    }
    board.append(list);
  }
  async function refresh(force = false) {
    if (refreshing && !force) return;
    refreshing = true; const current = ++revision; const mode = viewedMode;
    get<HTMLButtonElement>('.cloud-refresh').disabled = true; board.setAttribute('aria-busy', 'true');
    if (!board.children.length) board.innerHTML = '<p class="cloud-loading">正在读取云端排行榜…</p>';
    const results = await Promise.allSettled([request<Config>('/api/config'), request<Account>(`/api/me?mode=${mode}`), request<Board>(`/api/leaderboard?mode=${mode}`)]);
    if (current !== revision) return;
    const [settings, session, ranking] = results;
    config = settings.status === 'fulfilled' ? settings.value : null;
    online = session.status === 'fulfilled' && settings.status === 'fulfilled';
    if (session.status === 'fulfilled') {
      if (account.user?.id !== session.value.user?.id) cancelRace();
      account = session.value;
    }
    renderAccount();
    if (ranking.status === 'fulfilled') renderBoard(ranking.value);
    else { board.innerHTML = '<div class="cloud-empty"><span aria-hidden="true">☁</span><strong>排行榜暂时离线</strong><p>本地比赛仍然可以继续。点击右上角刷新重试。</p></div>'; }
    if (!online) { setNotice('云端服务暂不可用，可以继续游客比赛；仅保留此设备上的个人最佳成绩。', 'error'); offlineNotice = true; }
    else if (!notice.textContent || offlineNotice) { setNotice(isTest ? '自动化测试模式：本场成绩不会上传。' : '成绩按用户去重，每人展示最佳纪录。'); offlineNotice = false; }
    refreshing = false; get<HTMLButtonElement>('.cloud-refresh').disabled = false; board.setAttribute('aria-busy', 'false');
  }
  async function perform(action: () => Promise<void>) {
    if (pendingAction) return; pendingAction = true;
    login.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = true);
    try { await action(); } catch (error) { setNotice(failure(error), 'error'); }
    finally { pendingAction = false; renderAccount(); }
  }
  get('.cloud-refresh').addEventListener('click', () => void refresh());
  function cancelRace() { raceSequence++; race = null; }
  function startRace(character: string, mode: RaceMode = 'grand-prix', difficulty: RaceDifficulty = 'standard', loadout:LoadoutId = 'light') {
    cancelRace();
    const active: Race = { loadout, mode, difficulty, sequence: raceSequence, userId: online ? account.user?.id ?? null : null, ticket: Promise.resolve(null), finished: false };
    race = active;
    if (!isTest && active.userId) active.ticket = request<{ raceId: string; progression?:Snapshot }>('/api/races', { character, rulesVersion: mode === 'time-trial' ? 4 : 5, mode, difficulty, loadout }).then(ticket=>{
      if(active.sequence===raceSequence&&active.userId===account.user?.id&&ticket.progression)onProgress?.(ticket.progression);
      return ticket;
    }).catch(() => null);
  }
  function finishRace(result: Result) {
    const active = race;
    if (active?.finished) return;
    if (active) active.finished = true;
    const host = document.querySelector('#result'); if (!host) return;
    host.querySelector('.cloud-result')?.remove();
    const status = document.createElement('div'); status.className = 'cloud-result'; status.setAttribute('role', 'status'); host.append(status);
    const say = (message: string) => { status.replaceChildren(); const text = document.createElement('span'); text.textContent = message; status.append(text); };
    if (isTest) { say('测试模式 · 成绩不上传'); return; }
    if (!active?.userId) { say(active?.difficulty === 'casual' ? '游客休闲模式：成长保存在本机，本场不计入标准竞速排名。' : '游客模式：本机已保留个人最佳成绩。登录后，新比赛可参与云端排名。'); status.append(actionButton('登录 / 查看排行榜 →', 'cloud-result-link', open)); return; }
    let saving = false;
    async function save() {
      if (saving || !active) return;
      if (active.sequence !== raceSequence || active.userId !== account.user?.id) { say('账号或比赛已切换，本场未上传。请登录后开始新比赛。'); return; }
      saving = true; say('正在保存本场成绩…');
      try {
        const ticket = await active.ticket;
        if (active.sequence !== raceSequence || active.userId !== account.user?.id) { say('账号或比赛已切换，本场未上传。'); return; }
        if (!ticket) { say(active.difficulty === 'casual' ? '比赛开始时未能连接服务器，本场休闲成绩与每日成长未上传。下一场将重新连接。' : '比赛开始时未能连接服务器，本机已保留个人最佳成绩。下一场将重新连接。'); return; }
        const receipt = await request<Receipt>(`/api/races/${encodeURIComponent(ticket.raceId)}/finish`, { ...result, mode: active.mode, difficulty: active.difficulty, loadout:active.loadout });
        if(active.sequence!==raceSequence||active.userId!==account.user?.id)return;
        if(receipt.progression)onProgress?.(receipt.progression);
        say(receipt.difficulty === 'casual' ? '已保存休闲成绩与每日成长 · 不计入标准竞速排名' : `已保存到${modeNames[receipt.mode]}榜 · 全球第 ${receipt.rank ?? '—'} 名 · 最佳 ${time(receipt.bestTimeMs)}`);
        status.append(actionButton('查看排行榜 →', 'cloud-result-link', () => { setMode(active.mode); open(); })); void refresh();
      } catch (error) {
        say(failure(error));
        if (!(error instanceof ApiError) || error.status >= 500 || error.status === 429) status.append(actionButton('重试保存', 'cloud-result-link', () => void save()));
        else if (error.status === 401) { cancelRace(); account = { user: null, stats: null }; renderAccount(); }
      } finally { saving = false; }
    }
    void save();
  }
  const url = new URL(location.href);
  const auth = url.searchParams.get('auth');
  if (auth) {
    setNotice(auth === 'success' ? '登录成功，开始新比赛即可保存云端成绩。' : '登录未完成。请重试，或使用另一个登录方式。', auth === 'success' ? 'success' : 'error');
    url.searchParams.delete('auth'); url.searchParams.delete('reason'); history.replaceState(null, '', url);
    open();
  } else void refresh();
  return { setMode, startRace, finishRace, cancelRace, isOpen: () => dialog.open };
}
