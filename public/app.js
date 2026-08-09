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
  filter: 'all',
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

  main.innerHTML = `
    <div class="page-title">概览</div>
    <div class="page-desc">封面工坊运行状态一览</div>
    <div class="cards">
      <div class="card"><div class="label">Emby 服务器</div><div class="value" style="font-size:15px">${embyState}</div><div class="sub">${emby.serverName ? esc(emby.serverName) + ' v' + esc(emby.version || '') : ''}</div></div>
      <div class="card"><div class="label">监控中的合集</div><div class="value">${s.stats?.enabled ?? 0}<span style="font-size:13px;color:var(--muted)"> / ${s.stats?.targets ?? 0}</span></div><div class="sub">已生成封面 ${s.stats?.generated ?? 0} 个</div></div>
      <div class="card"><div class="label">封面生成张数</div><div class="value">${s.stats?.coversGenerated ?? 0}</div><div class="sub">累计生成（含重新生成）</div></div>
      <div class="card"><div class="label">任务触发次数</div><div class="value">${s.stats?.taskCount ?? 0}</div><div class="sub">同步 / 更新 / 批量等</div></div>
      <div class="card"><div class="label">最近同步</div><div class="value" style="font-size:15px">${fmtTime(s.lastRun)}</div><div class="sub">${esc(s.lastReason || '')}${s.lastError ? ' · 有错误' : ''}</div></div>
      <div class="card"><div class="label">定时任务</div><div class="value" style="font-size:15px">${esc(s.cron || '—')}</div><div class="sub">${s.webhookPending ? 'Webhook 待执行' : '等待触发'}</div></div>
    </div>
    ${s.font?.hint ? `<div class="status-line err" style="margin-bottom:14px">⚠ ${esc(s.font.hint)}（当前使用字体：${esc(s.font.fontFamily)}）</div>` : ''}
    <div class="panel">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h3 style="margin-bottom:0">任务记录</h3>
        <button class="btn sm" id="btn-refresh-tasks">刷新</button>
      </div>
      <table class="table">
        <thead><tr><th style="width:56px">序号</th><th>名称</th><th style="width:88px">类型</th><th style="width:170px">时间</th><th style="width:96px">触发方式</th><th style="width:110px">结果</th></tr></thead>
        <tbody id="task-body"><tr><td colspan="6" class="empty">加载中…</td></tr></tbody>
      </table>
    </div>`;

  const TYPE_LABEL = { single: '单张生成', batch: '批量更新', sync: '全量同步', precise: '精准更新' };
  const TRIGGER_LABEL = { manual: '手动', batch: '批量操作', scheduler: '定时任务', webhook: 'Webhook', startup: '服务启动', resume: '继续任务', enable: '启用合集' };

  async function drawTasks() {
    const tb = $('#task-body');
    if (!tb) return;
    let tasks = [];
    try {
      tasks = (await api('/api/tasks')).tasks || [];
    } catch {
      tb.innerHTML = '<tr><td colspan="6" class="empty">加载失败</td></tr>';
      return;
    }
    tb.innerHTML = tasks.map((t, i) => {
      const status = t.status === 'success'
        ? '<span class="badge ok-badge">成功</span>'
        : t.status === 'failed'
          ? '<span class="badge err-badge">失败</span>'
          : t.status === 'cancelled'
            ? '<span class="badge gray-badge">已取消</span>'
            : '<span class="badge warn-badge">已暂停</span>';
      const detail = [t.updated ? `更新 ${t.updated}` : '', t.unchanged ? `无变化 ${t.unchanged}` : '', t.failed ? `失败 ${t.failed}` : ''].filter(Boolean).join('，');
      const errText = t.status === 'failed' && t.error ? `<div class="task-err" title="${esc(t.error)}">${esc(t.error)}</div>` : '';
      const trigLabel = TRIGGER_LABEL[t.trigger] || t.trigger || '—';
      return `
        <tr>
          <td class="muted">${t.seq ?? (i + 1)}</td>
          <td>${esc(t.name)}</td>
          <td>${esc(TYPE_LABEL[t.type] || t.type || '—')}</td>
          <td class="muted" style="font-size:12px">${fmtTime(t.ts)}</td>
          <td><span class="badge trig-${esc(t.trigger || 'manual')}">${esc(trigLabel)}</span></td>
          <td>${status}${detail ? `<div class="muted" style="font-size:11px">${esc(detail)}</div>` : ''}${errText}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty">暂无任务记录</td></tr>';
  }

  $('#btn-refresh-tasks').onclick = async () => {
    const btn = $('#btn-refresh-tasks');
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> 刷新中…';
    try {
      await drawTasks();
      const tb = $('#task-body');
      if (tb) {
        tb.classList.remove('task-flash');
        void tb.offsetWidth; // 重置动画，保证每次点击都闪烁
        tb.classList.add('task-flash');
      }
    } finally {
      btn.innerHTML = original;
      btn.disabled = false;
    }
  };
  await drawTasks();
}

// ---------- 封面管理 ----------
async function renderTargets() {
  main.innerHTML = `
    <div class="page-title">封面管理</div>
    <div class="page-desc">管理 Emby 媒体库与合集的封面生成，单选可单独配置，支持多选批量操作</div>
    <div class="chips" id="chips">
      <button class="chip ${state.filter === 'all' ? 'active' : ''}" data-f="all">全部</button>
      <button class="chip ${state.filter === 'library' ? 'active' : ''}" data-f="library">媒体库</button>
      <button class="chip ${state.filter === 'collection' ? 'active' : ''}" data-f="collection">合集</button>
      <button class="chip ${state.filter === 'enabled' ? 'active' : ''}" data-f="enabled">监控中</button>
      <button class="chip ${state.filter === 'locked' ? 'active' : ''}" data-f="locked">已锁定</button>
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
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn sm" id="batch-enable" disabled>取消锁定</button>
          <button class="btn sm" id="batch-disable" disabled>锁定</button>
          <button class="btn sm primary" id="batch-gen" disabled>更新封面</button>
        </div>
      </div>
    </div>
    <div class="tlist" id="target-list"><div class="empty">加载中…</div></div>`;

  if (!state.styles) {
    try {
      state.styles = (await api('/api/styles'));
    } catch {
      state.styles = { styles: [{ id: 'single', name: '单图海报' }], sizes: [{ id: 'poster', label: '海报 2:3' }, { id: 'thumb', label: '缩略图 16:9' }] };
    }
  }
  document.querySelectorAll('#chips .chip').forEach((c) => {
    c.onclick = () => {
      state.filter = c.dataset.f;
      document.querySelectorAll('#chips .chip').forEach((x) => x.classList.toggle('active', x === c));
      state.selected.clear();
      drawTargets();
    };
  });

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
  const pick = pend ? pend.pickBy : (t.pickBy || state.styles?.defaultPickBy || 'added');
  const manualName = pend ? pend.manualItemName : (t.manualItemName || '');
  const locked = Boolean(t.locked);
  // 样式：媒体库可选单图/海报墙，合集仅单图；顺序为样式在前、选图依据在后
  const styleOpts = `<option value="single" ${style === 'single' ? 'selected' : ''}>单图海报</option>${isLib ? `<option value="wall3" ${style === 'wall3' ? 'selected' : ''}>海报墙</option>` : ''}`;
  const manualOpt = style === 'single' ? `<option value="manual" ${pick === 'manual' ? 'selected' : ''}>手动选择</option>` : '';
  const pickOpts = `<option value="added" ${pick === 'added' ? 'selected' : ''}>最新入库</option><option value="premiere" ${pick === 'premiere' ? 'selected' : ''}>最新发行</option>${manualOpt}`;
  const manualBlock = style === 'single' && pick === 'manual' ? `
    <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
      <span class="muted" style="font-size:12px">已选：${esc(manualName || '未选择')}</span>
      <button class="btn sm" data-pick-manual="${esc(t.id)}">选择封面影片</button>
    </div>` : '';
  const actions = locked
    ? `<button class="btn sm" data-unlock="${esc(t.id)}">取消锁定</button><button class="btn sm ghost" data-cancel-cfg="${esc(t.id)}">取消</button><span class="muted" style="font-size:11px">已锁定，需先取消锁定才能修改</span>`
    : `<button class="btn sm" data-save-cfg="${esc(t.id)}" data-lock="0">保存</button><button class="btn sm primary" data-save-cfg="${esc(t.id)}" data-lock="1">保存并锁定</button><button class="btn sm" data-lock-only="${esc(t.id)}">锁定</button><button class="btn sm ghost" data-cancel-cfg="${esc(t.id)}">取消</button>`;
  return `
    <div class="pick-config" data-pick-box="${esc(t.id)}" style="display:none;margin-top:8px">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        <span class="muted" style="font-size:12px">封面样式</span>
        <select data-cfg-style="${esc(t.id)}" ${locked ? 'disabled' : ''} style="width:150px;padding:5px 8px;font-size:12px">${styleOpts}</select>
      </div>
      <div class="row" style="gap:8px;margin-top:6px;flex-wrap:wrap;align-items:center">
        <span class="muted" style="font-size:12px">选图依据</span>
        <select data-cfg-pick="${esc(t.id)}" ${locked ? 'disabled' : ''} style="width:150px;padding:5px 8px;font-size:12px">${pickOpts}</select>
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
  state.pendingCfg = {
    id,
    style: key === 'style' ? value : (cur?.style || t.template || state.styles?.styleByKind?.[t.kind] || 'single'),
    pickBy: key === 'pickBy' ? value : (cur?.pickBy || t.pickBy || state.styles?.defaultPickBy || 'added'),
    manualItemId: cur?.manualItemId || t.manualItemId || '',
    manualItemName: cur?.manualItemName || t.manualItemName || ''
  };
  drawTargets();
}

function hasCfgChanges(t, cur) {
  if (!cur) return false;
  const curStyle = t.template || state.styles?.styleByKind?.[t.kind] || 'single';
  const curPick = t.pickBy || state.styles?.defaultPickBy || 'added';
  if (cur.style !== curStyle) return true;
  if (cur.pickBy !== curPick) return true;
  if (cur.pickBy === 'manual' && cur.manualItemId !== (t.manualItemId || '')) return true;
  return false;
}

function drawTargets() {
  const f = state.filter;
  const list = state.targets.filter((t) => {
    if (f === 'library') return t.kind === 'library';
    if (f === 'collection') return t.kind === 'collection';
    if (f === 'enabled') return !t.locked;
    if (f === 'locked') return t.locked;
    return true;
  }).sort((a, b) => ((a.kind === b.kind) ? 0 : (a.kind === 'library' ? -1 : 1)) || a.name.localeCompare(b.name, 'zh-CN'));
  const box = $('#target-list');
  if (!list.length) {
    box.innerHTML = '<div class="empty">没有符合条件的合集</div>';
    return;
  }
  box.innerHTML = list.map((t) => {
    const kind = t.kind === 'library' ? '<span class="badge lib">媒体库</span>' : '<span class="badge col">合集</span>';
    const thumbStyle = t.kind === 'library' ? 'width:96px;height:54px' : 'width:56px;height:84px';
    const thumb = t.coverUrl
      ? `<img class="thumb" style="${thumbStyle}" src="${esc(t.coverUrl)}?v=${encodeURIComponent(t.lastGeneratedAt || Date.now())}" alt="" title="点击预览" data-preview="${esc(t.id)}">`
      : `<div class="thumb" title="点击预览" data-preview="${esc(t.id)}" style="display:flex;align-items:center;justify-content:center;font-size:22px;${thumbStyle}">🎬</div>`;
    const pickBy = t.pickBy || state.styles?.defaultPickBy || 'added';
    const pickLabel = pickBy === 'premiere' ? '最新发行' : pickBy === 'manual' ? '手动选择' : '最新入库';
    const isBoxsetsLib = t.kind === 'library' && (t.collectionType === 'boxsets' || t.collectionType === 'collections');
    const countText = isBoxsetsLib ? `共 ${t.itemCount || 0} 合集` : `${t.itemCount || 0} 部影片`;
    // 仅单图海报显示海报来源，海报墙样式不显示
    const effStyle = t.kind === 'collection' ? 'single' : (t.template || state.styles?.styleByKind?.[t.kind] || 'single');
    const sourceLine = effStyle === 'single' && t.posterSource ? `<div class="meta">海报来源：${esc(t.posterSource)}</div>` : '';
    const status = t.lastError
      ? `<div class="err">⚠ ${esc(t.lastError)}</div>`
      : `<div class="meta">${fmtTime(t.lastGeneratedAt)} 生成 · ${pickLabel} · ${countText}</div>${sourceLine}`;
    const cfg = configHtml(t);
    return `
      <div class="trow ${t.missing ? 'missing' : ''}">
        <input type="checkbox" class="tick" data-id="${esc(t.id)}" ${state.selected.has(t.id) ? 'checked' : ''}>
        ${thumb}
        <div class="info">
          <div class="name">${esc(t.name)} ${kind}${t.locked ? '<span class="badge warn-badge">已锁定</span>' : ''}${t.missing ? '<span class="badge gray">已删除</span>' : ''}</div>
          ${status}
          ${cfg}
        </div>
        <div class="actions">
          <button class="btn sm primary" data-act="gen" data-id="${esc(t.id)}" ${t.locked ? 'disabled title="已锁定，需先取消锁定"' : ''}>更新</button>
        </div>
      </div>`;
  }).join('');

  box.querySelectorAll('input.tick').forEach((el) => {
    el.onchange = () => {
      if (el.checked) state.selected.add(el.dataset.id);
      else state.selected.delete(el.dataset.id);
      updateBatchUI();
    };
  });

  box.querySelectorAll('select[data-cfg-style]').forEach((el) => {
    el.onchange = () => setPendingField(el.dataset.cfgStyle, 'style', el.value);
  });

  box.querySelectorAll('select[data-cfg-pick]').forEach((el) => {
    el.onchange = () => setPendingField(el.dataset.cfgPick, 'pickBy', el.value);
  });

  box.querySelectorAll('button[data-pick-manual]').forEach((el) => {
    el.onclick = () => openItemPicker(el.dataset.pickManual);
  });

  box.querySelectorAll('button[data-save-cfg]').forEach((el) => {
    el.onclick = async () => {
      const id = el.dataset.saveCfg;
      const t = state.targets.find((x) => x.id === id);
      if (!t) return;
      const cur = state.pendingCfg && state.pendingCfg.id === id ? state.pendingCfg : null;
      const style = cur?.style || t.template || state.styles?.styleByKind?.[t.kind] || 'single';
      let pick = cur?.pickBy || t.pickBy || state.styles?.defaultPickBy || 'added';
      if (style !== 'single') pick = 'added'; // 海报墙样式不支持手动选择
      const withLock = el.dataset.lock === '1';
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
            toast(withLock ? '封面已按新配置生成并锁定 ✅' : '封面已按新配置更新 ✅', 'ok');
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
        state.selected.clear();
        toast('已锁定（停止监控）', 'ok');
        refreshTargets();
      } catch (e) {
        toast(e.message, 'err');
      }
    };
  });

  box.querySelectorAll('button[data-cancel-cfg]').forEach((el) => {
    el.onclick = () => {
      state.pendingCfg = null;
      state.selected.clear();
      refreshTargets();
      toast('已取消修改并取消选择', 'info');
    };
  });

  box.querySelectorAll('button[data-unlock]').forEach((el) => {
    el.onclick = async () => {
      try {
        await api(`/api/targets/${el.dataset.unlock}`, { method: 'PUT', body: { locked: false } });
        state.pendingCfg = null;
        state.selected.clear();
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
      el.innerHTML = '<span class="spinner"></span>';
      try {
        const r = await api(`/api/targets/${el.dataset.id}/generate`, { method: 'POST', body: {} });
        toast('封面已重新生成并上传 ✅', 'ok');
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
  ['batch-enable', 'batch-disable', 'batch-gen'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = n === 0;
  });
  const all = document.querySelectorAll('#target-list input.tick');
  const selAll = $('#sel-all');
  if (selAll && all.length) {
    selAll.checked = all.length === document.querySelectorAll('#target-list input.tick:checked').length;
    selAll.disabled = all.length === 0;
  }
  if (n !== 1) state.pendingCfg = null;
  else if (state.pendingCfg && !state.selected.has(state.pendingCfg.id)) state.pendingCfg = null;
  document.querySelectorAll('.pick-config').forEach((el) => {
    el.style.display = (n === 1 && state.selected.has(el.dataset.pickBox)) ? '' : 'none';
  });
}

function bindBatch() {
  $('#sel-all').onchange = () => {
    const checked = $('#sel-all').checked;
    document.querySelectorAll('#target-list input.tick').forEach((el) => {
      el.checked = checked;
      if (checked) state.selected.add(el.dataset.id);
      else state.selected.delete(el.dataset.id);
    });
    updateBatchUI();
  };
  $('#batch-enable').onclick = () => batchAction('enable');
  $('#batch-disable').onclick = () => batchAction('disable');
  $('#batch-gen').onclick = () => batchAction('generate');
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
      if (s.status === 'done') text.textContent = `${lines}\n全部完成 ✅`;
      if (s.status === 'cancelled') text.textContent = `${lines}\n任务已取消`;
      if (s.status === 'failed') text.textContent = `${lines}\n任务失败`;
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
      toast('封面已更新并上传 ✅', 'ok');
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
    <p class="modal-note">点击任意影片，将其海报作为该合集封面，保存配置后生效。</p>
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
        drawTargets();
        toast('已选择封面影片，点击保存后生效', 'ok');
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
  const c = s.cover;

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
          <button class="btn" id="btn-test-webhook">发送测试通知</button>
          <span class="status-line" id="test-webhook-result"></span>
        </div>
        <p class="hint" style="margin-top:8px">「发送测试通知」会模拟 Emby 推送一个事件到上面的 Webhook 地址，可验证自动更新链路是否正常，并会安排一次自动同步。</p>
      </div>
    </div>

    <div class="panel">
      <h3>封面配置</h3>
      <div class="cfg-wrap" style="display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start">
        <div class="cfg-left" style="flex:1;min-width:280px">
          <div class="seg" id="cfg-kind">
            <button class="seg-btn active" data-kind="library">媒体库</button>
            <button class="seg-btn" data-kind="collection">合集</button>
          </div>
          <div class="row" id="cfg-lib-fields" style="gap:22px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">
            <label class="field" style="max-width:260px"><span class="lab">媒体库默认样式</span>
              <select id="set-lib-style">
                <option value="single" ${(s.styleByKind?.library || 'single') === 'single' ? 'selected' : ''}>单图海报</option>
                <option value="wall3" ${s.styleByKind?.library === 'wall3' ? 'selected' : ''}>海报墙</option>
              </select>
              <span class="hint">尺寸固定为 16:9 缩略图</span>
            </label>
          </div>
          <div class="row" id="cfg-col-fields" style="display:none;gap:22px;flex-wrap:wrap;align-items:flex-start;margin-top:10px">
            <label class="field" style="max-width:260px"><span class="lab">合集默认样式</span>
              <select disabled><option selected>单图海报（合集固定）</option></select>
              <span class="hint">尺寸固定为 2:3 海报</span>
            </label>
          </div>
          <div class="row" style="gap:22px;align-items:flex-start;margin-top:10px">
            <label class="field" style="max-width:320px"><span class="lab">选图依据（单图海报）</span>
              <select id="set-defaultPickBy">
                <option value="added" ${s.defaultPickBy === 'premiere' ? '' : 'selected'}>加入时间（最新入库）</option>
                <option value="premiere" ${s.defaultPickBy === 'premiere' ? 'selected' : ''}>发行时间（最新发行）</option>
              </select>
              <span class="hint">单图海报样式按此依据挑选要展示的海报</span>
            </label>
          </div>
          <div class="row" style="gap:22px;align-items:flex-start;margin-top:10px">
            <label class="field" style="max-width:320px"><span class="lab">背景模式</span>
              <select id="set-backgroundMode">
                <option value="gradient" ${(c.backgroundMode || 'gradient') === 'gradient' ? 'selected' : ''}>渐变色（自定义上下色）</option>
                <option value="poster" ${c.backgroundMode === 'poster' ? 'selected' : ''}>海报渐变模糊色</option>
              </select>
              <span class="hint">海报模式：从展示的海报取色并模糊作为背景</span>
            </label>
          </div>
        </div>
        <div class="cfg-right" style="width:360px;flex-shrink:0">
          <div class="lab">实时预览（当前所选类型）</div>
          <div id="cfg-preview-wrap" style="position:relative;display:inline-block;max-width:100%">
            <img id="cfg-preview" alt="封面预览" style="width:360px;max-width:100%;height:auto;border-radius:10px;border:1px solid var(--border);background:var(--panel-2);display:block">
            <div id="cfg-preview-loading" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;background:rgba(10,15,28,0.55);border-radius:10px;color:#fff;font-size:13px">生成中…</div>
          </div>
        </div>
      </div>
      <div class="cfg-below mt">
        <div class="grid-4">
          <label class="field"><span class="lab">标题字号</span><input type="number" id="set-titleSize" value="${c.titleSize}" min="18" max="480"></label>
          <label class="field"><span class="lab">副标题字号</span><input type="number" id="set-subtitleSize" value="${c.subtitleSize}" min="12" max="240"></label>
          <label class="field"><span class="lab">背景顶部</span><input type="color" id="set-bgTop" value="${c.bgTop}"></label>
          <label class="field"><span class="lab">背景底部</span><input type="color" id="set-bgBottom" value="${c.bgBottom}"></label>
        </div>
        <div class="grid-4 mt">
          <label class="field"><span class="lab">强调色</span><input type="color" id="set-accent" value="${c.accent}"></label>
          <label class="field"><span class="lab">标题颜色</span><input type="color" id="set-titleColor" value="${c.titleColor}"></label>
          <label class="field"><span class="lab">副标题颜色</span><input type="color" id="set-subtitleColor" value="${c.subtitleColor}"></label>
        </div>
        <div class="grid-3 mt">
          <label class="field"><span class="lab">字体（Pango 名称）</span><input type="text" id="set-fontFamily" value="${esc(c.fontFamily)}"></label>
          <label class="field"><span class="lab">字体文件路径（可选）</span><input type="text" id="set-fontFile" value="${esc(c.fontFile)}" placeholder="留空自动查找系统字体"></label>
        </div>
        <label class="row" style="gap:8px;margin-top:8px"><input type="checkbox" id="set-showCount" ${c.showCount ? 'checked' : ''}> 封面显示影片数量副标题</label>
      </div>
      <div class="row mt" style="gap:10px;align-items:center;flex-wrap:wrap">
        <button class="btn" id="btn-save-cover">保存封面设置</button>
        <button class="btn primary" id="btn-save-regen">保存并重新生成当前类型封面</button>
        <span class="status-line" id="save-cover-result"></span>
      </div>
      <p class="muted" style="font-size:12px;margin-top:8px">颜色、字体等为两类通用设置；「保存并重新生成当前类型封面」只重新生成当前所选类型（媒体库/合集）中未锁定的封面。</p>
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

  document.querySelectorAll('#cfg-kind .seg-btn').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#cfg-kind .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
      $('#cfg-lib-fields').style.display = b.dataset.kind === 'library' ? '' : 'none';
      $('#cfg-col-fields').style.display = b.dataset.kind === 'collection' ? '' : 'none';
      refreshCfgPreview();
    };
  });

  let cfgPreviewTimer = null;
  function refreshCfgPreview() {
    const kind = (document.querySelector('#cfg-kind .seg-btn.active')?.dataset.kind) || 'library';
    const style = kind === 'library' ? ($('#set-lib-style')?.value || 'single') : 'single';
    const size = kind === 'library' ? 'thumb' : 'poster'; // 尺寸强制：媒体库 16:9，合集 2:3
    const q = new URLSearchParams({
      style,
      size,
      backgroundMode: $('#set-backgroundMode').value,
      title: kind === 'library' ? '我的媒体库' : '我的电影合集',
      showCount: $('#set-showCount').checked ? '1' : '0',
      titleSize: $('#set-titleSize').value,
      subtitleSize: $('#set-subtitleSize').value,
      bgTop: $('#set-bgTop').value,
      bgBottom: $('#set-bgBottom').value,
      accent: $('#set-accent').value,
      titleColor: $('#set-titleColor').value,
      subtitleColor: $('#set-subtitleColor').value,
      fontFamily: $('#set-fontFamily').value.trim(),
      fontFile: $('#set-fontFile').value.trim()
    });
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
  ['#set-lib-style', '#set-defaultPickBy', '#set-backgroundMode', '#set-titleSize', '#set-subtitleSize', '#set-showCount', '#set-bgTop', '#set-bgBottom', '#set-accent', '#set-titleColor', '#set-subtitleColor', '#set-fontFamily', '#set-fontFile'].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
      clearTimeout(cfgPreviewTimer);
      cfgPreviewTimer = setTimeout(refreshCfgPreview, 350);
    });
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

  $('#btn-test-webhook').onclick = async () => {
    const btn = $('#btn-test-webhook');
    const el = $('#test-webhook-result');
    btn.disabled = true;
    el.className = 'status-line';
    el.textContent = '正在发送测试通知…';
    try {
      const urlInfo = await api('/api/webhook/url');
      const payload = {
        Event: 'Library.New',
        Item: { Id: 'emby-cover-studio-test', Name: '测试通知', Type: 'CollectionFolder' }
      };
      const res = await fetch(urlInfo.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.handled) throw new Error('事件未被识别');
      el.className = 'status-line ok';
      el.textContent = '测试通知已送达 ✅ 已安排自动同步';
      toast('测试通知已送达，自动同步即将执行', 'ok');
      loadStatus().then(updateAutoStatus);
    } catch (e) {
      el.className = 'status-line err';
      el.textContent = `发送失败：${e.message}`;
    } finally {
      btn.disabled = false;
    }
  };

  async function refreshAutoStatus() {
    await loadStatus();
    updateAutoStatus();
  }
  const autoTimer = setInterval(refreshAutoStatus, 5000);
  state.timers.push(autoTimer);
  updateAutoStatus();

  function syncBgFields() {
    const poster = $('#set-backgroundMode').value === 'poster';
    $('#set-bgTop').disabled = poster;
    $('#set-bgBottom').disabled = poster;
  }
  $('#set-backgroundMode').onchange = syncBgFields;
  syncBgFields();

  function collectCoverBody() {
    return {
      defaultPickBy: $('#set-defaultPickBy').value,
      styleByKind: { library: $('#set-lib-style').value, collection: 'single' },
      cover: {
        titleSize: Number($('#set-titleSize').value),
        subtitleSize: Number($('#set-subtitleSize').value),
        bgTop: $('#set-bgTop').value,
        bgBottom: $('#set-bgBottom').value,
        accent: $('#set-accent').value,
        titleColor: $('#set-titleColor').value,
        subtitleColor: $('#set-subtitleColor').value,
        fontFamily: $('#set-fontFamily').value.trim(),
        fontFile: $('#set-fontFile').value.trim(),
        backgroundMode: $('#set-backgroundMode').value,
        showCount: $('#set-showCount').checked
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
      const kind = (document.querySelector('#cfg-kind .seg-btn.active')?.dataset.kind) || 'library';
      toast(`设置已保存，开始重新生成${kind === 'library' ? '媒体库' : '合集'}封面…`, 'ok');
      showSyncProgress();
      api('/api/sync', { method: 'POST', body: { force: true, onlyKind: kind } }).then(() => {}).catch(() => {});
    } catch (e) {
      toast(`保存失败：${e.message}`, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '保存并重新生成当前类型封面';
    }
  };

}

// ---------- 日志 ----------
async function renderLogs() {
  main.innerHTML = `
    <div class="page-title">运行日志</div>
    <div class="page-desc">最近的同步与 Webhook 记录（最多保留 500 条）</div>
    <div class="row mb">
      <button class="btn sm" id="btn-refresh-logs">刷新</button>
      <span class="muted" id="log-count"></span>
    </div>
    <div class="panel" style="padding:10px 14px">
      <table class="table"><thead><tr><th style="width:170px">时间</th><th style="width:70px">级别</th><th>内容</th></tr></thead><tbody id="log-body"></tbody></table>
    </div>`;

  async function refresh() {
    try {
      const r = await api('/api/logs');
      state.logs = r.logs;
      const tb = $('#log-body');
      if (!tb) return;
      $('#log-count').textContent = `共 ${r.logs.length} 条`;
      tb.innerHTML = r.logs.slice(0, 120).map((l) => `
        <tr>
          <td class="muted" style="font-size:12px">${fmtTime(l.ts)}</td>
          <td><span class="lvl-${esc(l.level)}">${esc(l.level)}</span></td>
          <td>${esc(l.message)}</td>
        </tr>`).join('') || '<tr><td colspan="3" class="empty">暂无日志</td></tr>';
    } catch {
      // 忽略轮询错误
    }
  }
  $('#btn-refresh-logs').onclick = refresh;
  await refresh();
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
