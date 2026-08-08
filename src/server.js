import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_DIR, COVERS_DIR, PORT, HOST } from './config.js';
import { Store, randomToken } from './store.js';
import { setLogSink, info, warn, error } from './logger.js';
import { Scheduler, parseCron } from './scheduler.js';
import { EmbyClient } from './emby/client.js';
import { generateCover } from './covers/generator.js';
import { placeholderPoster } from './covers/placeholders.js';
import { fontStatus } from './covers/fonts.js';
import { STYLES, SIZE_PRESETS, DEFAULT_SIZE_BY_KIND, STYLE_SIZE_MAP, PICK_BY_OPTIONS } from './covers/styles.js';
import { createSyncService } from './services/sync.js';
import { createWebhookService } from './services/webhook.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendBuffer(res, status, buf, contentType, cache = 'no-store') {
  res.writeHead(status, { 'Content-Type': contentType, 'Content-Length': buf.length, 'Cache-Control': cache });
  res.end(buf);
}

async function readJson(req, limit = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

export async function createApp(options = {}) {
  const store = options.store || new Store();
  setLogSink(store);
  const syncService = createSyncService(store);
  const webhookService = createWebhookService(store, syncService);
  const scheduler = new Scheduler();

  let embyStatusCache = { at: 0, value: null };
  async function getEmbyStatus() {
    const settings = store.settings;
    if (!settings.embyUrl || !settings.embyApiKey) return { configured: false };
    if (Date.now() - embyStatusCache.at < 30000 && embyStatusCache.value) return embyStatusCache.value;
    const client = new EmbyClient(settings);
    try {
      const t = await client.test();
      embyStatusCache = {
        at: Date.now(),
        value: { configured: true, connected: true, serverName: t.serverName, version: t.version, userId: t.userId }
      };
    } catch (e) {
      embyStatusCache = { at: Date.now(), value: { configured: true, connected: false, error: e.message } };
    }
    return embyStatusCache.value;
  }

  function webhookUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `localhost:${PORT}`;
    const token = store.settings.webhookToken;
    return `${proto}://${host}/api/webhook/emby${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  }

  function setupCron() {
    const expr = store.settings.cron || '0 */6 * * *';
    try {
      parseCron(expr);
      scheduler.add('cover-sync', expr, () => syncService.runSync({ reason: '定时任务' }));
      info(`定时任务已设置：${expr}`);
      return true;
    } catch (e) {
      warn(`cron 表达式无效（${expr}）：${e.message}`);
      return false;
    }
  }

  function checkAccessToken(req, res, pathname) {
    if (pathname.startsWith('/api/webhook')) return true;
    const token = store.settings.accessToken;
    if (!token) return true;
    const auth = req.headers['authorization'] || '';
    const header = req.headers['x-access-token'] || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : header;
    if (provided !== token) {
      sendJson(res, 401, { error: '访问令牌无效' });
      return false;
    }
    return true;
  }

  const routes = [];
  function route(method, p, handler) {
    routes.push({ method, path: p, handler });
  }

  route('GET', '/api/status', async (req, res) => {
    const settings = store.settings;
    const targets = store.listTargets();
    const s = syncService.state;
    sendJson(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      running: s.running,
      lastRun: s.lastRun,
      lastReason: s.lastReason,
      lastError: s.lastError,
      counts: s.counts,
      emby: await getEmbyStatus(),
      stats: {
        targets: targets.length,
        enabled: targets.filter((t) => t.enabled).length,
        generated: targets.filter((t) => t.coverFile).length,
        missing: targets.filter((t) => t.missing).length,
        failed: targets.filter((t) => t.lastError).length
      },
      cron: settings.cron,
      cronValid: true,
      webhookPending: webhookService.pending,
      webhook: { url: webhookUrl(req) },
      font: fontStatus(settings.cover),
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
  });

  route('GET', '/api/settings', (req, res) => {
    sendJson(res, 200, { ok: true, settings: store.settings });
  });

  route('PUT', '/api/settings', async (req, res) => {
    const body = await readJson(req);
    if (body.cron !== undefined) {
      try {
        parseCron(body.cron);
      } catch (e) {
        sendJson(res, 400, { error: e.message });
        return;
      }
    }
    store.updateSettings(body);
    setupCron();
    embyStatusCache = { at: 0, value: null };
    sendJson(res, 200, { ok: true, settings: store.settings });
  });

  route('POST', '/api/emby/test', async (req, res) => {
    const body = await readJson(req);
    const url = String(body.embyUrl ?? (store.settings.embyUrl || '')).trim();
    const key = String(body.embyApiKey ?? (store.settings.embyApiKey || '')).trim();
    const client = new EmbyClient({ embyUrl: url, embyApiKey: key });
    try {
      const t = await client.test();
      sendJson(res, 200, { ok: true, ...t });
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message });
    }
  });

  route('GET', '/api/targets', (req, res) => {
    const list = store.listTargets().map((t) => ({
      ...t,
      coverUrl: t.coverFile ? `/api/covers/${encodeURIComponent(t.coverFile)}` : ''
    }));
    sendJson(res, 200, { ok: true, targets: list });
  });

  route('GET', '/api/styles', (req, res) => {
    sendJson(res, 200, {
      ok: true,
      styles: STYLES,
      sizes: Object.values(SIZE_PRESETS),
      defaults: DEFAULT_SIZE_BY_KIND,
      sizeMap: STYLE_SIZE_MAP,
      pickBy: PICK_BY_OPTIONS,
      defaultPickBy: store.settings.defaultPickBy || 'added'
    });
  });

  route('POST', '/api/targets/batch', async (req, res) => {
    const body = await readJson(req);
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((id) => store.getTarget(id)) : [];
    const action = String(body.action || '');
    if (!ids.length) {
      sendJson(res, 400, { error: '请选择至少一个合集' });
      return;
    }
    if (action === 'enable') {
      for (const id of ids) store.updateTarget(id, { enabled: true });
      syncService.runSync({ reason: '批量启用', onlyIds: ids, force: true }).catch(() => {});
    } else if (action === 'disable') {
      for (const id of ids) store.updateTarget(id, { enabled: false });
    } else if (action === 'template') {
      const style = String(body.value || 'grid');
      if (!STYLES.some((s) => s.id === style)) {
        sendJson(res, 400, { error: '未知样式' });
        return;
      }
      for (const id of ids) store.updateTarget(id, { template: style });
    } else if (action === 'generate') {
      syncService.runSync({ reason: '批量更新', onlyIds: ids, force: true }).catch(() => {});
    } else {
      sendJson(res, 400, { error: '未知操作' });
      return;
    }
    sendJson(res, 200, { ok: true, updated: ids.length });
  });

  route('PUT', '/api/targets/:id', async (req, res, params) => {
    const body = await readJson(req);
    const target = store.getTarget(params.id);
    if (!target) {
      sendJson(res, 404, { error: '目标不存在' });
      return;
    }
    const patch = {};
    if ('enabled' in body) patch.enabled = Boolean(body.enabled);
    if ('template' in body) patch.template = String(body.template || 'single');
    if ('titleOverride' in body) patch.titleOverride = String(body.titleOverride || '').trim();
    if ('needsRegen' in body) patch.needsRegen = Boolean(body.needsRegen);
    store.updateTarget(target.id, patch);
    if (patch.enabled === true && !target.coverFile) {
      syncService.syncById(target.id, { force: true, reason: '启用合集' }).catch(() => {});
    }
    sendJson(res, 200, { ok: true, target: store.getTarget(target.id) });
  });

  route('POST', '/api/targets/:id/generate', async (req, res, params) => {
    const result = await syncService.syncById(params.id, { force: true, reason: '手动生成' });
    if (result.ok) sendJson(res, 200, { ok: true, ...result });
    else sendJson(res, 400, { ok: false, ...result });
  });

  route('POST', '/api/sync', async (req, res) => {
    const body = await readJson(req);
    const result = await syncService.runSync({ force: Boolean(body.force), reason: '手动同步' });
    sendJson(res, result.ok ? 200 : 400, result);
  });

  route('POST', '/api/sync/pause', (req, res) => {
    sendJson(res, 200, syncService.requestPause());
  });

  route('POST', '/api/sync/resume', (req, res) => {
    sendJson(res, 200, syncService.resume());
  });

  route('POST', '/api/sync/cancel', (req, res) => {
    sendJson(res, 200, syncService.requestCancel());
  });

  route('GET', '/api/preview/:id', async (req, res, params, query) => {
    try {
      const overrides = {
        style: query.get('style') || '',
        backgroundMode: query.get('backgroundMode') || '',
        width: Number(query.get('width') || 0) || 0,
        height: Number(query.get('height') || 0) || 0
      };
      const png = await syncService.previewById(params.id, overrides);
      sendBuffer(res, 200, png, 'image/png');
    } catch (e) {
      sendJson(res, 400, { error: e.message });
    }
  });

  route('GET', '/api/demo-preview', async (req, res, params, query) => {
    const settings = JSON.parse(JSON.stringify(store.settings.cover));
    const numKeys = ['width', 'height', 'columns', 'maxItems', 'titleSize', 'subtitleSize', 'radius', 'cellBorder'];
    const strKeys = ['titleColor', 'subtitleColor', 'bgTop', 'bgBottom', 'backgroundMode', 'accent', 'fontFamily', 'fontFile'];
    for (const k of numKeys) {
      const v = Number(query.get(k));
      if (Number.isFinite(v) && v > 0) settings[k] = v;
    }
    for (const k of strKeys) {
      if (query.get(k)) settings[k] = query.get(k);
    }
    if (query.get('showCount') === '0') settings.showCount = false;
    const style = STYLES.some((s) => s.id === query.get('style')) ? query.get('style') : 'single';
    if (SIZE_PRESETS[query.get('size')]) {
      settings.width = SIZE_PRESETS[query.get('size')].width;
      settings.height = SIZE_PRESETS[query.get('size')].height;
    }
    const count = Math.min(9, settings.maxItems || 9);
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
    sendBuffer(res, 200, png, 'image/png');
  });

  route('GET', '/api/covers/:file', (req, res, params) => {
    if (!/^[A-Za-z0-9._-]+\.png$/.test(params.file)) {
      sendJson(res, 400, { error: '非法文件名' });
      return;
    }
    const file = path.join(COVERS_DIR, params.file);
    if (!fs.existsSync(file)) {
      sendJson(res, 404, { error: '封面不存在' });
      return;
    }
    sendBuffer(res, 200, fs.readFileSync(file), 'image/png', 'public, max-age=3600');
  });

  route('GET', '/api/logs', (req, res) => {
    sendJson(res, 200, { ok: true, logs: [...store.data.logs].reverse() });
  });

  route('GET', '/api/webhook/url', (req, res) => {
    sendJson(res, 200, { ok: true, url: webhookUrl(req), token: store.settings.webhookToken });
  });

  route('POST', '/api/webhook/emby', async (req, res, params, query) => {
    const settings = store.settings;
    const queryToken = query.get('token') || '';
    const headerToken = req.headers['x-webhook-secret'] || '';
    if (settings.webhookToken && queryToken !== settings.webhookToken && headerToken !== settings.webhookToken) {
      sendJson(res, 403, { error: 'webhook token 无效' });
      return;
    }
    let payload = {};
    try {
      payload = await readJson(req);
    } catch (e) {
      sendJson(res, 400, { error: e.message });
      return;
    }
    const result = webhookService.handle(payload);
    sendJson(res, 200, result);
  });

  route('GET', '/healthz', (req, res) => {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  });

  function serveStatic(pathname, res) {
    let rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      // SPA 回退：非 API 的 GET 路径统一返回前端页面（支持 /settings 等路径路由）
      const index = path.join(PUBLIC_DIR, 'index.html');
      sendBuffer(res, 200, fs.readFileSync(index), MIME['.html'], 'no-cache');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    sendBuffer(res, 200, fs.readFileSync(file), MIME[ext] || 'application/octet-stream', 'no-cache');
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    if (!checkAccessToken(req, res, pathname)) return;
    try {
      const matched = routes.find((r) => {
        if (r.method !== req.method) return false;
        const rSegs = r.path.split('/').filter(Boolean);
        const pSegs = pathname.split('/').filter(Boolean);
        if (rSegs.length !== pSegs.length) return false;
        for (let i = 0; i < rSegs.length; i += 1) {
          if (rSegs[i].startsWith(':')) continue;
          if (rSegs[i] !== pSegs[i]) return false;
        }
        return true;
      });
      if (matched) {
        const params = {};
        const rSegs = matched.path.split('/').filter(Boolean);
        const pSegs = pathname.split('/').filter(Boolean);
        rSegs.forEach((seg, i) => {
          if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(pSegs[i]);
        });
        await matched.handler(req, res, params, url.searchParams);
        return;
      }
      if (req.method === 'GET') {
        serveStatic(pathname, res);
        return;
      }
      sendJson(res, 404, { error: '接口不存在' });
    } catch (e) {
      error(`请求处理失败 ${req.method} ${pathname}: ${e.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: e.message });
    }
  });

  setupCron();
  scheduler.start();

  // 启动后自动同步（可配置）
  setTimeout(() => {
    if (store.settings.syncOnStart && store.settings.embyUrl && store.settings.embyApiKey) {
      syncService.runSync({ reason: '服务启动' });
    }
  }, 3000);

  return {
    store,
    syncService,
    webhookService,
    scheduler,
    server,
    listen: () => new Promise((resolve) => {
      server.listen(options.port ?? PORT, options.host ?? HOST, () => resolve(server.address()));
    }),
    close: async () => {
      scheduler.stop();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

async function main() {
  const app = await createApp();
  const addr = await app.listen();
  const token = app.store.settings.accessToken;
  info(`Emby 封面工坊已启动: http://${addr.address === '0.0.0.0' || addr.address === '::' ? 'localhost' : addr.address}:${addr.port}`);
  if (token) info(`访问令牌已启用（在界面右上角或请求头 x-access-token 使用）：${token}`);
  else warn('提示：未设置访问令牌，局域网内任何可访问本服务的人都可以操作；建议在设置中开启');
  info(`Webhook 地址: http://localhost:${addr.port}/api/webhook/emby?token=${app.store.settings.webhookToken}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
