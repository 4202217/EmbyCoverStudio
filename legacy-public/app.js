const PAGES = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/targets': 'targets',
  '/settings': 'settings',
  '/logs': 'logs'
};

function currentPage() {
  return PAGES[location.pathname] || 'dashboard';
}

function go(path) {
  history.pushState({}, '', path);
  state.page = PAGES[path] || 'dashboard';
  nav();
}

window.addEventListener('popstate', () => {
  state.page = currentPage();
  nav();
});

const state = {
  page: currentPage(),
  filters: { type: 'all', status: 'all', cfg: 'all', cover: 'all' },
  visibleIds: new Set(),
  taskSort: { key: 'seq', dir: -1 },
  taskFilter: { type: [], trigger: [], status: [] },
  settings: null,
  status: null,
  targets: [],
  logs: [],
  styles: null,
  selected: new Set(),
  pendingCfg: null,
  token: localStorage.getItem('ecs_token') || '',
  timers: []
};

const $ = (sel) => document.querySelector(sel);
const main = $('#main');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inlineMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderMarkdown(text) {
  const lines = String(text || '').split('\n');
  const out = [];
  let list = null;
  const flushList = () => {
    if (list) {
      out.push(`<ul>${list.join('')}</ul>`);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (/^###\s+/.test(line)) { flushList(); out.push(`<h4>${inlineMd(line.replace(/^###\s+/, ''))}</h4>`); }
    else if (/^##\s+/.test(line)) { flushList(); out.push(`<h3>${inlineMd(line.replace(/^##\s+/, ''))}</h3>`); }
    else if (/^#\s+/.test(line)) { flushList(); out.push(`<h2>${inlineMd(line.replace(/^#\s+/, ''))}</h2>`); }
    else if (/^[-*]\s+/.test(line)) { list = list || []; list.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`); }
    else { flushList(); out.push(`<p>${inlineMd(line)}</p>`); }
  }
  flushList();
  return out.join('\n');
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers['x-access-token'] = state.token;
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    if (res.status === 401) {
      showTokenPrompt();
      throw new Error(data.error || '需要访问令牌');
    }
    if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
    return data;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `请求失败（${res.status}）`);
  }
  return res;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function showTokenPrompt() {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="mask">
      <div class="modal" style="max-width:420px">
        <div class="modal-head"><h3>访问令牌</h3><button class="btn sm ghost" onclick="closeModal()">✕</button></div>
        <p class="muted mb">服务端已开启访问令牌，请输入后继续（会保存在本机浏览器）。</p>
        <input type="password" id="token-input" placeholder="访问令牌" style="margin-bottom:12px">
        <div class="row"><button class="btn primary" id="token-save">保存并继续</button></div>
      </div>
    </div>`;
  $('#token-save').onclick = () => {
    state.token = $('#token-input').value.trim();
    localStorage.setItem('ecs_token', state.token);
    closeModal();
    loadAll();
  };
  $('#token-input').onkeydown = (e) => {
    if (e.key === 'Enter') $('#token-save').click();
  };
  setTimeout(() => $('#token-input').focus(), 50);
}

window.closeModal = () => {
  $('#modal-root').innerHTML = '';
};

const ICO = {
  search: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="5"/><path d="M11 11l3.5 3.5"/></svg>',
  grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/></svg>',
  layer: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 2l6 3-6 3-6-3z"/><path d="M2 8.5l6 3 6-3"/></svg>',
  folder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2 4.5h4l1.5 2H14v7H2z"/></svg>',
  status: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none"/></svg>',
  check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M5.5 8.2l1.8 1.8 3.2-3.6"/></svg>',
  lock: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="4.5" y="7" width="7" height="5.5" rx="1"/><path d="M6 7V5.5a2 2 0 014 0V7"/></svg>',
  cfg: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M3 4h10M3 8h10M3 12h10"/><circle cx="6.5" cy="4" r="1.6" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r="1.6" fill="currentColor" stroke="none"/><circle cx="5.5" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg>',
  doc: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><rect x="3" y="2.5" width="10" height="11" rx="1.2"/><path d="M6 6h4M6 9h4"/></svg>',
  pencil: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M3 12.5l.7-2.3 6.8-6.8a1.4 1.4 0 012 2l-6.8 6.8-2.3.7z"/><path d="M9.5 4.5l2 2"/></svg>',
  cover: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="6" cy="7" r="1.3"/><path d="M3 13l3.5-3.5 2.5 2.5 2-2 2.5 2.5"/></svg>',
  alert: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M8 2.5L14.5 13h-13z"/><path d="M8 6.5v3"/><circle cx="8" cy="11.2" r="0.8" fill="currentColor" stroke="none"/></svg>',
  funnel: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M2.5 3h11l-4 4.5V13l-3-1.5V7.5z"/></svg>',
  clear: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>'
};

const TRIGGER_LABEL = { manual: '手动', batch: '批量操作', scheduler: '定时任务', webhook: 'Webhook', startup: '服务启动', resume: '继续任务', enable: '启用合集' };

function closeFilterMenus() {
  document.querySelectorAll('.fdrop-menu:not([hidden]), .thf-pop:not([hidden])').forEach((m) => {
    m.hidden = true;
  });
}

function buildFilterDropdown(container, { icon, options, value, onChange }) {
  const cur = options.find((o) => o.value === value) || options[0];
  container.classList.add('fdrop');
  container.innerHTML = `
    <button class="fdrop-trigger" type="button">
      <span class="fdrop-ico">${icon}</span>
      <span class="fdrop-label">${cur.label}</span>
      <span class="fchev">${ICO.chevron}</span>
    </button>
    <div class="fdrop-menu" hidden>
      ${options.map((o) => `<button class="fdrop-opt${o.value === value ? ' active' : ''}" type="button" data-v="${o.value}">${o.icon || icon}<span>${o.label}</span></button>`).join('')}
    </div>`;
  const trigger = container.querySelector('.fdrop-trigger');
  const menu = container.querySelector('.fdrop-menu');
  const label = container.querySelector('.fdrop-label');
  function setValue(v, silent = false) {
    const o = options.find((x) => x.value === v);
    if (!o) return;
    label.textContent = o.label;
    menu.querySelectorAll('.fdrop-opt').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    if (!silent) onChange(v);
  }
  trigger.onclick = (e) => {
    e.stopPropagation();
    if (menu.hidden) closeFilterMenus();
    menu.hidden = !menu.hidden;
  };
  menu.querySelectorAll('.fdrop-opt').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      setValue(b.dataset.v);
      menu.hidden = true;
    };
  });
  return { setValue };
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.fdrop') && !e.target.closest('.thf-pop')) closeFilterMenus();
});

// 可复用的数据表格组件：支持排序、按列筛选、固定高度滚动
function createDataTable({ el, columns, fetchData, emptyText = '暂无数据', initialSort = null }) {
  const head = el.querySelector('thead');
  const body = el.querySelector('tbody');
  const state = {
    rows: [],
    sort: initialSort ? { key: initialSort.key, dir: initialSort.dir } : { key: null, dir: 1 },
    filters: {}
  };
  const filterCols = columns.filter((c) => c.filterOpts);

  function matches(row, key, vals) {
    if (!vals || !vals.length) return true;
    return vals.includes(String(row[key] ?? ''));
  }

  function compare(a, b, key) {
    const va = a[key];
    const vb = b[key];
    if (key === 'ts') return new Date(va || 0).getTime() - new Date(vb || 0).getTime();
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va ?? '').localeCompare(String(vb ?? ''), 'zh-CN');
  }

  function visibleRows() {
    let rows = state.rows.filter((r) => filterCols.every((c) => matches(r, c.key, state.filters[c.key])));
    if (state.sort.key) {
      const dir = state.sort.dir;
      rows = [...rows].sort((a, b) => compare(a, b, state.sort.key) * dir);
    }
    return rows;
  }

  let popup = null;
  function ensurePopup() {
    if (!popup) {
      popup = document.createElement('div');
      popup.className = 'thf-pop';
      popup.hidden = true;
      document.body.appendChild(popup);
      // 弹层内部任意点击都不再向外冒泡，避免被全局点击监听误关
      popup.addEventListener('click', (e) => e.stopPropagation());
    }
    return popup;
  }

  function openFilterMenu(key, anchor) {
    ensurePopup();
    closeFilterMenus();
    buildThfMenu(popup, key);
    popup.hidden = false;
    const pw = popup.offsetWidth || 190;
    const ph = popup.offsetHeight || 260;
    const rect = anchor.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    if (top + ph > window.innerHeight - 8) top = Math.max(8, rect.top - ph - 4);
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    const sc = el.closest('.scroll-panel');
    if (sc) sc.addEventListener('scroll', () => { popup.hidden = true; }, { once: true, passive: true });
  }

  function buildThfMenu(menu, key) {
    const col = columns.find((c) => c.key === key);
    const opts = col.filterOpts;
    const pending = [...(state.filters[key] || [])];
    menu.dataset.pending = JSON.stringify(pending);
    const curSort = state.sort.key === key ? state.sort.dir : 0;
    menu.innerHTML = `
      <div class="thf-sorts">
        <button class="thf-sort ${curSort === 1 ? 'active' : ''}" data-dir="1">▲ 升序</button>
        <button class="thf-sort ${curSort === -1 ? 'active' : ''}" data-dir="-1">▼ 降序</button>
      </div>
      <div class="thf-sep"></div>
      <label class="thf-row"><input type="checkbox" data-all="1" ${pending.length === 0 ? 'checked' : ''}> 全选</label>
      ${opts.map((o) => `<label class="thf-row"><input type="checkbox" data-val="${o.value}" ${pending.includes(o.value) ? 'checked' : ''}> ${o.label}</label>`).join('')}
      <div class="thf-actions">
        <button class="btn sm ghost" data-clear="1">清空筛选</button>
      </div>`;
    menu.querySelectorAll('.thf-sort').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        state.sort = { key, dir: Number(b.dataset.dir) };
        renderHead();
        renderBody();
        menu.hidden = true;
      };
    });
    menu.querySelectorAll('input').forEach((inp) => {
      inp.onchange = () => {
        let p = JSON.parse(menu.dataset.pending || '[]');
        if (inp.dataset.all !== undefined) {
          p = inp.checked ? [] : opts.map((o) => o.value);
        } else {
          const v = inp.dataset.val;
          p = inp.checked ? (p.includes(v) ? p : [...p, v]) : p.filter((x) => x !== v);
        }
        menu.dataset.pending = JSON.stringify(p);
        state.filters[key] = p;
        renderBody();
        buildThfMenu(menu, key);
      };
    });
    menu.querySelector('[data-clear="1"]').onclick = () => {
      state.filters[key] = [];
      renderBody();
      buildThfMenu(menu, key);
    };
  }

  function renderHead() {
    head.innerHTML = '<tr>' + columns.map((c) => {
      const arrow = state.sort.key === c.key ? (state.sort.dir === 1 ? '▲' : '▼') : '';
      const sortBtn = c.sortable
        ? `<button class="th-sort" data-sort="${c.key}" ${c.filterOpts ? `data-filter="${c.key}"` : ''}>${c.label}${arrow ? `<span class="sort-arrow">${arrow}</span>` : ''}${c.filterOpts ? `<span class="th-filter-ico">${ICO.funnel}</span>` : ''}</button>`
        : c.label;
      return `<th style="width:${c.width || 'auto'}">${sortBtn}</th>`;
    }).join('') + '</tr>';
    head.querySelectorAll('.th-sort').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const key = b.dataset.sort;
        if (b.dataset.filter !== undefined) {
          openFilterMenu(key, b);
          return;
        }
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 1 ? -1 : 1;
        } else {
          state.sort = { key, dir: key === 'seq' || key === 'ts' ? -1 : 1 };
        }
        renderHead();
        renderBody();
      };
    });
  }

  function renderBody() {
    const rows = visibleRows();
    body.innerHTML = rows.map((r) => `<tr>${columns.map((c) => c.render(r)).join('')}</tr>`).join('')
      || `<tr><td colspan="${columns.length}" class="empty">${emptyText}</td></tr>`;
  }

  async function refresh() {
    try {
      state.rows = (await fetchData()) || [];
    } catch {
      body.innerHTML = `<tr><td colspan="${columns.length}" class="empty">加载失败</td></tr>`;
      return;
    }
    renderBody();
  }

  return {
    refresh,
    render() {
      renderHead();
      renderBody();
    }
  };
}

function openModal(html) {
  $('#modal-root').innerHTML = `<div class="mask"><div class="modal">${html}</div></div>`;
  $('#modal-root .mask').onclick = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };
}

function nav() {
  state.timers.forEach((t) => clearInterval(t));
  state.timers = [];
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.page === state.page);
  });
  if (state.page === 'dashboard') renderDashboard();
  if (state.page === 'targets') renderTargets();
  if (state.page === 'settings') renderSettings();
  if (state.page === 'logs') renderLogs();
}

document.querySelectorAll('.nav-btn').forEach((b) => {
  b.onclick = () => {
    go(b.dataset.path || '/');
  };
});

async function loadStatus() {
  try {
    state.status = await api('/api/status');
  } catch {
    state.status = null;
  }
  updateSidebar();
  return state.status;
}

function updateSidebar() {
  const s = state.status;
  const dot = $('#side-dot');
  const text = $('#side-text');
  const ver = $('#app-version');
  if (ver) ver.textContent = s?.version ? `v${s.version}` : '';
  if (ver && !ver.dataset.bound) {
    ver.dataset.bound = '1';
    ver.onclick = async (e) => {
      e.preventDefault();
      let text = '暂无更新记录';
      try {
        text = (await api('/api/changelog')).text;
      } catch {
        text = '暂无更新记录';
      }
      openModal(`
        <div class="modal-head"><h3>更新记录</h3><button class="btn sm ghost" onclick="closeModal()">✕</button></div>
        <div class="changelog">${renderMarkdown(text)}</div>
      `);
    };
  }
  if (!s) {
    dot.className = 'dot red';
    text.textContent = '服务不可用';
    return;
  }
  if (s.running) {
    dot.className = 'dot blue';
    text.textContent = '正在同步…';
    return;
  }
  if ((s.stats?.failed || 0) > 0) {
    dot.className = 'dot red';
    text.textContent = `${s.stats.failed} 个封面异常`;
    return;
  }
  if (s.emby?.connected) {
    dot.className = 'dot green';
    text.textContent = `已连接 ${s.emby.serverName || ''}`;
  } else if (s.emby?.configured) {
    dot.className = 'dot red';
    text.textContent = 'Emby 连接异常';
  } else {
    dot.className = 'dot gray';
    text.textContent = '未配置 Emby';
  }
}

async function loadAll() {
  await loadStatus();
  if (state.page === 'targets') renderTargets();
  if (state.page === 'logs') renderLogs();
}

// ---------- 概览 ----------
async function renderDashboard() {
  const s = state.status || await loadStatus();
  const emby = s.emby || {};
  const embyState = emby.connected
    ? `<span class="dot green"></span> 已连接${s.font?.hint ? '' : ''}`
    : emby.configured
      ? `<span class="dot red"></span> 连接失败：${esc(emby.error)}`
      : `<span class="dot gray"></span> 未配置`;

  let targets = [];
  let tasks = [];
  try {
    targets = (await api('/api/targets')).targets || [];
  } catch {
    targets = [];
  }
  try {
    tasks = (await api('/api/tasks')).tasks || [];
  } catch {
    tasks = [];
  }
  const failedTargets = targets.filter((t) => t.lastError && !t.acknowledged);
  const failedTasks = tasks.filter((t) => t.status === 'failed' && !t.acknowledged).slice(0, 5);
  state.targets = targets;
  const recentSort = (list) => [...list]
    .filter((t) => t.coverUrl && t.lastGeneratedAt)
    .sort((a, b) => new Date(b.lastGeneratedAt) - new Date(a.lastGeneratedAt))
    .slice(0, 5);
  const recentLibs = recentSort(targets.filter((t) => t.kind === 'library'));
  const recentCols = recentSort(targets.filter((t) => t.kind === 'collection'));

  main.innerHTML = `
    <div class="page-title">概览</div>
    <div class="page-desc">封面工坊运行状态一览</div>
    <div class="cards">
      <div class="card"><div class="label">Emby 服务器</div><div class="value" style="font-size:15px">${embyState}</div><div class="sub">${emby.serverName ? esc(emby.serverName) + ' v' + esc(emby.version || '') : ''}</div></div>
      <div class="card"><div class="label">监控中的合集</div><div class="value">${s.stats?.enabled ?? 0}<span style="font-size:13px;color:var(--muted)"> / ${s.stats?.targets ?? 0}</span></div><div class="sub">已生成封面 ${s.stats?.generated ?? 0} 个</div></div>
      <div class="card"><div class="label">封面生成张数</div><div class="value">${s.stats?.coversGenerated ?? 0}</div><div class="sub">累计生成（含重新生成）</div></div>
      <div class="card"><div class="label">最近同步</div><div class="value" style="font-size:15px">${fmtTime(s.lastRun)}</div><div class="sub">${esc(s.lastReason || '')}${s.lastError ? ' · 有错误' : ''}</div></div>
      <div class="card"><div class="label">定时任务</div><div class="value" style="font-size:15px">${esc(s.cron || '—')}</div><div class="sub">${s.webhookPending ? 'Webhook 待执行' : (s.nextRun ? `下次 ${fmtTime(s.nextRun)}` : '等待触发')}</div></div>
    </div>
    ${s.font?.hint ? `<div class="status-line err" style="margin-bottom:14px"><span class="ico-inline">${ICO.alert}</span>${esc(s.font.hint)}（当前使用字体：${esc(s.font.fontFamily)}）</div>` : ''}
    <div class="panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin-bottom:0">需要关注</h3>
        ${failedTargets.length || failedTasks.length ? '<button class="btn sm" id="btn-ack-all">一键清除</button>' : ''}
      </div>
      ${failedTargets.length || failedTasks.length ? `
        ${failedTargets.length ? `
          <div class="health-block">
            <div class="health-title">封面生成异常（${failedTargets.length}）</div>
            ${failedTargets.map((t) => `
              <div class="health-row">
                <span class="health-name">${esc(t.name)}</span>
                <span class="badge ${t.kind === 'library' ? 'lib' : 'col'}">${t.kind === 'library' ? '媒体库' : '合集'}</span>
                <span class="health-err" title="${esc(t.lastError)}">${esc(t.lastError)}</span>
                <button class="btn sm primary" data-retry="${esc(t.id)}">重试</button>
                <button class="btn sm" data-ack-target="${esc(t.id)}">已读</button>
              </div>`).join('')}
          </div>` : ''}
        ${failedTasks.length ? `
          <div class="health-block">
            <div class="health-title">最近失败任务（${failedTasks.length}）</div>
            ${failedTasks.map((t) => `
              <div class="health-row">
                <span class="health-name">${esc(t.name)}</span>
                <span class="muted">${fmtTime(t.ts)}</span>
                <span class="health-err" title="${esc(t.error || '')}">${esc(t.error || '未知错误')}</span>
                <button class="btn sm" data-ack-task="${esc(t.seq)}">已读</button>
              </div>`).join('')}
          </div>` : ''}
      ` : `<div class="health-ok"><span class="ico-inline">${ICO.check}</span>全部正常，无需关注</div>`}
    </div>
    <div class="panel">
      <h3 style="margin-bottom:10px">最近生成</h3>
      ${recentLibs.length ? `
        <div class="recent-title">媒体库</div>
        <div class="recent-grid">
          ${recentLibs.map((t) => `
          <div class="recent-item lib" data-preview="${esc(t.id)}" title="点击预览">
            <div class="recent-img">
              <img src="${esc(t.coverUrl)}?v=${encodeURIComponent(t.lastGeneratedAt || Date.now())}" alt="">
            </div>
            ${t.lastTrigger ? `<div class="recent-trig-line"><span class="badge trig-${esc(t.lastTrigger)}">${esc(TRIGGER_LABEL[t.lastTrigger] || t.lastTrigger)}</span></div>` : ''}
            <div class="recent-name">${esc(t.name)}</div>
            <div class="recent-time">${fmtTime(t.lastGeneratedAt)}</div>
          </div>`).join('')}
        </div>` : ''}
      ${recentCols.length ? `
        <div class="recent-title">合集</div>
        <div class="recent-grid">
          ${recentCols.map((t) => `
          <div class="recent-item col" data-preview="${esc(t.id)}" title="点击预览">
            <div class="recent-img">
              <img src="${esc(t.coverUrl)}?v=${encodeURIComponent(t.lastGeneratedAt || Date.now())}" alt="">
            </div>
            ${t.lastTrigger ? `<div class="recent-trig-line"><span class="badge trig-${esc(t.lastTrigger)}">${esc(TRIGGER_LABEL[t.lastTrigger] || t.lastTrigger)}</span></div>` : ''}
            <div class="recent-name">${esc(t.name)}</div>
            <div class="recent-time">${fmtTime(t.lastGeneratedAt)}</div>
          </div>`).join('')}
        </div>` : ''}
      ${!recentLibs.length && !recentCols.length ? '<div class="muted" style="padding:8px 0">还没有生成记录</div>' : ''}
    </div>`;

  const ackRefresh = async () => {
    renderDashboard();
    loadStatus();
  };
  const ackBtn = $('#btn-ack-all');
  if (ackBtn) {
    ackBtn.onclick = async () => {
      try {
        await api('/api/acknowledge', { method: 'POST', body: { all: true } });
        toast('已全部标记为已读', 'ok');
        ackRefresh();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  }
  document.querySelectorAll('[data-ack-target]').forEach((b) => {
    b.onclick = async () => {
      try {
        await api('/api/acknowledge', { method: 'POST', body: { targetId: b.dataset.ackTarget } });
        toast('已标记为已读', 'ok');
        ackRefresh();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  });
  document.querySelectorAll('[data-ack-task]').forEach((b) => {
    b.onclick = async () => {
      try {
        await api('/api/acknowledge', { method: 'POST', body: { taskSeq: Number(b.dataset.ackTask) } });
        toast('已标记为已读', 'ok');
        ackRefresh();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  });

  document.querySelectorAll('[data-retry]').forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      b.style.minWidth = `${b.offsetWidth}px`;
      b.innerHTML = '<span class="spinner"></span>';
      try {
        await api(`/api/targets/${b.dataset.retry}/generate`, { method: 'POST', body: {} });
        toast('已重新生成', 'ok');
        renderDashboard();
        loadStatus();
      } catch (e) {
        toast(e.message, 'err');
        b.disabled = false;
        b.textContent = '重试';
      }
    };
  });

  document.querySelectorAll('.recent-item[data-preview]').forEach((el) => {
    el.onclick = () => showPreview(el.dataset.preview);
  });

  document.querySelectorAll('.recent-grid').forEach((grid) => {
    // 滚轮纵向滚动转为画廊横向滚动
    grid.addEventListener('wheel', (e) => {
      if (grid.scrollWidth <= grid.clientWidth) return;
      e.preventDefault();
      grid.scrollLeft += e.deltaY + e.deltaX;
    }, { passive: false });
    // 按住拖拽横向滚动
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    grid.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startLeft = grid.scrollLeft;
      grid.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const moved = Math.abs(e.clientX - startX);
      if (moved > 6) grid.dataset.dragged = '1';
      grid.scrollLeft = startLeft - (e.clientX - startX);
    });
    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      grid.style.cursor = '';
    });
    grid.addEventListener('click', (e) => {
      if (grid.dataset.dragged === '1') {
        e.preventDefault();
        e.stopPropagation();
        grid.dataset.dragged = '';
      }
    }, true);
  });
}

// ---------- 封面管理 ----------
async function renderTargets() {
  main.innerHTML = `
    <div class="page-title">封面管理</div>
    <div class="page-desc">管理 Emby 媒体库与合集的封面生成，单选可单独配置，支持多选批量操作</div>
    <div class="filter-bar">
      <div class="search-box">
        <span class="fico">${ICO.search}</span>
        <input type="search" id="search-targets" placeholder="搜索名称…">
      </div>
      <div class="fdrop" id="fdrop-type"></div>
      <div class="fdrop" id="fdrop-status"></div>
      <div class="fdrop" id="fdrop-cfg"></div>
      <div class="fdrop" id="fdrop-cover"></div>
      <button class="clear-filters-link" id="btn-clear-filters" type="button">
        ${ICO.clear}<span>清除筛选</span>
      </button>
    </div>
    <div class="progress-box" id="sync-progress" style="display:none">
      <div class="row" style="justify-content:space-between">
        <span class="progress-title">封面更新进度</span>
        <span class="muted progress-text" id="sync-text">准备中…</span>
      </div>
      <div class="progress-bar" style="margin-top:8px"><div class="progress-fill" id="sync-fill"></div></div>
      <div class="row" style="gap:6px;margin-top:10px">
        <button class="btn sm" id="sync-pause">暂停</button>
        <button class="btn sm danger" id="sync-cancel">取消</button>
      </div>
    </div>
    <div class="panel" style="padding:12px 16px">
      <div class="row" style="justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div class="row" style="gap:12px">
          <label class="row" style="gap:6px;cursor:pointer"><input type="checkbox" class="tick" id="sel-all"> 全选</label>
          <span class="muted" id="sel-count">已选 0 项</span>
          <button class="btn sm primary" id="sync-all-covers">同步媒体库封面</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn sm" id="batch-enable" disabled>取消锁定</button>
          <button class="btn sm" id="batch-disable" disabled>锁定</button>
          <button class="btn sm" id="batch-reset" disabled>恢复默认配置</button>
          <button class="btn sm primary" id="batch-gen" disabled>更新封面</button>
        </div>
      </div>
    </div>
    <div class="tlist" id="target-list"><div class="empty">加载中…</div></div>`;

  try {
    state.styles = (await api('/api/styles'));
  } catch {
    if (!state.styles) state.styles = { styles: [{ id: 'single', name: '单图海报' }], sizes: [{ id: 'poster', label: '海报 2:3' }, { id: 'thumb', label: '缩略图 16:9' }] };
  }
  const filterDefs = [
    {
      key: 'type', id: 'fdrop-type', icon: ICO.grid,
      options: [
        { value: 'all', label: '全部类型', icon: ICO.grid },
        { value: 'library', label: '媒体库', icon: ICO.layer },
        { value: 'collection', label: '合集', icon: ICO.folder }
      ]
    },
    {
      key: 'status', id: 'fdrop-status', icon: ICO.status,
      options: [
        { value: 'all', label: '全部状态', icon: ICO.status },
        { value: 'enabled', label: '监控中', icon: ICO.check },
        { value: 'locked', label: '已锁定', icon: ICO.lock }
      ]
    },
    {
      key: 'cfg', id: 'fdrop-cfg', icon: ICO.cfg,
      options: [
        { value: 'all', label: '全部配置', icon: ICO.cfg },
        { value: 'default', label: '默认配置', icon: ICO.doc },
        { value: 'configured', label: '手动配置', icon: ICO.pencil }
      ]
    },
    {
      key: 'cover', id: 'fdrop-cover', icon: ICO.cover,
      options: [
        { value: 'all', label: '全部封面', icon: ICO.cover },
        { value: 'generated', label: '已生成', icon: ICO.cover },
        { value: 'error', label: '有错误', icon: ICO.alert }
      ]
    }
  ];
  state.fdropRefs = {};
  filterDefs.forEach((def) => {
    const el = document.getElementById(def.id);
    if (!el) return;
    state.fdropRefs[def.key] = buildFilterDropdown(el, {
      icon: def.icon,
      options: def.options,
      value: state.filters[def.key] || 'all',
      onChange: (v) => {
        state.filters[def.key] = v;
        state.selected.clear();
        drawTargets();
      }
    });
  });
  const clearBtn = $('#btn-clear-filters');
  if (clearBtn) {
    clearBtn.onclick = () => {
      state.filters = { type: 'all', status: 'all', cfg: 'all', cover: 'all' };
      Object.values(state.fdropRefs || {}).forEach((r) => r.setValue('all', true));
      const s = $('#search-targets');
      if (s) s.value = '';
      state.selected.clear();
      drawTargets();
    };
  }
  const searchEl = $('#search-targets');
  if (searchEl) searchEl.oninput = () => drawTargets();

  try {
    const r = await api('/api/targets');
    state.targets = r.targets;
    drawTargets();
  } catch (e) {
    $('#target-list').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
  bindBatch();
}

function configHtml(t) {
  const isLib = t.kind === 'library';
  const pend = state.pendingCfg && state.pendingCfg.id === t.id ? state.pendingCfg : null;
  const style = pend ? pend.style : (t.template || state.styles?.styleByKind?.[t.kind] || 'single');
  const pick = pend ? pend.pickBy : (t.pickBy || targetDefaultPick(t, style));
  const manualName = pend ? pend.manualItemName : (t.manualItemName || '');
  const locked = Boolean(t.locked);
  // 样式：媒体库可选单图/海报墙，合集仅单图；顺序为样式在前、选图依据在后
  const styleOpts = `<option value="single" ${style === 'single' ? 'selected' : ''}>单图海报</option>${isLib ? `<option value="wall3" ${style === 'wall3' ? 'selected' : ''}>海报墙</option>` : ''}`;
  const pickBtns = `
    <button class="pick-opt ${pick === 'added' ? 'active' : ''}" data-pick-btn="added" ${locked ? 'disabled' : ''}>最新入库</button>
    <button class="pick-opt ${pick === 'premiere' ? 'active' : ''}" data-pick-btn="premiere" ${locked ? 'disabled' : ''}>最新发行</button>
    ${style === 'single' ? `<button class="pick-opt ${pick === 'random' ? 'active' : ''}" data-pick-btn="random" ${locked ? 'disabled' : ''}>随机</button>` : ''}
    ${style === 'single' ? `<button class="pick-opt ${pick === 'manual' ? 'active' : ''}" data-pick-btn="manual" ${locked ? 'disabled' : ''}>手动选择</button>` : ''}`;
  const manualBlock = style === 'single' && pick === 'manual' ? `
    <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
      <span class="muted" style="font-size:12px">已选：${esc(manualName || '未选择')}${manualName ? '' : '（点选图依据可重新选择）'}${manualName ? ' · 保存后自动锁定' : ''}</span>
    </div>` : '';
  const changed = hasCfgChanges(t, pend);
  const actions = locked
    ? `<span class="muted" style="font-size:11px">已锁定，需先取消锁定才能修改</span>`
    : changed
      ? `<button class="btn sm primary" data-save-cfg="${esc(t.id)}" data-lock="0">保存</button>`
      : '';
  return `
    <div class="pick-config" data-pick-box="${esc(t.id)}" style="display:none;margin-top:8px">
      <div class="meta" style="margin-bottom:6px">当前：${t.configured ? '<span class="badge warn-badge">手动配置</span>' : '<span class="badge gray">默认配置</span>'}${t.configured ? '' : `（跟随${isLib ? '媒体库' : '合集'}全局配置）`}</div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        <span class="muted" style="font-size:12px">封面样式</span>
        <select data-cfg-style="${esc(t.id)}" ${locked ? 'disabled' : ''} style="width:150px;padding:5px 8px;font-size:12px">${styleOpts}</select>
      </div>
      <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
        <span class="muted" style="font-size:12px">选图依据</span>
        <div class="pick-opts" data-pick-opts="${esc(t.id)}">${pickBtns}</div>
        ${style !== 'single' ? '<span class="muted" style="font-size:11px">海报墙样式不支持手动选择</span>' : ''}
      </div>
      ${manualBlock}
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center">${actions}</div>
    </div>`;
}

function setPendingField(id, key, value) {
  const t = state.targets.find((x) => x.id === id);
  if (!t) return;
  const cur = state.pendingCfg && state.pendingCfg.id === id ? state.pendingCfg : null;
  const style = key === 'style' ? value : (cur?.style || t.template || state.styles?.styleByKind?.[t.kind] || 'single');
  if (key === 'pickBy' && value !== 'manual' && t.draftCover) t.draftCover = '';
  state.pendingCfg = {
    id,
    style,
    pickBy: key === 'pickBy' ? value : (cur?.pickBy || t.pickBy || targetDefaultPick(t, style)),
    manualItemId: cur?.manualItemId || t.manualItemId || '',
    manualItemName: cur?.manualItemName || t.manualItemName || ''
  };
  drawTargets();
  // 切到「手动选择」时自动弹出选片窗口
  if (key === 'pickBy' && value === 'manual') openItemPicker(id);
  else scheduleDraft(id);
}

let draftTimer = null;

function scheduleDraft(id) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => generateDraft(id), 400);
}

async function generateDraft(id) {
  const t = state.targets.find((x) => x.id === id);
  const cur = state.pendingCfg && state.pendingCfg.id === id ? state.pendingCfg : null;
  if (!t || !cur || !hasCfgChanges(t, cur)) return;
  const body = { style: cur.style, pickBy: cur.pickBy };
  if (cur.pickBy === 'manual') {
    body.manualItemId = cur.manualItemId || t.manualItemId || '';
    body.manualItemName = cur.manualItemName || t.manualItemName || '';
    if (!body.manualItemId) return;
  }
  try {
    const r = await api(`/api/targets/${encodeURIComponent(id)}/preview-draft`, { method: 'POST', body });
    const tt = state.targets.find((x) => x.id === id);
    if (tt && state.pendingCfg?.id === id) {
      tt.draftCover = r.coverUrl;
      drawTargets();
    }
  } catch {
    // 预览失败时保留当前封面，不影响后续保存
  }
}

function targetDefaultPick(t, style) {
  const s = style || (t.kind === 'collection' ? 'single' : (t.template || state.styles?.styleByKind?.library || 'single'));
  return state.styles?.defaultPickByByStyle?.[`${t.kind}-${s}`] || 'added';
}

function hasCfgChanges(t, cur) {
  if (!cur) return false;
  const curStyle = t.template || state.styles?.styleByKind?.[t.kind] || 'single';
  const curPick = t.pickBy || targetDefaultPick(t, curStyle);
  if (cur.style !== curStyle) return true;
  if (cur.pickBy !== curPick) return true;
  if (cur.pickBy === 'manual' && cur.manualItemId !== (t.manualItemId || '')) return true;
  return false;
}

function drawTargets() {
  const f = state.filters;
  const q = ($('#search-targets')?.value || '').trim().toLowerCase();
  const searchList = state.targets.filter((t) => !q || (t.name || '').toLowerCase().includes(q));
  const list = searchList.filter((t) => {
    if (f.type !== 'all' && t.kind !== f.type) return false;
    if (f.status !== 'all' && (f.status === 'locked' ? !t.locked : t.locked)) return false;
    if (f.cfg !== 'all' && (f.cfg === 'configured' ? !t.configured : t.configured)) return false;
    if (f.cover !== 'all' && (f.cover === 'generated' ? !t.coverUrl : !t.lastError)) return false;
    return true;
  }).sort((a, b) => ((a.kind === b.kind) ? 0 : (a.kind === 'library' ? -1 : 1)) || a.name.localeCompare(b.name, 'zh-CN'));
  state.visibleIds = new Set(list.map((t) => t.id));
  const box = $('#target-list');
  if (!list.length) {
    box.innerHTML = '<div class="empty">没有符合条件的合集</div>';
    return;
  }
  box.innerHTML = list.map((t) => {
    const kind = t.kind === 'library' ? '<span class="badge lib">媒体库</span>' : '<span class="badge col">合集</span>';
    const thumbStyle = t.kind === 'library' ? 'width:96px;height:54px' : 'width:56px;height:84px';
    const thumbSrc = t.draftCover
      ? `${esc(t.draftCover)}&v=${encodeURIComponent(t.lastGeneratedAt || Date.now())}`
      : `${esc(t.coverUrl)}?v=${encodeURIComponent(t.lastGeneratedAt || Date.now())}`;
    const thumb = t.coverUrl
      ? `<img class="thumb" style="${thumbStyle}" src="${thumbSrc}" alt="" title="点击预览" data-preview="${esc(t.id)}">`
      : `<div class="thumb" title="点击预览" data-preview="${esc(t.id)}" style="display:flex;align-items:center;justify-content:center;${thumbStyle}"><span class="ico-thumb">${ICO.cover}</span></div>`;
    const pickBy = t.pickBy || targetDefaultPick(t);
    const pickLabel = pickBy === 'premiere' ? '最新发行' : pickBy === 'manual' ? '手动选择' : pickBy === 'random' ? '随机' : '最新入库';
    const isBoxsetsLib = t.kind === 'library' && (t.collectionType === 'boxsets' || t.collectionType === 'collections');
    const countText = isBoxsetsLib ? `共 ${t.itemCount || 0} 合集` : `${t.itemCount || 0} 部影片`;
    // 仅单图海报显示海报来源，海报墙样式不显示
    const effStyle = t.kind === 'collection' ? 'single' : (t.template || state.styles?.styleByKind?.[t.kind] || 'single');
    const sourceLine = effStyle === 'single' && t.posterSource ? `<div class="meta">海报来源：${esc(t.posterSource)}</div>` : '';
    const status = t.lastError
      ? `<div class="err"><span class="ico-inline">${ICO.alert}</span>${esc(t.lastError)}</div>`
      : `<div class="meta">${fmtTime(t.lastGeneratedAt)} 生成 · ${pickLabel} · ${countText}</div>${sourceLine}`;
    const cfg = configHtml(t);
    return `
      <div class="trow ${t.missing ? 'missing' : ''} ${state.selected.has(t.id) ? 'selected' : ''}" data-id="${esc(t.id)}">
        ${thumb}
        <div class="info">
          <div class="name">${esc(t.name)} ${kind}${t.configured ? '<span class="badge warn-badge">手动配置</span>' : '<span class="badge gray">默认配置</span>'}${t.locked ? '<span class="badge warn-badge">已锁定</span>' : ''}${t.missing ? '<span class="badge gray">已删除</span>' : ''}</div>
          ${status}
          ${cfg}
        </div>
        <div class="actions">
          <button class="btn sm primary" data-act="gen" data-id="${esc(t.id)}" ${t.locked ? 'disabled title="已锁定，需先取消锁定"' : ''}>更新</button>
          ${state.selected.size === 1 && state.selected.has(t.id) ? `
            <button class="btn sm" ${t.locked ? 'data-unlock' : 'data-lock-only'}="${esc(t.id)}">${t.locked ? '取消锁定' : '锁定'}</button>` : ''}
        </div>
      </div>`;
  }).join('');

  box.querySelectorAll('.trow').forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest('button, a, select, input, img, .pick-opt')) return;
      const id = row.dataset.id;
      if (!id) return;
      if (state.selected.has(id)) state.selected.clear();
      else {
        state.selected.clear();
        state.selected.add(id);
      }
      drawTargets();
    };
  });

  box.querySelectorAll('select[data-cfg-style]').forEach((el) => {
    el.onchange = () => setPendingField(el.dataset.cfgStyle, 'style', el.value);
  });

  box.querySelectorAll('button[data-pick-btn]').forEach((el) => {
    el.onclick = () => {
      const optsBox = el.closest('[data-pick-opts]');
      if (optsBox) setPendingField(optsBox.dataset.pickOpts, 'pickBy', el.dataset.pickBtn);
    };
  });

  box.querySelectorAll('button[data-save-cfg]').forEach((el) => {
    el.onclick = async () => {
      const id = el.dataset.saveCfg;
      const t = state.targets.find((x) => x.id === id);
      if (!t) return;
      const cur = state.pendingCfg && state.pendingCfg.id === id ? state.pendingCfg : null;
      const style = cur?.style || t.template || state.styles?.styleByKind?.[t.kind] || 'single';
      let pick = cur?.pickBy || t.pickBy || targetDefaultPick(t, style);
      if (style !== 'single') pick = 'added'; // 海报墙样式不支持手动选择
      // 手动选择保存后自动锁定，其他选项不锁定
      const withLock = pick === 'manual';
      const body = { template: style, pickBy: pick, locked: withLock };
      const changed = hasCfgChanges(t, cur);
      if (pick === 'manual') {
        const mid = cur?.manualItemId || t.manualItemId || '';
        if (!mid) {
          toast('手动选择需要先选择一部封面影片', 'err');
          return;
        }
        body.manualItemId = mid;
        body.manualItemName = cur?.manualItemName || t.manualItemName || '';
      }
      try {
        await api(`/api/targets/${id}`, { method: 'PUT', body });
        state.pendingCfg = null;
        if (withLock || changed) {
          toast(withLock ? '配置已保存并锁定，正在更新封面…' : '配置有修改，正在更新封面…', 'info');
          try {
            await api(`/api/targets/${id}/generate`, { method: 'POST', body: {} });
            toast(withLock ? '封面已按新配置生成并锁定' : '封面已按新配置更新', 'ok');
          } catch (e) {
            toast(`配置已保存，但封面更新失败：${e.message}`, 'err');
          }
        } else {
          toast('配置已保存（无改动，未更新封面）', 'ok');
        }
        state.selected.clear();
        refreshTargets();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  });

  box.querySelectorAll('button[data-lock-only]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/targets/${el.dataset.lockOnly}`, { method: 'PUT', body: { locked: true } });
        state.pendingCfg = null;
        toast('已锁定（停止监控）', 'ok');
        refreshTargets();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  });

  box.querySelectorAll('button[data-unlock]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/targets/${el.dataset.unlock}`, { method: 'PUT', body: { locked: false } });
        state.pendingCfg = null;
        toast('已取消锁定，可以修改配置', 'ok');
        refreshTargets();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  });

  box.querySelectorAll('[data-preview]').forEach((el) => {
    el.onclick = () => showPreview(el.dataset.preview);
  });

  box.querySelectorAll('button[data-act="gen"]').forEach((el) => {
    el.onclick = async () => {
      el.disabled = true;
      el.style.minWidth = `${el.offsetWidth}px`;
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const r = await api(`/api/targets/${el.dataset.id}/generate`, { method: 'POST', body: {} });
        toast('封面已重新生成并上传', 'ok');
        refreshTargets();
      } catch (e) {
        toast(e.message, 'err');
        el.disabled = false;
        el.textContent = '更新';
      }
    };
  });
  updateBatchUI();
}

async function refreshTargets() {
  try {
    const r = await api('/api/targets');
    state.targets = r.targets;
  } catch (e) {
    toast(e.message, 'err');
  }
  if ($('#target-list')) drawTargets();
}

function updateBatchUI() {
  const n = state.selected.size;
  const count = $('#sel-count');
  if (count) count.textContent = `已选 ${n} 项`;
  ['batch-enable', 'batch-disable', 'batch-reset', 'batch-gen'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = n === 0;
  });
  const selAll = $('#sel-all');
  if (selAll) {
    selAll.checked = state.visibleIds.size > 0 && [...state.visibleIds].every((id) => state.selected.has(id));
    selAll.disabled = state.visibleIds.size === 0;
  }
  if (n !== 1 || (state.pendingCfg && !state.selected.has(state.pendingCfg.id))) {
    state.pendingCfg = null;
    (state.targets || []).forEach((t) => {
      t.draftCover = '';
    });
  }
  document.querySelectorAll('.pick-config').forEach((el) => {
    el.style.display = (n === 1 && state.selected.has(el.dataset.pickBox)) ? '' : 'none';
  });
}

function bindBatch() {
  $('#sel-all').onchange = () => {
    const checked = $('#sel-all').checked;
    if (checked) [...state.visibleIds].forEach((id) => state.selected.add(id));
    else state.selected.clear();
    drawTargets();
  };
  $('#batch-enable').onclick = () => batchAction('enable');
  $('#batch-disable').onclick = () => batchAction('disable');
  $('#batch-reset').onclick = () => batchAction('reset');
  $('#batch-gen').onclick = () => batchAction('generate');
  $('#sync-all-covers').onclick = () => {
    toast('开始同步所有未锁定封面…', 'ok');
    showSyncProgress();
    api('/api/sync', { method: 'POST', body: { force: true } }).then(() => {}).catch(() => {});
  };
  const syncState = state.status?.sync;
  if (syncState && (syncState.running || syncState.status === 'paused')) showSyncProgress();
}

async function batchAction(action, value = '') {
  const ids = [...state.selected];
  if (!ids.length) return;
  try {
    const r = await api('/api/targets/batch', { method: 'POST', body: { ids, action, value } });
    if (action === 'generate') {
      toast(`已开始批量更新封面（${r.updated} 项）`, 'ok');
      showSyncProgress();
    } else if (action === 'reset') {
      toast(`已恢复默认配置，正在重新生成封面（${r.updated} 项）`, 'ok');
      showSyncProgress();
    } else if (action === 'enable') {
      for (const id of ids) {
        const t = state.targets.find((x) => x.id === id);
        if (t) {
          t.locked = false;
          t.enabled = true;
        }
      }
      toast(`已取消锁定（${r.updated} 项）`, 'ok');
      setTimeout(() => refreshTargets(), 400);
    } else if (action === 'disable') {
      for (const id of ids) {
        const t = state.targets.find((x) => x.id === id);
        if (t) {
          t.locked = true;
          t.enabled = false;
        }
      }
      toast(`已锁定（${r.updated} 项）`, 'ok');
      setTimeout(() => refreshTargets(), 400);
    }
  } catch (e) {
    toast(e.message, 'err');
  }
}

let syncTimer = null;

function showSyncProgress() {
  clearInterval(syncTimer);
  syncTimer = null;
  if (state.page !== 'targets') {
    go('/targets');
  }
  const box = document.getElementById('sync-progress');
  if (!box) {
    // 页面尚未渲染完成，稍后重试
    setTimeout(showSyncProgress, 150);
    return;
  }
  box.style.display = 'block';
  box.dataset.done = '';
  const fill = $('#sync-fill');
  const text = $('#sync-text');
  const pauseBtn = $('#sync-pause');
  const cancelBtn = $('#sync-cancel');
  pauseBtn.style.display = '';
  cancelBtn.style.display = '';
  const labels = { idle: '空闲', running: '进行中', paused: '已暂停', cancelled: '已取消', done: '已完成', failed: '失败' };
  let finished = false;

  async function refresh() {
    if (!document.getElementById('sync-progress')) {
      clearInterval(syncTimer);
      syncTimer = null;
      return;
    }
    const s = (await api('/api/status').catch(() => null))?.sync;
    if (!s) return;
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    fill.style.width = `${pct}%`;
    let lines = `${labels[s.status] || s.status} · ${s.done} / ${s.total}（${pct}%）`;
    if (s.current) lines += `\n正在处理：${s.current}`;
    if (s.failed) lines += `\n失败 ${s.failed} 个`;
    if (s.updated) lines += `\n已更新 ${s.updated} 个`;
    text.textContent = lines;
    const paused = s.status === 'paused';
    pauseBtn.textContent = paused ? '继续' : '暂停';
    pauseBtn.disabled = !s.running && !paused;
    cancelBtn.disabled = !s.running && !paused;
    if (paused) return; // 暂停时保留卡片与「继续/取消」按钮，等待用户操作
    if (!s.running && !finished) {
      finished = true;
      box.dataset.done = '1';
      clearInterval(syncTimer);
      syncTimer = null;
      if (s.status === 'done') text.textContent = `${lines}\n全部完成`;
      if (s.status === 'cancelled') text.textContent = `${lines}\n任务已取消`;
      if (s.status === 'failed') text.textContent = `${lines}\n任务失败`;
      if (s.failed > 0) toast(`有 ${s.failed} 个封面生成失败，请到概览查看`, 'err');
      pauseBtn.style.display = 'none';
      cancelBtn.style.display = 'none';
      refreshTargets();
      setTimeout(() => {
        if (box.dataset.done === '1') box.style.display = 'none';
      }, 6000);
    }
  }

  pauseBtn.onclick = async () => {
    try {
      if (pauseBtn.textContent === '继续') {
        await api('/api/sync/resume', { method: 'POST', body: {} });
        toast('已继续任务', 'ok');
      } else {
        await api('/api/sync/pause', { method: 'POST', body: {} });
        toast('已暂停任务', 'info');
      }
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  cancelBtn.onclick = async () => {
    try {
      await api('/api/sync/cancel', { method: 'POST', body: {} });
      toast('已请求取消', 'info');
      refresh();
    } catch (e) {
      toast(e.message, 'err');
    }
  };
  syncTimer = setInterval(refresh, 1000);
  refresh();
}

function showPreview(id) {
  const t = state.targets.find((x) => x.id === id);
  const isLib = t?.kind === 'library';
  const imgW = isLib ? 420 : 300;
  const cover = t?.coverUrl
    ? `<img src="${esc(t.coverUrl)}?v=${encodeURIComponent(t.lastGeneratedAt || Date.now())}" style="width:${imgW}px;max-width:100%;height:auto;border-radius:10px" alt="封面预览">`
    : `<div class="pv-empty">尚未生成封面，点击下方按钮生成</div>`;
  openModal(`
    <div class="modal-head"><h3>封面预览</h3><button class="btn sm ghost" onclick="closeModal()">✕</button></div>
    <div class="pv-row">
      ${cover}
      <div class="pv-side">
        <p class="modal-note">展示当前已生成的封面${t?.lastGeneratedAt ? `（${fmtTime(t.lastGeneratedAt)} 生成）` : ''}，不会重复合成。</p>
        <button class="btn primary" id="pv-update">更新并上传</button>
      </div>
    </div>
  `);
  $('#pv-update').onclick = async () => {
    const btn = $('#pv-update');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 生成中…';
    try {
      await api(`/api/targets/${encodeURIComponent(id)}/generate`, { method: 'POST', body: {} });
      closeModal();
      toast('封面已更新并上传', 'ok');
      refreshTargets();
    } catch (e) {
      toast(e.message, 'err');
      btn.disabled = false;
      btn.textContent = '更新并上传';
    }
  };
}

async function openItemPicker(id) {
  openModal(`
    <div class="modal-head"><h3>选择封面影片</h3><button class="btn sm ghost" onclick="closeModal()">✕</button></div>
    <p class="modal-note">点击任意影片，将其海报作为该合集封面。选择后先本地预览，点「保存」或「保存并锁定」才会上传 Emby。</p>
    <div class="picker-grid" id="picker-grid"><div class="empty">加载中…</div></div>
  `);
  let items = [];
  try {
    const r = await api(`/api/targets/${encodeURIComponent(id)}/items`);
    items = (r.items || []).filter((i) => i.hasPrimary);
  } catch (e) {
    const grid = $('#picker-grid');
    if (grid) grid.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  const grid = $('#picker-grid');
  if (!grid) return;
  if (!items.length) {
    grid.innerHTML = '<div class="empty">该媒体库内没有带封面的影片</div>';
    return;
  }
  grid.innerHTML = items.map((i) => `
    <button class="picker-item" data-pid="${esc(i.id)}" data-name="${esc(i.name)}">
      <img loading="lazy" src="/api/item-image/${encodeURIComponent(i.id)}?w=160" alt="">
      <span>${esc(i.name)}</span>
    </button>`).join('');
  grid.querySelectorAll('.picker-item').forEach((el) => {
    el.onclick = async () => {
      try {
        const t = state.targets.find((x) => x.id === id);
        const cur = state.pendingCfg && state.pendingCfg.id === id ? state.pendingCfg : null;
        state.pendingCfg = {
          id,
          style: cur?.style || t?.template || state.styles?.styleByKind?.[t?.kind] || 'single',
          pickBy: 'manual',
          manualItemId: el.dataset.pid,
          manualItemName: el.dataset.name
        };
        closeModal();
        toast('正在本地生成封面预览…', 'info');
        try {
          const r = await api(`/api/targets/${encodeURIComponent(id)}/preview-draft`, {
            method: 'POST',
            body: {
              style: state.pendingCfg?.style || 'single',
              pickBy: 'manual',
              manualItemId: el.dataset.pid,
              manualItemName: el.dataset.name
            }
          });
          const t = state.targets.find((x) => x.id === id);
          if (t) t.draftCover = r.coverUrl;
          drawTargets();
          toast('已生成本地预览，点「保存」后上传 Emby', 'ok');
        } catch (e) {
          drawTargets();
          toast(`预览生成失败：${e.message}`, 'err');
        }
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  });
}

// ---------- 设置 ----------
async function renderSettings() {
  if (!state.styles) {
    try {
      state.styles = await api('/api/styles');
    } catch {
      state.styles = { styles: [{ id: 'grid', name: '经典拼图' }], sizes: [{ id: 'poster', label: '海报 2:3' }, { id: 'thumb', label: '缩略图 16:9' }] };
    }
  }
  await loadStatus();
  let s;
  try {
    s = (await api('/api/settings')).settings;
  } catch (e) {
    main.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  state.settings = s;
  if (!state.targets || !state.targets.length) {
    try {
      state.targets = (await api('/api/targets')).targets;
    } catch {
      state.targets = [];
    }
  }

  function cfgDefaultCover(kind) {
    return {
      width: kind === 'library' ? 1600 : 1000,
      height: kind === 'library' ? 900 : 1500,
      titleSize: 84,
      subtitleSize: 36,
      titleColor: '#ffffff',
      subtitleColor: '#c9d6f2',
      bgTop: '#17233d',
      bgBottom: '#0a0f1c',
      backgroundMode: 'gradient',
      accent: '#00a4dc',
      radius: 20,
      cellBorder: 2,
      showCount: true,
      fontFamily: 'Noto Sans CJK SC',
      fontFile: ''
    };
  }
  // 三套默认配置：媒体库·单图海报 / 媒体库·海报墙 / 合集·单图海报
  state.cfgGroup = 'library-single';
  state.cfgDraft = {
    'library-single': {
      style: 'single',
      pickBy: s.defaultPickByByStyle?.['library-single'] || 'added',
      cover: { ...cfgDefaultCover('library'), ...(s.coverByStyle?.['library-single'] || {}) }
    },
    'library-wall3': {
      style: 'wall3',
      pickBy: s.defaultPickByByStyle?.['library-wall3'] || 'added',
      cover: { ...cfgDefaultCover('library'), ...(s.coverByStyle?.['library-wall3'] || {}) }
    },
    'collection-single': {
      style: 'single',
      pickBy: s.defaultPickByByStyle?.['collection-single'] || 'added',
      cover: { ...cfgDefaultCover('collection'), ...(s.coverByStyle?.['collection-single'] || {}) }
    }
  };
  const c = state.cfgDraft['library-single'].cover;

  main.innerHTML = `
    <div class="page-title">设置</div>
    <div class="page-desc">配置 Emby 连接、自动更新与封面模板默认值</div>

    <div class="panel">
      <h3>Emby 连接</h3>
      <div class="grid-2">
        <label class="field"><span class="lab">服务器地址</span>
          <input type="url" id="set-embyUrl" value="${esc(s.embyUrl)}" placeholder="http://192.168.1.100:8096">
          <span class="hint">Emby 服务器地址（无需带 /emby 前缀）</span>
        </label>
        <label class="field"><span class="lab">API 密钥</span>
          <input type="password" id="set-embyApiKey" value="${esc(s.embyApiKey)}" placeholder="Emby → 设置 → 高级 → API 密钥">
        </label>
      </div>
      <div class="row">
        <button class="btn primary" id="btn-save-emby">保存连接设置</button>
        <button class="btn" id="btn-test">测试连接</button>
        <span class="status-line" id="test-result"></span>
        <span class="status-line" id="save-emby-result"></span>
      </div>
    </div>

    <div class="panel">
      <h3>自动更新</h3>
      <div class="grid-2">
        <label class="field"><span class="lab">定时同步 cron 表达式</span>
          <input type="text" id="set-cron" value="${esc(s.cron)}" placeholder="0 */6 * * *">
          <span class="hint">5 段格式：分 时 日 月 周，例如每 6 小时：0 */6 * * *</span>
        </label>
        <label class="field"><span class="lab">Webhook 防抖（毫秒）</span>
          <input type="number" id="set-webhookDebounceMs" value="${s.webhookDebounceMs}">
          <span class="hint">收到事件后等待多久再执行同步，避免入库瞬间频繁触发</span>
        </label>
      </div>
      <div class="row" style="gap:22px">
        <label class="row" style="gap:8px"><input type="checkbox" id="set-autoEnableNew" ${s.autoEnableNew ? 'checked' : ''}> 自动启用新发现的媒体库/合集</label>
        <label class="row" style="gap:8px"><input type="checkbox" id="set-syncOnStart" ${s.syncOnStart ? 'checked' : ''}> 服务启动时自动同步</label>
      </div>
      <div class="row mt">
        <div class="url-box" id="set-webhook-url">${esc(state.status?.webhook?.url || '')}</div>
        <button class="btn sm" id="copy-wh">复制</button>
      </div>
      <p class="muted mt">Emby 官方 Webhooks 插件中填写上面的地址即可；事件建议勾选：项目已添加、项目已更新、项目已移除、媒体库新建。</p>
      <div class="row" style="gap:10px;margin-top:12px">
        <button class="btn primary" id="btn-save-auto">保存自动更新设置</button>
        <span class="status-line" id="save-auto-result"></span>
      </div>
      <div class="auto-status">
        <div class="auto-row"><span class="lab">上次触发</span><span id="set-lastRun">—</span></div>
        <div class="auto-row"><span class="lab">上次结果</span><span id="set-lastResult">—</span></div>
        <div class="auto-row"><span class="lab">下次定时</span><span id="set-nextRun">—</span></div>
        <div class="auto-row"><span class="lab">最近错误</span><span id="set-lastError">—</span></div>
        <div class="row mt">
          <button class="btn" id="btn-test-webhook">等待接收测试通知</button>
          <span class="status-line" id="test-webhook-result"></span>
        </div>
        <div class="muted" style="font-size:12px;margin-top:6px" id="webhook-last">最近收到：—</div>
        <p class="hint" style="margin-top:8px">在 Emby 官方 Webhooks 插件里点击该 webhook 的「测试通知」按钮，本页面会检测是否真正收到（60 秒超时）。</p>
      </div>
    </div>

    <div class="panel">
      <h3>封面配置</h3>
      <div class="cfg-wrap" style="display:flex;gap:28px;align-items:flex-start">
        <div class="cfg-left" style="flex:1;min-width:280px">
          <div class="cfg-sec">
            <div class="cfg-title">配置类型</div>
            <div class="cfg-opt"><div class="seg" id="cfg-kind">
              <button class="seg-btn active" data-group="library-single">媒体库·单图海报</button>
              <button class="seg-btn" data-group="library-wall3">媒体库·海报墙</button>
              <button class="seg-btn" data-group="collection-single">合集·单图海报</button>
            </div></div>
            <div class="cfg-hint">三套配置互相独立，切换后各自保存</div>
          </div>
          <div class="cfg-sec" id="cfg-lib-default-sec">
            <div class="cfg-title">未单独配置的媒体库默认样式</div>
            <div class="cfg-opt"><div class="pick-opts" id="cfg-lib-default-opts">
              <button class="pick-opt ${(s.styleByKind?.library || 'single') === 'single' ? 'active' : ''}" data-lib-style="single">单图海报</button>
              <button class="pick-opt ${s.styleByKind?.library === 'wall3' ? 'active' : ''}" data-lib-style="wall3">海报墙</button>
            </div></div>
            <div class="cfg-hint">默认配置（未单独设置）的媒体库使用此样式</div>
          </div>
          <div class="cfg-sec">
            <div class="cfg-title">选图依据（单图海报）</div>
            <div class="cfg-opt"><div class="pick-opts" id="cfg-pick-opts">
              <button class="pick-opt" data-global-pick="added">最新入库</button>
              <button class="pick-opt" data-global-pick="premiere">最新发行</button>
              <button class="pick-opt" data-global-pick="random">随机</button>
            </div></div>
            <div class="cfg-hint">单图海报样式按此依据挑选要展示的海报</div>
          </div>
          <div class="cfg-sec">
            <div class="cfg-title">背景模式</div>
            <div class="cfg-opt"><div class="pick-opts" id="cfg-bg-opts">
              <button class="pick-opt" data-bg="gradient">渐变色</button>
              <button class="pick-opt" data-bg="poster">海报渐变模糊</button>
            </div></div>
            <div class="row" id="cfg-bg-gradient-fields" style="gap:16px;flex-wrap:wrap;margin-top:8px">
              <label class="field"><span class="lab">背景顶部</span><input type="color" id="set-bgTop" value="${c.bgTop}"></label>
              <label class="field"><span class="lab">背景底部</span><input type="color" id="set-bgBottom" value="${c.bgBottom}"></label>
            </div>
            <div class="cfg-hint">海报模式：从展示的海报取色并模糊作为背景</div>
          </div>
          <div class="cfg-sec">
            <div class="cfg-title">字号</div>
            <div class="cfg-opt"><div class="row" style="gap:16px;flex-wrap:wrap">
              <label class="field"><span class="lab">标题字号</span><input type="number" id="set-titleSize" value="${c.titleSize}" min="18" max="480"></label>
              <label class="field"><span class="lab">副标题字号</span><input type="number" id="set-subtitleSize" value="${c.subtitleSize}" min="12" max="240"></label>
            </div></div>
            <div class="cfg-hint">按输出宽度等比缩放</div>
          </div>
          <div class="cfg-sec">
            <div class="cfg-title">颜色</div>
            <div class="cfg-opt"><div class="row" style="gap:16px;flex-wrap:wrap">
              <label class="field"><span class="lab">强调色</span><input type="color" id="set-accent" value="${c.accent}"></label>
              <label class="field"><span class="lab">标题颜色</span><input type="color" id="set-titleColor" value="${c.titleColor}"></label>
              <label class="field"><span class="lab">副标题颜色</span><input type="color" id="set-subtitleColor" value="${c.subtitleColor}"></label>
            </div></div>
            <div class="cfg-hint">标题下横线、标题与副标题文字颜色</div>
          </div>
          <div class="cfg-sec">
            <div class="cfg-title">其他</div>
            <div class="cfg-opt"><label class="row" style="gap:8px"><input type="checkbox" id="set-showCount" ${c.showCount ? 'checked' : ''}> 封面显示影片数量副标题</label></div>
            <div class="cfg-hint">如「共 18 部影片」</div>
          </div>
        </div>
        <div class="cfg-right" style="width:360px;flex-shrink:0;position:sticky;top:16px">
          <div class="lab">实时预览（当前所选类型）</div>
          <label class="field" style="margin-top:6px"><span class="lab">预览数据来源</span>
            <select id="cfg-preview-source">
              <option value="">占位图</option>
            </select>
            <span class="hint">选择后使用当前类型下的真实数据预览</span>
          </label>
          <div id="cfg-preview-wrap" style="position:relative;display:inline-block;max-width:100%">
            <img id="cfg-preview" alt="封面预览" style="width:360px;max-width:100%;height:auto;border-radius:10px;border:1px solid var(--border);background:var(--panel-2);display:block">
            <div id="cfg-preview-loading" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;background:rgba(10,15,28,0.55);border-radius:10px;color:#fff;font-size:13px">生成中…</div>
          </div>
          <div class="row mt" style="gap:10px;align-items:center;flex-wrap:wrap">
            <button class="btn" id="btn-save-cover">保存封面设置</button>
            <button class="btn primary" id="btn-save-regen">保存并重新生成当前配置封面</button>
          </div>
          <span class="status-line" id="save-cover-result"></span>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>配置与数据备份</h3>
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <button class="btn primary" id="btn-export">导出备份</button>
        <button class="btn" id="btn-import">导入备份</button>
        <input type="file" id="import-file" accept=".json,application/json" style="display:none">
        <span class="status-line" id="backup-result"></span>
      </div>
      <p class="hint" style="margin-top:8px">备份包含当前设置（含 Emby API 密钥与访问令牌，请妥善保管）、全部媒体库/合集配置和任务记录；封面图片不包含在内，导入后重新生成即可。</p>
      <h4 style="margin:16px 0 10px;font-size:14px">WebDAV 同步</h4>
      <div class="grid-2">
        <label class="field"><span class="lab">WebDAV 地址</span>
          <input type="url" id="set-webdavUrl" value="${esc(s.webdavUrl || '')}" placeholder="https://dav.example.com/dav/emby-cover-studio">
        </label>
        <label class="field"><span class="lab">用户名</span>
          <input type="text" id="set-webdavUser" value="${esc(s.webdavUser || '')}" autocomplete="off">
        </label>
        <label class="field"><span class="lab">密码</span>
          <input type="password" id="set-webdavPassword" value="${esc(s.webdavPassword || '')}" autocomplete="off">
        </label>
        <label class="field"><span class="lab">备份文件名</span>
          <input type="text" id="set-webdavFile" value="${esc(s.webdavFile || 'backup.json')}">
        </label>
      </div>
      <div class="row" style="gap:18px;margin-top:8px;flex-wrap:wrap">
        <label class="row" style="gap:6px"><input type="checkbox" id="set-webdavAuto" ${s.webdavAutoBackup ? 'checked' : ''}> 自动备份</label>
        <label class="field" style="max-width:140px"><span class="lab">间隔（小时）</span>
          <input type="number" id="set-webdavInterval" value="${s.webdavIntervalHours ?? 24}" min="1" max="720">
        </label>
      </div>
      <div class="row" style="gap:18px;margin-top:8px;flex-wrap:wrap;align-items:center">
        <span class="muted" style="font-size:12px">同步内容：</span>
        <label class="row" style="gap:6px"><input type="checkbox" id="set-webdavSyncSettings" ${s.webdavSync?.settings !== false ? 'checked' : ''}> 设置（含密钥）</label>
        <label class="row" style="gap:6px"><input type="checkbox" id="set-webdavSyncTargets" ${s.webdavSync?.targets !== false ? 'checked' : ''}> 媒体库/合集配置</label>
        <label class="row" style="gap:6px"><input type="checkbox" id="set-webdavSyncTasks" ${s.webdavSync?.tasks !== false ? 'checked' : ''}> 任务记录</label>
      </div>
      <div class="row mt" style="gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn" id="btn-webdav-save">保存设置</button>
        <button class="btn" id="btn-webdav-test">测试连接</button>
        <button class="btn primary" id="btn-webdav-backup">立即备份</button>
        <button class="btn" id="btn-webdav-restore">从 WebDAV 恢复</button>
        <span class="status-line" id="webdav-result"></span>
      </div>
      <p class="hint" style="margin-top:8px">上次备份：<span id="webdav-last">—</span>。备份包含 Emby 密钥与访问令牌，建议使用 HTTPS 地址。</p>
    </div>

    <div class="panel">
      <h3>访问令牌（可选）</h3>
      <label class="field"><span class="lab">访问令牌</span>
        <input type="password" id="set-accessToken" value="${esc(s.accessToken)}" placeholder="留空表示不启用">
        <span class="hint">启用后，访问本工具的所有接口都需要在浏览器中输入该令牌；强烈建议在公网/多人环境启用</span>
      </label>
      <div class="row" style="gap:10px">
        <button class="btn primary" id="btn-save-token">保存访问令牌</button>
        <span class="status-line" id="save-token-result"></span>
      </div>
    </div>
    `;

  function saveDraftFromDom() {
    const g = state.cfgGroup;
    state.cfgDraft[g] = {
      style: g.endsWith('-wall3') ? 'wall3' : 'single',
      pickBy: document.querySelector('#cfg-pick-opts .pick-opt.active')?.dataset.globalPick || 'added',
      cover: {
        titleSize: Number($('#set-titleSize').value),
        subtitleSize: Number($('#set-subtitleSize').value),
        bgTop: $('#set-bgTop').value,
        bgBottom: $('#set-bgBottom').value,
        accent: $('#set-accent').value,
        titleColor: $('#set-titleColor').value,
        subtitleColor: $('#set-subtitleColor').value,
        backgroundMode: document.querySelector('#cfg-bg-opts .pick-opt.active')?.dataset.bg || 'gradient',
        showCount: $('#set-showCount').checked
      }
    };
  }

  function applyDraftToDom(g) {
    const d = state.cfgDraft[g];
    if (!$('#cfg-pick-opts')) return;
    document.querySelectorAll('#cfg-pick-opts .pick-opt').forEach((b) => {
      b.classList.toggle('active', b.dataset.globalPick === d.pickBy);
    });
    $('#set-titleSize').value = d.cover.titleSize;
    $('#set-subtitleSize').value = d.cover.subtitleSize;
    $('#set-bgTop').value = d.cover.bgTop;
    $('#set-bgBottom').value = d.cover.bgBottom;
    $('#set-accent').value = d.cover.accent;
    $('#set-titleColor').value = d.cover.titleColor;
    $('#set-subtitleColor').value = d.cover.subtitleColor;
    document.querySelectorAll('#cfg-bg-opts .pick-opt').forEach((b) => {
      b.classList.toggle('active', b.dataset.bg === (d.cover.backgroundMode || 'gradient'));
    });
    $('#set-showCount').checked = d.cover.showCount !== false;
    syncBgFields();
    const dsf = $('#cfg-lib-default-sec');
    if (dsf) dsf.style.display = g.startsWith('library') ? '' : 'none';
    updatePreviewSourceOptions(g.startsWith('library') ? 'library' : 'collection');
    document.querySelectorAll('#cfg-kind .seg-btn').forEach((x) => {
      x.classList.toggle('active', x.dataset.group === g);
    });
  }

  function updatePreviewSourceOptions(kind) {
    const sel = $('#cfg-preview-source');
    if (!sel) return;
    const prev = sel.value;
    const list = (state.targets || [])
      .filter((t) => !t.missing && t.kind === kind)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    sel.innerHTML = '<option value="">占位图</option>' + list.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
    sel.value = prev && list.some((t) => t.id === prev) ? prev : '';
  }

  document.querySelectorAll('#cfg-kind .seg-btn').forEach((b) => {
    b.onclick = () => {
      saveDraftFromDom();
      state.cfgGroup = b.dataset.group;
      applyDraftToDom(state.cfgGroup);
      refreshCfgPreview();
    };
  });

  applyDraftToDom(state.cfgGroup);

  let cfgPreviewTimer = null;
  function refreshCfgPreview() {
    const group = state.cfgGroup || 'library-single';
    const kind = group.startsWith('library') ? 'library' : 'collection';
    const style = group.endsWith('-wall3') ? 'wall3' : 'single';
    const size = kind === 'library' ? 'thumb' : 'poster'; // 尺寸强制：媒体库 16:9，合集 2:3
    const q = new URLSearchParams({
      style,
      size,
      backgroundMode: document.querySelector('#cfg-bg-opts .pick-opt.active')?.dataset.bg || 'gradient',
      title: kind === 'library' ? '媒体库' : '合集',
      showCount: $('#set-showCount').checked ? '1' : '0',
      titleSize: $('#set-titleSize').value,
      subtitleSize: $('#set-subtitleSize').value,
      bgTop: $('#set-bgTop').value,
      bgBottom: $('#set-bgBottom').value,
      accent: $('#set-accent').value,
      titleColor: $('#set-titleColor').value,
      subtitleColor: $('#set-subtitleColor').value,
    });
    const source = $('#cfg-preview-source')?.value || '';
    if (source) {
      q.set('targetId', source);
      q.set('pickBy', document.querySelector('#cfg-pick-opts .pick-opt.active')?.dataset.globalPick || 'added');
    }
    const img = $('#cfg-preview');
    if (img) {
      const loading = $('#cfg-preview-loading');
      if (loading) loading.style.display = 'flex';
      const url = `/api/demo-preview?${q.toString()}&t=${Date.now()}`;
      const pre = new Image();
      pre.onload = () => {
        img.style.width = kind === 'collection' ? '180px' : '360px';
        img.src = url;
        if (loading) loading.style.display = 'none';
      };
      pre.onerror = () => {
        if (loading) loading.style.display = 'none';
      };
      pre.src = url;
    }
  }
  ['#cfg-preview-source', '#set-titleSize', '#set-subtitleSize', '#set-showCount', '#set-bgTop', '#set-bgBottom', '#set-accent', '#set-titleColor', '#set-subtitleColor'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      clearTimeout(cfgPreviewTimer);
      cfgPreviewTimer = setTimeout(refreshCfgPreview, 350);
    });
  });
  document.querySelectorAll('#cfg-pick-opts .pick-opt').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#cfg-pick-opts .pick-opt').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  document.querySelectorAll('#cfg-bg-opts .pick-opt').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#cfg-bg-opts .pick-opt').forEach((x) => x.classList.toggle('active', x === b));
      syncBgFields();
      clearTimeout(cfgPreviewTimer);
      cfgPreviewTimer = setTimeout(refreshCfgPreview, 200);
    };
  });
  document.querySelectorAll('#cfg-lib-default-opts .pick-opt').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#cfg-lib-default-opts .pick-opt').forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  refreshCfgPreview();

  $('#btn-test').onclick = async () => {
    const el = $('#test-result');
    el.className = 'status-line';
    el.textContent = '测试中…';
    try {
      const r = await api('/api/emby/test', {
        method: 'POST',
        body: { embyUrl: $('#set-embyUrl').value, embyApiKey: $('#set-embyApiKey').value }
      });
      el.className = 'status-line ok';
      el.textContent = `连接成功：${r.serverName}（版本 ${r.version || '未知'}）`;
    } catch (e) {
      el.className = 'status-line err';
      el.textContent = `连接失败：${e.message}`;
    }
  };

  $('#copy-wh').onclick = () => {
    navigator.clipboard.writeText($('#set-webhook-url').textContent.trim());
    toast('Webhook 地址已复制');
  };

  function updateAutoStatus() {
    const st = state.status || {};
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    if (st.lastRun) setText('set-lastRun', `${fmtTime(st.lastRun)}（${st.lastReason || '未知原因'}）`);
    else setText('set-lastRun', '从未触发');
    const c = st.counts || {};
    const parts = [];
    if (c.updated) parts.push(`更新 ${c.updated} 个`);
    if (c.unchanged) parts.push(`无变化 ${c.unchanged} 个`);
    if (c.failed) parts.push(`失败 ${c.failed} 个`);
    setText('set-lastResult', parts.length ? parts.join('，') : (st.lastRun ? '完成' : '—'));
    setText('set-nextRun', st.nextRun ? fmtTime(st.nextRun) : '—');
    const errEl = document.getElementById('set-lastError');
    if (errEl) {
      errEl.textContent = st.lastError || '无';
      errEl.className = st.lastError ? 'err-text' : 'ok-text';
    }
  }

  let webhookTestTimer = null;
  function updateWebhookLast(wh) {
    const el = document.getElementById('webhook-last');
    if (!el) return;
    el.textContent = wh?.lastEventAt
      ? `最近收到：${wh.lastEvent || '(未知事件)'} · ${fmtTime(wh.lastEventAt)}`
      : '最近收到：—';
  }
  updateWebhookLast(state.status?.webhook);

  $('#btn-test-webhook').onclick = async () => {
    const btn = $('#btn-test-webhook');
    const el = $('#test-webhook-result');
    clearInterval(webhookTestTimer);
    webhookTestTimer = null;
    try {
      await api('/api/webhook/test/arm', { method: 'POST', body: {} });
    } catch (e) {
      el.className = 'status-line err';
      el.textContent = `启动失败：${e.message}`;
      return;
    }
    btn.disabled = true;
    el.className = 'status-line';
    el.textContent = '等待接收中…请到 Emby Webhooks 插件点击「测试通知」（60 秒超时）';
    let waited = 0;
    webhookTestTimer = setInterval(async () => {
      waited += 2000;
      const st = await loadStatus().catch(() => null);
      const t = st?.webhook?.test;
      if (t && !t.armed && t.result) {
        clearInterval(webhookTestTimer);
        webhookTestTimer = null;
        btn.disabled = false;
        el.className = 'status-line ok';
        el.textContent = `已收到测试通知（事件：${t.result.event} · ${fmtTime(t.result.at)}）`;
        updateWebhookLast(st.webhook);
        toast('已收到 Emby 测试通知', 'ok');
        return;
      }
      if (waited >= 60000) {
        clearInterval(webhookTestTimer);
        webhookTestTimer = null;
        btn.disabled = false;
        el.className = 'status-line err';
        el.textContent = '60 秒内未收到，请确认插件已配置此地址并点击了「测试通知」';
      }
    }, 2000);
    state.timers.push(webhookTestTimer);
  };

  async function refreshAutoStatus() {
    await loadStatus();
    updateAutoStatus();
  }
  const autoTimer = setInterval(refreshAutoStatus, 5000);
  state.timers.push(autoTimer);
  updateAutoStatus();

  function syncBgFields() {
    const poster = document.querySelector('#cfg-bg-opts .pick-opt.active')?.dataset.bg === 'poster';
    const wrap = $('#cfg-bg-gradient-fields');
    if (wrap) wrap.style.display = poster ? 'none' : '';
  }
  syncBgFields();

  function collectCoverBody() {
    saveDraftFromDom();
    return {
      styleByKind: { library: document.querySelector('#cfg-lib-default-opts .pick-opt.active')?.dataset.libStyle || 'single', collection: 'single' },
      defaultPickByByStyle: {
        'library-single': state.cfgDraft['library-single'].pickBy,
        'library-wall3': state.cfgDraft['library-wall3'].pickBy,
        'collection-single': state.cfgDraft['collection-single'].pickBy
      },
      coverByStyle: {
        'library-single': { ...state.cfgDraft['library-single'].cover, width: 1600, height: 900 },
        'library-wall3': { ...state.cfgDraft['library-wall3'].cover, width: 1600, height: 900 },
        'collection-single': { ...state.cfgDraft['collection-single'].cover, width: 1000, height: 1500 }
      }
    };
  }

  async function saveSection(patch, resultId, successMsg = '已保存 ✅') {
    const el = document.getElementById(resultId);
    if (el) {
      el.className = 'status-line';
      el.textContent = '保存中…';
    }
    try {
      const r = await api('/api/settings', { method: 'PUT', body: patch });
      state.settings = r.settings;
      await loadStatus();
      if (el) {
        el.className = 'status-line ok';
        el.textContent = successMsg;
      }
      return true;
    } catch (e) {
      if (el) {
        el.className = 'status-line err';
        el.textContent = `保存失败：${e.message}`;
      }
      return false;
    }
  }

  async function saveSettings() {
    const body = collectCoverBody();
    const r = await api('/api/settings', { method: 'PUT', body });
    state.settings = r.settings;
    await loadStatus();
    return r.settings;
  }

  $('#btn-save-emby').onclick = () => saveSection({
    embyUrl: $('#set-embyUrl').value.trim(),
    embyApiKey: $('#set-embyApiKey').value.trim()
  }, 'save-emby-result', '连接设置已保存 ✅');

  $('#btn-save-auto').onclick = () => saveSection({
    cron: $('#set-cron').value.trim(),
    webhookDebounceMs: Number($('#set-webhookDebounceMs').value),
    autoEnableNew: $('#set-autoEnableNew').checked,
    syncOnStart: $('#set-syncOnStart').checked
  }, 'save-auto-result', '自动更新设置已保存 ✅');

  $('#btn-save-token').onclick = () => saveSection({
    accessToken: $('#set-accessToken').value.trim()
  }, 'save-token-result', '访问令牌已保存 ✅');

  $('#btn-save-cover').onclick = () => saveSection(collectCoverBody(), 'save-cover-result', '封面设置已保存 ✅（重新生成后生效）');

  $('#btn-save-regen').onclick = async () => {
    const btn = $('#btn-save-regen');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 保存中…';
    try {
      await saveSettings();
      const group = state.cfgGroup || 'library-single';
      const kind = group.startsWith('library') ? 'library' : 'collection';
      const style = group.endsWith('-wall3') ? 'wall3' : 'single';
      const label = `${kind === 'library' ? '媒体库' : '合集'}·${style === 'wall3' ? '海报墙' : '单图海报'}`;
      toast(`设置已保存，开始重新生成${label}封面…`, 'ok');
      showSyncProgress();
      api('/api/sync', { method: 'POST', body: { force: true, onlyKind: kind, onlyStyle: style } }).then(() => {}).catch(() => {});
    } catch (e) {
      toast(`保存失败：${e.message}`, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存并重新生成当前配置封面';
    }
  };

  $('#btn-export').onclick = async () => {
    const el = $('#backup-result');
    el.className = 'status-line';
    el.textContent = '正在导出…';
    try {
      const headers = {};
      if (state.token) headers['x-access-token'] = state.token;
      const res = await fetch('/api/export', { headers });
      if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`);
      const blob = await res.blob();
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const name = `emby-cover-studio-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      el.className = 'status-line ok';
      el.textContent = `已导出 ${name} ✅`;
      toast('备份已导出', 'ok');
    } catch (e) {
      el.className = 'status-line err';
      el.textContent = e.message;
    }
  };

  $('#btn-import').onclick = () => $('#import-file').click();
  $('#import-file').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    const el = $('#backup-result');
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      el.className = 'status-line err';
      el.textContent = '备份文件不是有效的 JSON';
      e.target.value = '';
      return;
    }
    if (!data || data.version !== 1 || !data.settings || !data.targets) {
      el.className = 'status-line err';
      el.textContent = '备份文件格式不正确或版本不匹配';
      e.target.value = '';
      return;
    }
    if (!window.confirm('导入将覆盖当前全部配置与数据（设置、媒体库/合集、任务记录），确定继续吗？')) {
      e.target.value = '';
      return;
    }
    el.className = 'status-line';
    el.textContent = '正在导入…';
    try {
      const r = await api('/api/import', { method: 'POST', body: { data } });
      el.className = 'status-line ok';
      el.textContent = `导入成功（${r.importedTargets} 个媒体库/合集）`;
      toast('导入成功，正在刷新…', 'ok');
      e.target.value = '';
      renderSettings();
      loadStatus();
    } catch (err) {
      el.className = 'status-line err';
      el.textContent = `导入失败：${err.message}`;
      e.target.value = '';
    }
  };

  const webdavEl = $('#webdav-result');
  const webdavStatus = (cls, text) => {
    webdavEl.className = `status-line ${cls}`;
    webdavEl.textContent = text;
  };
  function webdavBody() {
    return {
      webdavUrl: $('#set-webdavUrl').value.trim(),
      webdavUser: $('#set-webdavUser').value.trim(),
      webdavPassword: $('#set-webdavPassword').value,
      webdavFile: $('#set-webdavFile').value.trim() || 'backup.json',
      webdavAutoBackup: $('#set-webdavAuto').checked,
      webdavIntervalHours: Number($('#set-webdavInterval').value) || 24,
      webdavSync: {
        settings: $('#set-webdavSyncSettings').checked,
        targets: $('#set-webdavSyncTargets').checked,
        tasks: $('#set-webdavSyncTasks').checked
      }
    };
  }
  function updateWebdavLast() {
    const el = document.getElementById('webdav-last');
    if (el) el.textContent = state.settings?.webdavLastBackup ? fmtTime(state.settings.webdavLastBackup) : '从未备份';
  }
  updateWebdavLast();

  const saveWebdavSettings = async () => {
    const r = await api('/api/settings', { method: 'PUT', body: webdavBody() });
    state.settings = r.settings;
    return r.settings;
  };

  $('#btn-webdav-save').onclick = async () => {
    try {
      await saveWebdavSettings();
      webdavStatus('ok', 'WebDAV 设置已保存');
      toast('WebDAV 设置已保存', 'ok');
    } catch (e) {
      webdavStatus('err', `保存失败：${e.message}`);
    }
  };

  $('#btn-webdav-test').onclick = async () => {
    webdavStatus('', '测试中…');
    try {
      await saveWebdavSettings();
      await api('/api/webdav/test', { method: 'POST', body: {} });
      webdavStatus('ok', '连接正常');
      toast('WebDAV 连接正常', 'ok');
    } catch (e) {
      webdavStatus('err', `连接失败：${e.message}`);
    }
  };

  $('#btn-webdav-backup').onclick = async () => {
    webdavStatus('', '正在备份…');
    try {
      await saveWebdavSettings();
      const r = await api('/api/webdav/backup', { method: 'POST', body: {} });
      if (state.settings) state.settings.webdavLastBackup = new Date().toISOString();
      updateWebdavLast();
      webdavStatus('ok', `已备份到 ${r.url}`);
      toast('WebDAV 备份完成', 'ok');
    } catch (e) {
      webdavStatus('err', `备份失败：${e.message}`);
    }
  };

  $('#btn-webdav-restore').onclick = async () => {
    if (!window.confirm('将从 WebDAV 下载备份并覆盖当前全部配置与数据（设置、媒体库/合集、任务记录），确定继续吗？')) return;
    webdavStatus('', '正在从 WebDAV 恢复…');
    try {
      await saveWebdavSettings();
      const r = await api('/api/webdav/restore', { method: 'POST', body: {} });
      webdavStatus('ok', `已恢复（${r.importedTargets} 个媒体库/合集）`);
      toast('已从 WebDAV 恢复备份', 'ok');
      renderSettings();
      loadStatus();
    } catch (e) {
      webdavStatus('err', `恢复失败：${e.message}`);
    }
  };

}

// ---------- 日志 ----------
async function renderLogs() {
  main.innerHTML = `
    <div class="page-title">运行记录</div>
    <div class="page-desc">任务记录与系统日志，供需要时排查</div>
    <div class="panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin-bottom:0">任务记录</h3>
        <button class="btn sm" id="btn-refresh-tasks">刷新</button>
      </div>
      <div class="scroll-panel">
        <table class="table" id="task-table"><thead></thead><tbody><tr><td colspan="6" class="empty">加载中…</td></tr></tbody></table>
      </div>
    </div>
    <div class="panel" style="padding:10px 14px">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin-bottom:0">运行日志</h3>
        <div class="row" style="gap:10px">
          <span class="muted" id="log-count"></span>
          <button class="btn sm" id="btn-refresh-logs">刷新</button>
        </div>
      </div>
      <div class="scroll-panel" style="max-height:460px">
        <table class="table" id="log-table"><thead></thead><tbody><tr><td colspan="3" class="empty">加载中…</td></tr></tbody></table>
      </div>
    </div>`;

  const TYPE_LABEL = { single: '单张生成', batch: '批量更新', sync: '全量同步', precise: '精准更新' };

  const taskTable = createDataTable({
    el: $('#task-table'),
    emptyText: '暂无任务记录',
    fetchData: () => api('/api/tasks').then((r) => r.tasks || []),
    initialSort: { key: 'seq', dir: -1 },
    columns: [
      { key: 'seq', label: '序号', width: '56px', sortable: true, render: (t) => `<td class="muted">${t.seq ?? ''}</td>` },
      { key: 'name', label: '名称', sortable: true, render: (t) => `<td>${esc(t.name)}</td>` },
      {
        key: 'type', label: '类型', width: '104px', sortable: true,
        filterOpts: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
        render: (t) => `<td>${esc(TYPE_LABEL[t.type] || t.type || '—')}</td>`
      },
      { key: 'ts', label: '时间', width: '170px', sortable: true, render: (t) => `<td class="muted" style="font-size:12px">${fmtTime(t.ts)}</td>` },
      {
        key: 'trigger', label: '触发方式', width: '116px', sortable: true,
        filterOpts: Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label })),
        render: (t) => `<td><span class="badge trig-${esc(t.trigger || 'manual')}">${esc(TRIGGER_LABEL[t.trigger] || t.trigger || '—')}</span></td>`
      },
      {
        key: 'status', label: '结果', width: '124px', sortable: true,
        filterOpts: [
          { value: 'success', label: '成功' },
          { value: 'failed', label: '失败' },
          { value: 'cancelled', label: '已取消' },
          { value: 'paused', label: '已暂停' }
        ],
        render: (t) => {
          const status = t.status === 'success'
            ? '<span class="badge ok-badge">成功</span>'
            : t.status === 'failed'
              ? '<span class="badge err-badge">失败</span>'
              : t.status === 'cancelled'
                ? '<span class="badge gray-badge">已取消</span>'
                : '<span class="badge warn-badge">已暂停</span>';
          const detail = [t.updated ? `更新 ${t.updated}` : '', t.unchanged ? `无变化 ${t.unchanged}` : '', t.failed ? `失败 ${t.failed}` : ''].filter(Boolean).join('，');
          const errText = t.status === 'failed' && t.error ? `<div class="task-err" title="${esc(t.error)}">${esc(t.error)}</div>` : '';
          return `<td>${status}${detail ? `<div class="muted" style="font-size:11px">${esc(detail)}</div>` : ''}${errText}</td>`;
        }
      }
    ]
  });
  taskTable.render();

  const logTable = createDataTable({
    el: $('#log-table'),
    emptyText: '暂无日志',
    fetchData: () => api('/api/logs').then((r) => {
      state.logs = r.logs || [];
      $('#log-count').textContent = `共 ${state.logs.length} 条`;
      return state.logs;
    }),
    initialSort: { key: 'ts', dir: -1 },
    columns: [
      { key: 'ts', label: '时间', width: '170px', sortable: true, render: (l) => `<td class="muted" style="font-size:12px">${fmtTime(l.ts)}</td>` },
      {
        key: 'level', label: '级别', width: '70px', sortable: true,
        filterOpts: [
          { value: 'info', label: 'info' },
          { value: 'warn', label: 'warn' },
          { value: 'error', label: 'error' }
        ],
        render: (l) => `<td><span class="lvl-${esc(l.level)}">${esc(l.level)}</span></td>`
      },
      { key: 'message', label: '内容', render: (l) => `<td>${esc(l.message)}</td>` }
    ]
  });
  logTable.render();
  $('#btn-refresh-tasks').onclick = () => taskTable.refresh();
  $('#btn-refresh-logs').onclick = () => logTable.refresh();
  await taskTable.refresh();
  await logTable.refresh();
}

// 启动
nav();
loadStatus();
setInterval(() => {
  loadStatus().then((s) => {
    if (state.page === 'dashboard' && s && !s.running) {
      // 概览页在同步结束后自动刷新一次
      const prevRunning = state.status?.running;
      if (prevRunning && !s.running) renderDashboard();
    }
    state.status = s;
  });
}, 15000);
