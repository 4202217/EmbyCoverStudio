import { Store } from '../src/store.js';
import { setLogSink } from '../src/logger.js';
import { Scheduler } from '../src/scheduler.js';
import { createSyncService } from '../src/services/sync.js';
import { createWebhookService } from '../src/services/webhook.js';

// 工厂：构建一套完整的服务实例（可注入 Store，便于测试）
export function createApp({ store: providedStore } = {}) {
  const store = providedStore || new Store();
  setLogSink(store);
  const syncService = createSyncService(store);
  const webhookService = createWebhookService(store, syncService);
  const scheduler = new Scheduler();
  return {
    store,
    syncService,
    webhookService,
    scheduler,
    backgroundStarted: false,
    startedAt: Date.now(),
    close() {
      scheduler.stop();
      store.flush();
    }
  };
}

// 全局单例：Next.js 各路由与 instrumentation 共享同一份服务状态
export function getApp() {
  if (!globalThis.__ecsApp) {
    const app = createApp();
    // 进程自然退出前落盘，避免 debounce 的写盘丢失
    const flush = () => app.store.flush();
    process.once('beforeExit', flush);
    // Docker stop / 系统关机发 SIGTERM/SIGINT：先落盘，再移除自己并重新触发信号，保留 Next 优雅退出
    const onSignal = (sig) => {
      try {
        flush();
      } catch {
        // 落盘失败不阻塞退出
      }
      process.removeListener(sig, onSignal);
      process.kill(process.pid, sig);
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    globalThis.__ecsApp = app;
  }
  return globalThis.__ecsApp;
}
