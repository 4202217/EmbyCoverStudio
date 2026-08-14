import { info, error } from '../src/logger.js';
import { getApp } from './app.js';
import { setupCron } from './cron.js';
import { buildWebdavBackupData, webdavPut } from './backup.js';

export function startBackground() {
  const app = getApp();
  if (app.backgroundStarted) return;
  app.backgroundStarted = true;
  const { store, syncService, scheduler } = app;

  setupCron(app);
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
