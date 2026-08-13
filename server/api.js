import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COVERS_DIR } from '../src/config.js';
import { info, warn, error } from '../src/logger.js';
import { EmbyClient } from '../src/emby/client.js';
import { generateCover } from '../src/covers/generator.js';
import { placeholderPoster } from '../src/covers/placeholders.js';
import { fontStatus } from '../src/covers/fonts.js';
import { STYLES, SIZE_PRESETS, DEFAULT_SIZE_BY_KIND, isValidStyle } from '../src/covers/styles.js';
import { parseCron, nextRunDate } from '../src/scheduler.js';
import { buildBackupData, buildWebdavBackupData, webdavPut, webdavGet } from './backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

function okJson(obj, status = 200) {
  return { status, contentType: 'application/json; charset=utf-8', body: obj };
}

function errJson(errorMsg, status = 400) {
  return okJson({ ok: false, error: errorMsg }, status);
}

function okBuffer(buf, contentType) {
  return { status: 200, contentType, body: buf };
}

export function createApi(app) {
  const { store, syncService, webhookService } = app;
  let embyStatusCache = { at: 0, value: null };
  let nextRunCache = { at: 0, expr: '', value: null };

  function webhookUrl(baseUrl) {
    const token = store.settings.webhookToken;
    return `${baseUrl}/api/webhook/emby${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  function getNextRun() {
    const expr = store.settings.cron || '0 */6 * * *';
    const now = Date.now();
    if (nextRunCache.expr === expr && now - nextRunCache.at < 60000) return nextRunCache.value;
    try {
      const d = nextRunDate(parseCron(expr));
      nextRunCache = { at: now, expr, value: d ? d.toISOString() : null };
    } catch {
      nextRunCache = { at: now, expr, value: null };
    }
    return nextRunCache.value;
  }

  function setupCron() {
    const expr = store.settings.cron || '0 */6 * * *';
    try {
      parseCron(expr);
      app.scheduler.remove('cover-sync');
      app.scheduler.add('cover-sync', expr, () => syncService.runSync({ reason: '定时任务' }));
      info(`定时任务已设置：${expr}`);
    } catch {
      info(`cron 表达式无效：${expr}`);
    }
  }

  let updateCheckCache = { at: 0, value: null };
  function cmpVersion(a, b) {
    const pa = String(a || '').split('.').map(Number);
    const pb = String(b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x > y) return 1;
      if (x < y) return -1;
    }
    return 0;
  }
  function changelogSince(text, current) {
    const blocks = [];
    let cur = null;
    for (const line of String(text || '').split('\n')) {
      const m = line.match(/^##\s+v([\d.]+)/i);
      if (m) {
        if (cur) blocks.push(cur);
        cur = { version: m[1], lines: [line] };
      } else if (cur) cur.lines.push(line);
    }
    if (cur) blocks.push(cur);
    return blocks
      .filter((b) => cmpVersion(b.version, current) > 0)
      .map((b) => b.lines.join('\n'))
      .join('\n\n');
  }
  async function fetchUrl(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }
  async function checkUpdate() {
    const now = Date.now();
    if (updateCheckCache.value && now - updateCheckCache.at < 3600000) return updateCheckCache.value;
    const current = PKG.version || '0.0.0';
    // jsDelivr CDN 国内通常可访问，GitHub 原站兜底
    const sources = [
      {
        pkg: 'https://cdn.jsdelivr.net/gh/4202217/EmbyCoverStudio@main/package.json',
        changelog: 'https://cdn.jsdelivr.net/gh/4202217/EmbyCoverStudio@main/CHANGELOG.md'
      },
      {
        pkg: 'https://raw.githubusercontent.com/4202217/EmbyCoverStudio/main/package.json',
        changelog: 'https://raw.githubusercontent.com/4202217/EmbyCoverStudio/main/CHANGELOG.md'
      }
    ];
    for (const url of sources) {
      try {
        const [pkgText, changelogText] = await Promise.all([fetchUrl(url.pkg), fetchUrl(url.changelog)]);
        const remote = JSON.parse(pkgText);
        const latest = String(remote.version || '').trim();
        const hasUpdate = Boolean(latest && cmpVersion(latest, current) > 0);
        updateCheckCache = {
          at: now,
          value: {
            ok: true,
            current,
            latest,
            hasUpdate,
            changelog: hasUpdate ? changelogSince(changelogText, current) : ''
          }
        };
        return updateCheckCache.value;
      } catch (e) {
        // 继续尝试下一个数据源
      }
    }
    updateCheckCache = { at: now, value: { ok: false, error: '无法连接版本源', current } };
    return updateCheckCache.value;
  }

  async function getEmbyStatus() {
    const now = Date.now();
    if (embyStatusCache.value && now - embyStatusCache.at < 15000) return embyStatusCache.value;
    const client = new EmbyClient(store.settings);
    if (!client.configured) {
      embyStatusCache = { at: now, value: { configured: false, connected: false } };
      return embyStatusCache.value;
    }
    try {
      const infoData = await client.test();
      embyStatusCache = {
        at: now,
        value: {
          configured: true,
          connected: true,
          serverName: infoData.serverName,
          version: infoData.version,
          userId: infoData.userId
        }
      };
    } catch (e) {
      embyStatusCache = { at: now, value: { configured: true, connected: false, error: e.message } };
    }
    return embyStatusCache.value;
  }

  function checkAccess(pathname, token) {
    if (pathname.startsWith('/api/webhook')) return true;
    const accessToken = store.settings.accessToken;
    if (!accessToken) return true;
    return token === accessToken;
  }

  async function dispatch({ method, pathname, query = new URLSearchParams(), body = null, baseUrl = 'http://localhost:3000', token = '', headerToken = '' }) {
    if (!checkAccess(pathname, token)) {
      return okJson({ ok: false, error: '访问令牌无效' }, 401);
    }
    const p = pathname.replace(/^\/api/, '') || '/';
    const segments = p.split('/').filter(Boolean);
    const m = method.toUpperCase();

    // GET /api/status
    if (m === 'GET' && p === '/status') {
      const targets = store.listTargets();
      const tasks = store.listTasks();
      const s = syncService.state;
      return okJson({
        ok: true,
        time: new Date().toISOString(),
        version: PKG.version || '0.0.0',
        running: s.running,
        lastRun: s.lastRun,
        lastReason: s.lastReason,
        lastError: s.lastError,
        counts: s.counts,
        emby: await getEmbyStatus(),
        stats: {
          targets: targets.length,
          enabled: targets.filter((t) => !t.locked).length,
          generated: targets.filter((t) => t.coverFile).length,
          missing: targets.filter((t) => t.missing).length,
          failed: targets.filter((t) => t.lastError && !store.isAcknowledgedTarget(t.id)).length,
          coversGenerated: tasks.reduce((sum, t) => sum + (t.updated || 0), 0),
          taskCount: tasks.length
        },
        cron: store.settings.cron,
        cronValid: true,
        nextRun: getNextRun(),
        webhookPending: webhookService.pending,
        webhook: {
          url: webhookUrl(baseUrl),
          lastEvent: webhookService.last.event,
          lastEventAt: webhookService.last.at,
          test: webhookService.test
        },
        font: fontStatus(store.settings.coverByStyle?.['library-single'] || {}),
        sync: {
          status: s.status,
          running: s.running,
          total: s.queueTotal,
          done: s.queueDone,
          current: s.queueCurrent,
          updated: s.queueUpdated,
          failed: s.queueFailed,
          unchanged: s.queueUnchanged,
          remaining: s.remainingIds.length
        }
      });
    }

    // GET/PUT /api/settings
    if (p === '/settings') {
      if (m === 'GET') return okJson({ ok: true, settings: store.settings });
      if (m === 'PUT') {
        store.updateSettings(body || {});
        setupCron();
        embyStatusCache = { at: 0, value: null };
        return okJson({ ok: true, settings: store.settings });
      }
    }

    // GET /api/styles
    if (m === 'GET' && p === '/styles') {
      return okJson({
        ok: true,
        styles: STYLES,
        sizes: Object.values(SIZE_PRESETS),
        defaults: DEFAULT_SIZE_BY_KIND,
        defaultPickBy: store.settings.defaultPickByByStyle?.['library-single'] || 'added',
        defaultPickByByStyle: store.settings.defaultPickByByStyle,
        coverByStyle: store.settings.coverByStyle,
        styleByKind: store.settings.styleByKind
      });
    }

    // GET /api/export
    if (m === 'GET' && p === '/export') return okJson(buildBackupData(store));

    // GET /api/changelog
    if (m === 'GET' && p === '/changelog') {
      let text = '';
      try {
        text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
      } catch {
        text = '暂无更新记录';
      }
      return okJson({ ok: true, text });
    }

    // GET /api/update/check
    if (m === 'GET' && p === '/update/check') {
      return okJson({ ok: true, ...(await checkUpdate()) });
    }

    // POST /api/import
    if (m === 'POST' && p === '/import') {
      const data = body?.data && typeof body.data === 'object' ? body.data : body;
      if (!data || data.version !== 1 || !data.settings || !data.targets) {
        return errJson('备份文件格式不正确或版本不匹配');
      }
      store.replaceAll(data.settings, data.targets, data.tasks || []);
      setupCron();
      embyStatusCache = { at: 0, value: null };
      info('已导入配置与数据备份');
      return okJson({ ok: true, importedTargets: store.listTargets().length });
    }

    // POST /api/emby/test
    if (m === 'POST' && p === '/emby/test') {
      const url = String((body?.embyUrl ?? store.settings.embyUrl) || '').trim();
      const key = String((body?.embyApiKey ?? store.settings.embyApiKey) || '').trim();
      const client = new EmbyClient({ embyUrl: url, embyApiKey: key });
      try {
        return okJson({ ok: true, ...(await client.test()) });
      } catch (e) {
        return errJson(e.message);
      }
    }

    // GET /api/targets
    if (m === 'GET' && p === '/targets') {
      return okJson({
        ok: true,
        targets: store.listTargets().map((t) => ({
          ...t,
          coverUrl: t.coverFile ? `/api/covers/${encodeURIComponent(t.coverFile)}` : '',
          acknowledged: store.isAcknowledgedTarget(t.id)
        }))
      });
    }

    // POST /api/targets/batch
    if (m === 'POST' && p === '/targets/batch') {
      const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter((id) => store.getTarget(id)) : [];
      const action = String(body?.action || '');
      if (!ids.length) return errJson('请选择至少一个合集');
      if (action === 'enable' || action === 'disable') {
        const affected = action === 'enable'
          ? ids.filter((id) => store.getTarget(id).locked)
          : ids.filter((id) => !store.getTarget(id).locked);
        if (!affected.length) return errJson(action === 'enable' ? '所选合集均未锁定' : '所选合集均已锁定');
        if (action === 'enable') {
          for (const id of affected) store.updateTarget(id, { locked: false, enabled: true });
        } else {
          for (const id of affected) store.updateTarget(id, { locked: true, enabled: false });
        }
        return okJson({ ok: true, updated: affected.length });
      }
      const unlocked = ids.filter((id) => !store.getTarget(id).locked);
      if (!unlocked.length) return errJson('所选合集均已锁定，请先解除锁定');
      if (action === 'template') {
        const style = String(body?.value || 'grid');
        if (!STYLES.some((s) => s.id === style)) return errJson('未知样式');
        for (const id of unlocked) {
          const t = store.getTarget(id);
          store.updateTarget(id, { template: t.kind === 'collection' ? 'single' : style });
        }
      } else if (action === 'pickBy') {
        const pick = body?.value === 'premiere' ? 'premiere' : 'added';
        for (const id of unlocked) store.updateTarget(id, { pickBy: pick });
      } else if (action === 'reset') {
        for (const id of unlocked) {
          store.updateTarget(id, { template: '', pickBy: '', manualItemId: '', manualItemName: '', configured: false });
        }
        syncService.runSync({ reason: '恢复默认配置', onlyIds: unlocked, force: true }).catch(() => {});
      } else if (action === 'generate') {
        syncService.runSync({ reason: '批量更新', onlyIds: unlocked, force: true }).catch(() => {});
      } else {
        return errJson('未知操作');
      }
      return okJson({ ok: true, updated: unlocked.length, skipped: ids.length - unlocked.length });
    }

    // GET /api/tasks
    if (m === 'GET' && p === '/tasks') {
      return okJson({
        ok: true,
        tasks: store.listTasks().map((t) => ({ ...t, acknowledged: store.isAcknowledgedTask(t.seq) }))
      });
    }

    // GET /api/logs
    if (m === 'GET' && p === '/logs') {
      return okJson({ ok: true, logs: [...store.data.logs].reverse() });
    }

    // POST /api/acknowledge
    if (m === 'POST' && p === '/acknowledge') {
      if (body?.all) {
        const failedTargets = store.listTargets()
          .filter((t) => t.lastError && !store.isAcknowledgedTarget(t.id))
          .map((t) => t.id);
        const failedTasks = store.data.tasks
          .filter((t) => t.status === 'failed' && !store.isAcknowledgedTask(t.seq))
          .slice(-5)
          .map((t) => t.seq);
        store.acknowledgeTargets(failedTargets);
        store.acknowledgeTasks(failedTasks);
        return okJson({ ok: true, targets: failedTargets.length, tasks: failedTasks.length });
      }
      if (body?.targetId) {
        store.acknowledgeTargets([String(body.targetId)]);
        return okJson({ ok: true });
      }
      if (body?.taskSeq !== undefined) {
        store.acknowledgeTasks([String(body.taskSeq)]);
        return okJson({ ok: true });
      }
      return errJson('缺少参数');
    }

    // GET /api/webhook/url
    if (m === 'GET' && p === '/webhook/url') {
      return okJson({ ok: true, url: webhookUrl(baseUrl), token: store.settings.webhookToken });
    }

    // POST /api/webhook/test/arm
    if (m === 'POST' && p === '/webhook/test/arm') {
      return okJson(webhookService.armTest());
    }

    // POST /api/webhook/emby
    if (m === 'POST' && p === '/webhook/emby') {
      const queryToken = query.get('token') || '';
      if (store.settings.webhookToken && queryToken !== store.settings.webhookToken && headerToken !== store.settings.webhookToken) {
        return okJson({ ok: false, error: 'webhook token 无效' }, 403);
      }
      const payload = body?.payload ?? body;
      const result = await webhookService.handle(payload || {});
      return okJson(result);
    }

    // POST /api/sync
    if (m === 'POST' && p === '/sync') {
      const onlyKind = body?.onlyKind === 'library' || body?.onlyKind === 'collection' ? body.onlyKind : null;
      const onlyStyle = body?.onlyStyle === 'single' || body?.onlyStyle === 'wall3' ? body.onlyStyle : null;
      const result = await syncService.runSync({ force: Boolean(body?.force), reason: '手动同步', onlyKind, onlyStyle });
      return result.ok ? okJson(result) : errJson(result.error || '同步失败', 400);
    }

    // POST /api/sync/pause|resume|cancel
    if (m === 'POST' && (p === '/sync/pause' || p === '/sync/resume' || p === '/sync/cancel')) {
      if (p === '/sync/pause') return okJson(syncService.requestPause());
      if (p === '/sync/resume') return okJson(syncService.resume());
      return okJson(syncService.requestCancel());
    }

    // GET /api/covers/:file
    if (m === 'GET' && segments[0] === 'covers' && segments.length === 2) {
      const file = segments[1];
      if (!/^[A-Za-z0-9._-]+\.png$/.test(file)) return errJson('非法文件名');
      const fp = path.join(COVERS_DIR, file);
      if (!fs.existsSync(fp)) return errJson('封面不存在', 404);
      return okBuffer(fs.readFileSync(fp), 'image/png');
    }

    // GET /api/item-image/:id
    if (m === 'GET' && segments[0] === 'item-image' && segments.length === 2) {
      const id = segments[1];
      if (!/^[A-Za-z0-9_-]+$/.test(id)) return errJson('非法 ID');
      const w = Math.min(400, Math.max(80, Number(query.get('w')) || 240));
      try {
        const buf = await new EmbyClient(store.settings).getImage(id, w);
        return okBuffer(buf, 'image/jpeg');
      } catch (e) {
        return errJson(e.message, 404);
      }
    }

    // GET /api/preview/:id
    if (m === 'GET' && segments[0] === 'preview' && segments.length === 2) {
      try {
        const overrides = {
          style: query.get('style') || '',
          backgroundMode: query.get('backgroundMode') || '',
          width: Number(query.get('width') || 0) || 0,
          height: Number(query.get('height') || 0) || 0
        };
        const png = await syncService.previewById(segments[1], overrides);
        return okBuffer(png, 'image/png');
      } catch (e) {
        return errJson(e.message);
      }
    }

    // GET /api/demo-preview
    if (m === 'GET' && p === '/demo-preview') {
      try {
        const settings = JSON.parse(JSON.stringify(store.settings.coverByStyle?.['library-single'] || {}));
        const numKeys = ['width', 'height', 'titleSize', 'subtitleSize', 'radius', 'cellBorder'];
        const strKeys = ['titleColor', 'subtitleColor', 'bgTop', 'bgBottom', 'backgroundMode', 'accent', 'fontFamily', 'fontFile'];
        for (const k of numKeys) {
          const v = Number(query.get(k));
          if (Number.isFinite(v) && v > 0) settings[k] = v;
        }
        for (const k of strKeys) {
          if (query.get(k)) settings[k] = query.get(k);
        }
        if (query.get('showCount') === '0') settings.showCount = false;
        if (SIZE_PRESETS[query.get('size')]) {
          settings.width = SIZE_PRESETS[query.get('size')].width;
          settings.height = SIZE_PRESETS[query.get('size')].height;
        }
        const style = STYLES.some((s) => s.id === query.get('style')) ? query.get('style') : 'single';
        const targetId = String(query.get('targetId') || '');
        if (targetId) {
          const png = await syncService.previewWithSettings(targetId, {
            style,
            cover: settings,
            pickBy: query.get('pickBy') === 'premiere' ? 'premiere' : query.get('pickBy') === 'manual' ? 'manual' : query.get('pickBy') === 'random' ? 'random' : 'added',
            manualItemId: query.get('manualItemId') || ''
          });
          return okBuffer(png, 'image/png');
        }
        const count = 9;
        const posters = [];
        for (let i = 0; i < count; i += 1) {
          posters.push(await placeholderPoster(`MOVIE ${i + 1}`, i));
        }
        const png = await generateCover({
          title: query.get('title') || '我的电影合集',
          subtitle: settings.showCount ? `共 ${count} 部作品` : '',
          posters,
          settings,
          style
        });
        return okBuffer(png, 'image/png');
      } catch (e) {
        return errJson(e.message);
      }
    }

    // GET /api/targets/:id/items
    if (m === 'GET' && segments[0] === 'targets' && segments.length === 3 && segments[2] === 'items') {
      const target = store.getTarget(segments[1]);
      if (!target) return errJson('目标不存在', 404);
      try {
        const items = await new EmbyClient(store.settings).getCoverItems(target, 300);
        return okJson({ ok: true, items });
      } catch (e) {
        return errJson(e.message);
      }
    }

    // POST /api/targets/:id/preview-draft
    if (m === 'POST' && segments[0] === 'targets' && segments.length === 3 && segments[2] === 'preview-draft') {
      const target = store.getTarget(segments[1]);
      if (!target) return errJson('目标不存在', 404);
      const style = body?.style === 'wall3' && target.kind === 'library' ? 'wall3' : 'single';
      const pickBy = ['manual', 'premiere', 'random', 'added'].includes(body?.pickBy) ? body.pickBy : 'added';
      const manualItemId = String(body?.manualItemId || '').trim();
      if (pickBy === 'manual' && !manualItemId) return errJson('请先选择封面影片');
      try {
        const cover = store.settings.coverByStyle?.[`${target.kind}-${style}`] || {};
        const png = await syncService.previewWithSettings(target.id, { style, cover, pickBy, manualItemId });
        fs.writeFileSync(path.join(COVERS_DIR, `${target.id}.draft.png`), png);
        return okJson({ ok: true, coverUrl: `/api/covers/${encodeURIComponent(target.id)}.draft.png?t=${Date.now()}` });
      } catch (e) {
        return errJson(e.message);
      }
    }

    // POST /api/targets/:id/generate
    if (m === 'POST' && segments[0] === 'targets' && segments.length === 3 && segments[2] === 'generate') {
      const result = await syncService.syncById(segments[1], { force: true, reason: '手动生成' });
      return result.ok ? okJson({ ok: true, ...result }) : errJson(result.error || '生成失败', 400);
    }

    // PUT /api/targets/:id
    if (m === 'PUT' && segments[0] === 'targets' && segments.length === 2) {
      const target = store.getTarget(segments[1]);
      if (!target) return errJson('目标不存在', 404);
      const patch = {};
      if ('enabled' in body) patch.enabled = Boolean(body.enabled);
      if ('template' in body) {
        const v = String(body.template || 'single');
        patch.template = target.kind === 'collection' ? 'single' : (isValidStyle(v) ? v : 'single');
        patch.configured = true;
      }
      if ('titleOverride' in body) patch.titleOverride = String(body.titleOverride || '').trim();
      if ('pickBy' in body) {
        const v = String(body.pickBy || '');
        patch.pickBy = ['added', 'premiere', 'manual', 'random'].includes(v) ? v : 'added';
        patch.configured = true;
        if (patch.pickBy !== 'manual') {
          patch.manualItemId = '';
          patch.manualItemName = '';
        }
      }
      if ('manualItemId' in body) {
        patch.manualItemId = String(body.manualItemId || '').trim();
        patch.configured = true;
      }
      if ('manualItemName' in body) patch.manualItemName = String(body.manualItemName || '').trim();
      if ('locked' in body) {
        patch.locked = Boolean(body.locked);
        patch.enabled = !patch.locked;
      }
      if ('needsRegen' in body) patch.needsRegen = Boolean(body.needsRegen);
      store.updateTarget(target.id, patch);
      if (patch.enabled === true && !target.coverFile) {
        syncService.syncById(target.id, { force: true, reason: '启用合集' }).catch(() => {});
      }
      return okJson({ ok: true, target: store.getTarget(target.id) });
    }

    // POST /api/webdav/test
    if (m === 'POST' && p === '/webdav/test') {
      if (!store.settings.webdavUrl) return errJson('请先填写 WebDAV 地址');
      try {
        const r = await fetch(webdavUrlOf(), { method: 'GET', headers: { Authorization: webdavAuth() } });
        if (r.status === 200 || r.status === 404) return okJson({ ok: true });
        return errJson(`WebDAV 测试失败（HTTP ${r.status}）`);
      } catch (e) {
        return errJson(e.message);
      }
    }

    // POST /api/webdav/backup
    if (m === 'POST' && p === '/webdav/backup') {
      try {
        const url = await webdavPut(store.settings, buildWebdavBackupData(store));
        store.updateSettings({ webdavLastBackup: new Date().toISOString() });
        return okJson({ ok: true, url });
      } catch (e) {
        return errJson(e.message);
      }
    }

    // POST /api/webdav/restore
    if (m === 'POST' && p === '/webdav/restore') {
      try {
        const data = await webdavGet(store.settings);
        if (!data || data.version !== 1) return errJson('WebDAV 上的备份文件格式不正确或版本不匹配');
        const mask = data.webdavMask || { settings: true, targets: true, tasks: true };
        store.applyBackup({
          settings: mask.settings ? (data.settings || {}) : null,
          targets: mask.targets ? (data.targets || []) : null,
          tasks: mask.tasks ? (data.tasks || []) : null
        });
        setupCron();
        embyStatusCache = { at: 0, value: null };
        info('已从 WebDAV 恢复备份');
        return okJson({ ok: true, importedTargets: store.listTargets().length });
      } catch (e) {
        return errJson(e.message);
      }
    }

    return errJson('接口不存在', 404);
  }

  function webdavAuth() {
    const s = store.settings;
    return 'Basic ' + Buffer.from(`${s.webdavUser || ''}:${s.webdavPassword || ''}`).toString('base64');
  }

  function webdavUrlOf() {
    const base = String(store.settings.webdavUrl || '').replace(/\/+$/, '');
    const file = String(store.settings.webdavFile || 'backup.json').replace(/^\/+/, '');
    return `${base}/${file}`;
  }

  return { dispatch };
}
