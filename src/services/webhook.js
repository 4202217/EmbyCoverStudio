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
    const itemType = String(payload?.Item?.Type || '');
    const isLibFolder = itemType === 'CollectionFolder' || itemType === 'Folder';
    if (!itemId) {
      info(`Webhook 事件 ${event} 缺少 Item.Id，无法定位，将执行全量同步`);
      return null;
    }
    if (event === 'library.new' || event === 'library.updated') {
      if (isLibFolder) {
        const t = store.getTarget(itemId);
        if (!t || t.kind !== 'library') {
          info(`Webhook 事件 ${event}（${itemId}）未匹配到媒体库目标，将执行全量同步`);
          return null;
        }
        return !t.locked ? [t.id] : [];
      }
      // 插件会把新媒体项也发成 library.new（Item.Type 为媒体类型），按条目定位
      info(`Webhook 事件 ${event} 的条目类型为 ${itemType || '未知'}，按媒体条目精准定位`);
    }
    if (event === 'collection.updated') {
      const t = store.getTarget(itemId);
      if (!t || t.kind !== 'collection') {
        info(`Webhook 事件 ${event}（${itemId}）未匹配到合集目标，将执行全量同步`);
        return null;
      }
      return !t.locked ? [t.id] : [];
    }
    // item 类事件（含插件把新媒体发成 library.new 的情况）：先祖先查询，再按路径定位
    const client = new EmbyClient(store.settings);
    const ancestors = await client.getItemAncestors(itemId).catch((e) => {
      info(`Webhook 祖先查询失败（${itemId}）：${e.message}`);
      return [];
    });
    const ids = new Set(ancestors.map((a) => String(a.id)));
    const matched = store.listTargets().filter((t) => ids.has(t.id) && !t.locked).map((t) => t.id);
    info(`Webhook 祖先定位：${ancestors.map((a) => `${a.id}:${a.name || a.type}`).join(', ')}，匹配目标 ${matched.length} 个`);
    if (!matched.length) {
      // Ancestors 只返回物理文件夹，不含媒体库本身：沿父级链 / 文件路径找媒体库
      const lib = await client.findLibraryOfItem(itemId).catch(() => null);
      let libByPath = null;
      try {
        const info = await client.getItemInfo(itemId, 'Path').catch(() => null);
        const itemPath = info?.Path || String(payload?.Item?.Path || '');
        if (itemPath) {
          const libs = await client.getLibraries();
          const norm = (p) => String(p || '').replace(/\/+$/, '');
          libByPath = libs.find((l) => (l.locations || []).some((loc) => {
            const base = norm(loc);
            return base && itemPath.startsWith(base);
          })) || null;
        }
      } catch {
        libByPath = null;
      }
      const found = lib || libByPath;
      if (found) {
        const t = store.getTarget(found.id);
        if (t && !t.locked) {
          info(`媒体库定位（${libByPath ? '路径' : '父级链'}）：${found.id}:${found.name}`);
          return [t.id];
        }
      }
    }
    return matched;
  }

  async function handle(payload) {
    const event = String(payload?.Event || '').toLowerCase();
    lastEvent = event || '(未知事件)';
    lastEventAt = new Date().toISOString();
    info(`Webhook 原始事件：${JSON.stringify({
      event: payload?.Event,
      itemId: payload?.Item?.Id,
      itemName: payload?.Item?.Name,
      itemType: payload?.Item?.Type,
      path: payload?.Item?.Path,
      parentId: payload?.Item?.ParentId
    })}`);
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
