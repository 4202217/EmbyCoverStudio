import { info, error } from '../src/logger.js';
import { parseCron } from '../src/scheduler.js';
import { getApp } from './app.js';
import { buildWebdavBackupData, webdavPut } from './backup.js';

export function startBackground() {
  const app = getApp();
  if (app.backgroundStarted) return;
  app.backgroundStarted = true;
  const { store, syncService, scheduler } = app;

  function setupCron() {
    const expr = store.settings.cron || '0 */6 * * *';
    try {
      parseCron(expr);
      scheduler.remove('cover-sync');
      scheduler.add('cover-sync', expr, () => syncService.runSync({ reason: '定时任务' }));
      info(`定时任务已设置：${expr}`);
    } catch {
      info(`cron 表达式无效：${expr}`);
    }
  }

  setupCron();
  scheduler.start();

  setTimeout(() => {
    if (store.settings.syncOnStart && store.settings.embyUrl && store.settings.embyApiKey) {
      syncService.runSync({ reason: '服务启动' });
    }
  }, 3000);

  const webdavTimer = setInterval(() => {
    const s = store.settings;
    if (!s.webdavAutoBackup || !s.webdavUrl || !s.webdavUser) return;
    const last = s.webdavLastBackup ? new Date(s.webdavLastBackup).getTime() : 0;
    const hours = Math.max(1, Number(s.webdavIntervalHours) || 24);
    if (Date.now() - last >= hours * 3600000) {
      info('执行 WebDAV 自动备份');
      webdavPut(s, buildWebdavBackupData(store))
        .then(() => store.updateSettings({ webdavLastBackup: new Date().toISOString() }))
        .catch((e) => error(`WebDAV 自动备份失败：${e.message}`));
    }
  }, 60000);
  if (app.webdavTimer) clearInterval(app.webdavTimer);
  app.webdavTimer = webdavTimer;
}
