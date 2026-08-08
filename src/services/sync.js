import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { EmbyClient } from '../emby/client.js';
import { generateCover } from '../covers/generator.js';
import { resolveFont } from '../covers/fonts.js';
import { resolveSize, isValidStyle, SIZE_PRESETS } from '../covers/styles.js';
import { COVERS_DIR, CACHE_DIR } from '../config.js';
import { info, warn, error } from '../logger.js';

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function triggerOf(reason = '') {
  const r = String(reason);
  if (r.includes('定时')) return 'scheduler';
  if (r.toLowerCase().includes('webhook')) return 'webhook';
  if (r.includes('启动')) return 'startup';
  if (r.includes('继续')) return 'resume';
  if (r.includes('批量')) return 'batch';
  if (r.includes('启用')) return 'enable';
  return 'manual';
}

function taskRecord({ name, type, trigger, status, updated = 0, unchanged = 0, failed = 0, error = '' }) {
  return { name, type, trigger, status, updated, unchanged, failed, error };
}

function effectivePickBy(target, settings) {
  if (target?.pickBy === 'premiere') return 'premiere';
  if (target?.pickBy === 'added') return 'added';
  return settings.defaultPickBy === 'premiere' ? 'premiere' : 'added';
}

async function mapLimit(items, limit, fn, shouldStop) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      if (shouldStop && shouldStop()) return;
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export function createSyncService(store) {
  const state = {
    running: false,
    status: 'idle',
    pauseRequested: false,
    cancelRequested: false,
    lastRun: '',
    lastReason: '',
    lastError: '',
    counts: {},
    queueTotal: 0,
    queueDone: 0,
    queueCurrent: '',
    queueUpdated: 0,
    queueFailed: 0,
    queueUnchanged: 0,
    remainingIds: []
  };

  function shouldStop() {
    return state.cancelRequested || state.pauseRequested;
  }

  async function getClient() {
    return new EmbyClient(store.settings);
  }

  async function cachedPoster(client, itemId, maxWidth) {
    const file = path.join(CACHE_DIR, `${itemId}-${maxWidth}.img`);
    try {
      return await fs.readFile(file);
    } catch {
      // 未命中缓存，继续下载
    }
    const buf = await client.getImage(itemId, maxWidth).catch(() => null);
    if (buf) await fs.writeFile(file, buf).catch(() => {});
    return buf;
  }

  function sortByPick(items, pickBy) {
    if (pickBy === 'premiere') {
      return [...items].sort(
        (a, b) => (b.premiereDate || '').localeCompare(a.premiereDate || '') || (b.dateCreated || '').localeCompare(a.dateCreated || '')
      );
    }
    return [...items].sort((a, b) => (b.dateCreated || '').localeCompare(a.dateCreated || ''));
  }

  async function collectPosters(target, client, settings, { single = false, pickBy = 'added' } = {}) {
    // 元数据拉取上限提高，保证副标题数量统计完整（仅下载需要的海报图）
    const raw = await client.getCoverItems(target, 500);
    const sorted = single ? sortByPick(raw, pickBy) : raw;
    const posterW = Math.max(160, Math.round(settings.width / Math.max(1, settings.columns)) + 40);
    const limit = single ? 1 : settings.maxItems;
    const withPrimary = sorted.filter((i) => i.hasPrimary);
    const candidates = withPrimary.slice(0, limit);
    const withPosters = await mapLimit(candidates, 4, async (item) => {
      const poster = await cachedPoster(client, item.id, posterW);
      return poster ? { ...item, poster } : null;
    }, shouldStop);
    return { posters: withPosters.filter(Boolean), total: withPrimary.length };
  }

  async function buildCover(target, posters, genSettings, style, totalCount = posters.length) {
    const font = resolveFont(genSettings);
    const title = String(target.titleOverride || '').trim() || target.name || '未命名';
    const subtitle = genSettings.showCount ? `共 ${totalCount} 部作品` : '';
    return generateCover({
      title,
      subtitle,
      posters: posters.map((p) => p.poster),
      settings: genSettings,
      style,
      font
    });
  }

  async function syncTarget(target, client, { force = false } = {}) {
    const settings = store.settings;
    const size = resolveSize(target, settings.cover);
    const style = isValidStyle(target.template) ? target.template : 'single';
    const pickBy = effectivePickBy(target, settings);
    const genSettings = { ...settings.cover, width: size.width, height: size.height };
    const settingsHash = sha1(JSON.stringify({ cover: genSettings, template: style, defaultPickBy: pickBy }));
    const { posters, total } = await collectPosters(target, client, genSettings, { single: style === 'single', pickBy });
    const hash = sha1(posters.map((p) => `${p.id}:${p.imageTag}`).join('|'));
    const localFile = path.join(COVERS_DIR, `${target.id}.png`);
    let png = null;
    const unchanged = hash === target.itemHash && settingsHash === target.coverSettingsHash;
    if (!force && unchanged && target.coverFile && !target.needsRegen && !target.needsUpload) {
      if (target.itemCount !== total) store.updateTarget(target.id, { itemCount: total, posterCount: posters.length });
      return { changed: false };
    }
    const canReuse = !force && unchanged && target.needsUpload && target.coverFile;
    if (canReuse) png = await fs.readFile(localFile).catch(() => null);
    if (!png) {
      if (!posters.length) throw new Error('未找到任何带封面的影片');
      png = await buildCover(target, posters, genSettings, style, total);
    }
    await fs.writeFile(localFile, png);
    const now = new Date().toISOString();
    const basePatch = {
      itemHash: hash,
      coverSettingsHash: settingsHash,
      coverFile: `${target.id}.png`,
      coverHash: sha1(png),
      itemCount: total,
      posterCount: posters.length,
      lastGeneratedAt: now,
      needsRegen: false,
      missing: false
    };
    try {
      await client.uploadImage(target.id, png);
      store.updateTarget(target.id, {
        ...basePatch,
        lastError: '',
        needsUpload: false
      });
      return { changed: true, count: posters.length };
    } catch (e) {
      store.updateTarget(target.id, {
        ...basePatch,
        lastError: `封面已生成到本地，但上传 Emby 失败：${e.message}`,
        needsUpload: true
      });
      throw new Error(`封面已生成到本地，但上传 Emby 失败：${e.message}`);
    }
  }

  async function runSync({ force = false, reason = '手动', onlyIds = null, resume = false } = {}) {
    if (state.running) return { skipped: true, reason };
    state.running = true;
    state.pauseRequested = false;
    state.cancelRequested = false;
    if (!resume) {
      state.queueTotal = 0;
      state.queueDone = 0;
      state.queueCurrent = '';
      state.queueUpdated = 0;
      state.queueFailed = 0;
      state.queueUnchanged = 0;
      state.remainingIds = [];
    }
    state.status = 'running';
    state.lastRun = new Date().toISOString();
    state.lastReason = reason;
    state.lastError = '';
    info(`开始同步（${reason}${force ? '，强制更新' : ''}）`);
    try {
      const client = await getClient();
      if (!client.configured) throw new Error('未配置 Emby 服务器地址或 API 密钥');
      const [libraries, collections] = await Promise.all([client.getLibraries(), client.getCollections()]);
      const embyTargets = [...libraries, ...collections];
      const seen = new Set();
      const settings = store.settings;
      for (const t of embyTargets) {
        seen.add(t.id);
        const existing = store.getTarget(t.id);
        const isNew = !existing;
        store.upsertTarget({
          ...t,
          enabled: isNew ? Boolean(settings.autoEnableNew) : existing.enabled,
          missing: false,
          itemCount: t.kind === 'collection' ? (t.childCount ?? 0) : (existing?.itemCount ?? 0)
        });
      }
      for (const t of store.listTargets()) {
        if (!seen.has(t.id) && !t.missing) store.updateTarget(t.id, { missing: true });
      }
      let targets = store.listTargets().filter((t) => seen.has(t.id));
      if (onlyIds) targets = targets.filter((t) => onlyIds.includes(t.id));
      else targets = targets.filter((t) => t.enabled);
      if (!resume) state.queueTotal = targets.length;
      let updated = 0;
      let unchanged = 0;
      let failed = 0;
      for (let i = 0; i < targets.length; i += 1) {
        const t = targets[i];
        if (state.cancelRequested) {
          state.status = 'cancelled';
          break;
        }
        if (state.pauseRequested) {
          state.status = 'paused';
          state.remainingIds = targets.slice(i).map((x) => x.id);
          break;
        }
        state.queueCurrent = t.name;
        try {
          const r = await syncTarget(t, client, { force });
          if (r.changed) updated += 1;
          else unchanged += 1;
        } catch (e) {
          failed += 1;
          warn(`同步失败 ${t.name}：${e.message}`);
        }
        state.queueDone += 1;
        state.queueUpdated = updated;
        state.queueFailed = failed;
        state.queueUnchanged = unchanged;
      }
      if (state.status === 'running') {
        state.status = 'done';
        state.queueCurrent = '';
      }
      state.counts = { updated, unchanged, failed };
      store.addTask(taskRecord({
        name: onlyIds ? `批量更新（${targets.length} 项）` : `全量同步（${targets.length} 项）`,
        type: onlyIds ? 'batch' : 'sync',
        trigger: triggerOf(reason),
        status: state.status === 'done' ? 'success' : state.status,
        updated,
        unchanged,
        failed
      }));
      info(`同步${state.status === 'cancelled' ? '已取消' : state.status === 'paused' ? '已暂停' : '完成'}：更新 ${updated} 个，无变化 ${unchanged} 个，失败 ${failed} 个`);
      return { ok: true, updated, unchanged, failed, status: state.status };
    } catch (e) {
      state.lastError = e.message;
      state.status = 'failed';
      store.addTask(taskRecord({
        name: onlyIds ? `批量更新（${onlyIds.length} 项）` : '全量同步',
        type: onlyIds ? 'batch' : 'sync',
        trigger: triggerOf(reason),
        status: 'failed',
        error: e.message
      }));
      error(`同步失败：${e.message}`);
      return { ok: false, error: e.message };
    } finally {
      state.running = false;
    }
  }

  function requestPause() {
    if (state.running) {
      state.pauseRequested = true;
      return { ok: true };
    }
    return { ok: false, error: '当前没有正在执行的任务' };
  }

  function requestCancel() {
    if (state.running) {
      state.cancelRequested = true;
      return { ok: true };
    }
    if (state.status === 'paused' || state.status === 'cancelled') {
      state.status = 'idle';
      state.remainingIds = [];
      state.queueTotal = 0;
      state.queueDone = 0;
      state.queueCurrent = '';
      return { ok: true, cleared: true };
    }
    return { ok: false, error: '当前没有任务' };
  }

  function resume() {
    if (state.running) return { ok: false, error: '任务正在进行中' };
    const ids = state.remainingIds;
    if (!ids.length) return { ok: false, error: '没有可继续的任务' };
    state.remainingIds = [];
    state.status = 'running';
    runSync({ force: true, reason: '继续任务', onlyIds: ids, resume: true }).catch(() => {});
    return { ok: true, started: true, remaining: ids.length };
  }

  async function syncById(id, { force = true, reason = '手动' } = {}) {
    const target = store.getTarget(id);
    if (!target) return { ok: false, error: '目标不存在' };
    if (state.running) return { ok: false, error: '同步正在进行中，请稍后再试', busy: true };
    state.running = true;
    state.status = 'running';
    state.queueTotal = 1;
    state.queueDone = 0;
    state.queueCurrent = target.name;
    state.queueUpdated = 0;
    state.queueFailed = 0;
    state.queueUnchanged = 0;
    state.remainingIds = [];
    state.lastRun = new Date().toISOString();
    state.lastReason = reason;
    info(`开始生成封面（${reason}）：${target.name}`);
    try {
      const client = await getClient();
      if (!client.configured) throw new Error('未配置 Emby 服务器地址或 API 密钥');
      const r = await syncTarget(target, client, { force });
      state.queueDone = 1;
      state.status = 'done';
      store.addTask(taskRecord({
        name: target.name,
        type: 'single',
        trigger: triggerOf(reason),
        status: 'success',
        updated: r.changed ? 1 : 0,
        unchanged: r.changed ? 0 : 1
      }));
      return { ok: true, ...r };
    } catch (e) {
      state.status = 'failed';
      store.addTask(taskRecord({
        name: target.name,
        type: 'single',
        trigger: triggerOf(reason),
        status: 'failed',
        error: e.message
      }));
      return { ok: false, error: e.message };
    } finally {
      state.running = false;
    }
  }

  async function previewById(id, overrides = {}) {
    const target = store.getTarget(id);
    if (!target) throw new Error('目标不存在');
    const client = await getClient();
    if (!client.configured) throw new Error('未配置 Emby 服务器地址或 API 密钥');
    const settings = store.settings;
    const size = overrides.size && SIZE_PRESETS[overrides.size]
      ? SIZE_PRESETS[overrides.size]
      : (overrides.width && overrides.height ? { width: overrides.width, height: overrides.height } : resolveSize(target, settings.cover));
    const style = isValidStyle(overrides.style) ? overrides.style : (isValidStyle(target.template) ? target.template : 'single');
    const pickBy = effectivePickBy(target, store.settings);
    const genSettings = { ...settings.cover, width: size.width, height: size.height };
    if (overrides.backgroundMode === 'poster' || overrides.backgroundMode === 'gradient') {
      genSettings.backgroundMode = overrides.backgroundMode;
    }
    const { posters, total } = await collectPosters(target, client, genSettings, { single: style === 'single', pickBy });
    if (!posters.length) throw new Error('未找到任何带封面的影片');
    return buildCover(target, posters, genSettings, style, total);
  }

  return { state, runSync, syncById, previewById, requestPause, requestCancel, resume };
}
