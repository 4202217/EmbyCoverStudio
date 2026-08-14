import { parseCron, nextRunDate } from '../src/scheduler.js';
import { info } from '../src/logger.js';

// 按当前设置重建 cover-sync 定时任务（供 API 与后台启动共用）
export function setupCron(app) {
  const expr = app.store.settings.cron || '0 */6 * * *';
  try {
    parseCron(expr);
    app.scheduler.remove('cover-sync');
    app.scheduler.add('cover-sync', expr, () => app.syncService.runSync({ reason: '定时任务' }));
    info(`定时任务已设置：${expr}`);
  } catch {
    info(`cron 表达式无效：${expr}`);
  }
}

let nextRunCache = { at: 0, expr: '', value: null };

// 计算下一次触发时间（带 60 秒缓存，避免频繁解析 cron）
export function getNextRun(store) {
  const expr = store.settings.cron || '0 */6 * * *';
  const now = Date.now();
  if (nextRunCache.expr === expr && now - nextRunCache.at < 60000) return nextRunCache.value;
  try {
    const d = nextRunDate(parseCron(expr));
    nextRunCache = { at: now, expr, value: d ? d.toISOString() : null };
  } catch {
    nextRunCache = { at: now, expr, value: null };
  }
  return nextRunCache.value;
}
