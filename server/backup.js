import { info, error } from '../src/logger.js';

export function buildBackupData(store) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: store.settings,
    targets: store.listTargets(),
    tasks: store.data.tasks
  };
}

export function buildWebdavBackupData(store) {
  const mask = store.settings.webdavSync || {};
  const syncSettings = mask.settings !== false;
  const syncTargets = mask.targets !== false;
  const syncTasks = mask.tasks !== false;
  return {
    version: 1,
    webdavMask: { settings: syncSettings, targets: syncTargets, tasks: syncTasks },
    exportedAt: new Date().toISOString(),
    settings: syncSettings ? store.settings : null,
    targets: syncTargets ? store.listTargets() : null,
    tasks: syncTasks ? store.data.tasks : null
  };
}

function webdavAuth(settings) {
  return 'Basic ' + Buffer.from(`${settings.webdavUser || ''}:${settings.webdavPassword || ''}`).toString('base64');
}

function webdavUrlOf(settings) {
  const base = String(settings.webdavUrl || '').replace(/\/+$/, '');
  const file = String(settings.webdavFile || 'backup.json').replace(/^\/+/, '');
  return `${base}/${file}`;
}

export async function webdavPut(settings, data) {
  const url = webdavUrlOf(settings);
  const headers = { Authorization: webdavAuth(settings), 'Content-Type': 'application/json' };
  const body = JSON.stringify(data);
  let res = await fetch(url, { method: 'PUT', headers, body });
  if (!res.ok) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      parts.pop();
      let cur = `${u.origin}`;
      for (const p of parts) {
        cur += '/' + p;
        await fetch(cur, { method: 'MKCOL', headers: { Authorization: webdavAuth(settings) } }).catch(() => {});
      }
      res = await fetch(url, { method: 'PUT', headers, body });
    } catch {
      // 目录创建失败，按原状态返回
    }
  }
  if (!res.ok) throw new Error(`WebDAV 上传失败（HTTP ${res.status}）`);
  return url;
}

export async function webdavGet(settings) {
  const res = await fetch(webdavUrlOf(settings), { headers: { Authorization: webdavAuth(settings) } });
  if (!res.ok) throw new Error(`WebDAV 下载失败（HTTP ${res.status}）`);
  return res.json();
}

export function webdavTestUrl(settings) {
  return webdavUrlOf(settings);
}

export { info, error };
