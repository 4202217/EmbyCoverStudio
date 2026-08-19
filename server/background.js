import { getApp } from './app.js';
import { setupCron } from './cron.js';

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
}
