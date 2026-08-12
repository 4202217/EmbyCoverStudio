import { Store } from '../src/store.js';
import { setLogSink } from '../src/logger.js';
import { Scheduler } from '../src/scheduler.js';
import { createSyncService } from '../src/services/sync.js';
import { createWebhookService } from '../src/services/webhook.js';

// 全局单例：Next.js 各路由与 instrumentation 共享同一份服务状态
export function getApp() {
  if (!globalThis.__ecsApp) {
    const store = new Store();
    setLogSink(store);
    const syncService = createSyncService(store);
    const webhookService = createWebhookService(store, syncService);
    const scheduler = new Scheduler();
    globalThis.__ecsApp = {
      store,
      syncService,
      webhookService,
      scheduler,
      backgroundStarted: false,
      startedAt: Date.now()
    };
  }
  return globalThis.__ecsApp;
}
