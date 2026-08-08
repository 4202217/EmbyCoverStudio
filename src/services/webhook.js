import { isRelevantWebhookEvent } from '../emby/client.js';
import { info } from '../logger.js';

export function createWebhookService(store, syncService) {
  let timer = null;

  function schedule() {
    clearTimeout(timer);
    const ms = Math.max(0, store.settings.webhookDebounceMs);
    timer = setTimeout(() => {
      timer = null;
      syncService.runSync({ reason: 'webhook' });
    }, ms);
    info(`已安排自动更新（${ms}ms 后执行）`);
  }

  function handle(payload) {
    const event = String(payload?.Event || '').toLowerCase();
    if (!isRelevantWebhookEvent(event)) return { ok: true, handled: false, event };
    const itemName = payload?.Item?.Name || payload?.Item?.Id || '';
    info(`收到 Emby 事件 ${event}（${itemName}），触发封面更新`);
    schedule();
    return { ok: true, handled: true, event };
  }

  return {
    handle,
    schedule,
    get pending() {
      return Boolean(timer);
    }
  };
}
