import { EmbyClient, isRelevantWebhookEvent } from '../emby/client.js';
import { info } from '../logger.js';

export function createWebhookService(store, syncService) {
  let timer = null;
  let pendingIds = new Set();
  let pendingFull = false;
  let lastEvent = '';
  let lastEventAt = '';
  let testArm = null;
  let testResult = null;

  function armTest() {
    testArm = { at: new Date().toISOString() };
    testResult = null;
    return { ok: true };
  }

  function schedule() {
    clearTimeout(timer);
    const ms = Math.max(0, store.settings.webhookDebounceMs);
    timer = setTimeout(() => {
      timer = null;
      const ids = [...pendingIds];
      const full = pendingFull;
      pendingIds = new Set();
      pendingFull = false;
      if (full) {
        info('Webhook 自动更新：未能定位相关合集，执行全量同步');
        syncService.runSync({ reason: 'webhook' }).catch(() => {});
      } else if (ids.length) {
        info(`Webhook 自动更新：精准更新 ${ids.length} 个合集`);
        syncService.runSync({ reason: 'webhook', onlyIds: ids }).catch(() => {});
      } else {
        info('Webhook 自动更新：相关合集均未启用，跳过本次更新');
      }
    }, ms);
    info(`已安排自动更新（${ms}ms 后执行）`);
  }

  // 返回 [] = 已定位但无需更新；返回 id 数组 = 精准更新；返回 null = 定位失败（全量同步兜底）
  async function resolveTargetIds(payload) {
    const event = String(payload?.Event || '').toLowerCase();
    const itemId = payload?.Item?.Id ? String(payload.Item.Id) : '';
    if (!itemId) return null;
    if (event === 'library.new' || event === 'library.updated') {
      const t = store.getTarget(itemId);
      if (!t || t.kind !== 'library') return null;
      return !t.locked ? [t.id] : [];
    }
    if (event === 'collection.updated') {
      const t = store.getTarget(itemId);
      if (!t || t.kind !== 'collection') return null;
      return !t.locked ? [t.id] : [];
    }
    // item.added / item.updated / item.removed：通过祖先查询定位所属媒体库与合集
    const ancestors = await new EmbyClient(store.settings).getItemAncestors(itemId).catch(() => []);
    if (!ancestors.length) return null;
    const ids = new Set(ancestors.map((a) => String(a.id)));
    const matched = store.listTargets().filter((t) => ids.has(t.id) && !t.locked).map((t) => t.id);
    return matched.length ? matched : [];
  }

  async function handle(payload) {
    const event = String(payload?.Event || '').toLowerCase();
    lastEvent = event || '(未知事件)';
    lastEventAt = new Date().toISOString();
    if (testArm) {
      testResult = { event: lastEvent, at: lastEventAt };
      testArm = null;
      info(`已收到测试通知：${lastEvent}`);
    }
    if (!isRelevantWebhookEvent(event)) return { ok: true, handled: false, event };
    const itemName = payload?.Item?.Name || payload?.Item?.Id || '';
    info(`收到 Emby 事件 ${event}（${itemName}），正在定位相关合集`);
    const ids = await resolveTargetIds(payload).catch(() => null);
    if (ids === null) {
      pendingFull = true;
      info('未能定位相关合集，将执行全量同步');
    } else if (ids.length) {
      ids.forEach((id) => pendingIds.add(id));
      info(`定位到 ${ids.length} 个相关合集`);
    } else {
      info('相关合集均未启用，将跳过本次更新');
    }
    schedule();
    return { ok: true, handled: true, event };
  }

  return {
    handle,
    schedule,
    armTest,
    get pending() {
      return Boolean(timer);
    },
    get last() {
      return { event: lastEvent, at: lastEventAt };
    },
    get test() {
      return { armed: Boolean(testArm), result: testResult };
    }
  };
}
