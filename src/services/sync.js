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
  if (target?.pickBy === 'manual') return 'manual';
  if (target?.pickBy === 'premiere') return 'premiere';
  if (target?.pickBy === 'added') return 'added';
  return settings.defaultPickByByStyle?.[`${target.kind}-${effectiveStyleOf(target, settings)}`] === 'premiere' ? 'premiere' : 'added';
}

function effectiveStyleOf(target, settings) {
  if (target.kind === 'collection') return 'single';
  const def = settings.styleByKind?.library || 'single';
  return isValidStyle(target.template) ? target.template : (isValidStyle(def) ? def : 'single');
}

function posterNeed(style) {
  if (style === 'wall3') return 9;
  return 1;
}

async function embyCoverFingerprint(client, itemId) {
  try {
    const buf = await client.getOriginalImage(itemId);
    return buf && buf.length ? sha1(buf) : '';
  } catch {
    return '';
  }
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

  async function cachedPoster(client, itemId, maxWidth, imageTag = '') {
    // 缓存文件名带上图片版本号，封面在 Emby 中更新后能自动重新下载
    const tag = String(imageTag || '').replace(/[^a-zA-Z0-9_-]/g, '') || 'default';
    const file = path.join(CACHE_DIR, `${itemId}-${maxWidth}-${tag}.img`);
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

  async function collectPosters(target, client, settings, { pickBy = 'added', manualItemId = '', need = 1 } = {}) {
    // 元数据拉取上限提高，保证副标题数量统计完整（仅下载需要的海报图）
    const raw = await client.getCoverItems(target, 500);
    // 总数始终按整个媒体库/合集的带封面条目统计，手动选择只影响选哪张海报
    const withPrimaryAll = raw.filter((i) => i.hasPrimary);
    let sorted;
    if (pickBy === 'manual' && manualItemId) {
      const manual = withPrimaryAll.find((i) => i.id === String(manualItemId));
      // 手动选择的影片已不存在或无封面时，回退为最新入库
      sorted = manual ? [manual] : sortByPick(withPrimaryAll, 'added');
    } else {
      sorted = sortByPick(raw, pickBy);
    }
    const posterW = Math.max(240, Math.round(settings.width * 0.4));
    const withPrimary = sorted.filter((i) => i.hasPrimary);
    const candidates = withPrimary.slice(0, Math.max(1, need));
    const withPosters = await mapLimit(candidates, 4, async (item) => {
      const poster = await cachedPoster(client, item.id, posterW, item.imageTag);
      return poster ? { ...item, poster } : null;
    }, shouldStop);
    return { posters: withPosters.filter(Boolean), total: withPrimaryAll.length };
  }

  async function buildCover(target, posters, genSettings, style, totalCount = posters.length) {
    const font = resolveFont(genSettings);
    const title = String(target.titleOverride || '').trim() || target.name || '未命名';
    const isBoxsetsLib = target.kind === 'library' && ['boxsets', 'collections'].includes(target.collectionType);
    const subtitle = genSettings.showCount
      ? (isBoxsetsLib ? `共 ${totalCount} 个合集` : `共 ${totalCount} 部作品`)
      : '';
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
    const size = resolveSize(target, settings);
    const defStyle = settings.styleByKind?.[target.kind] || 'single';
    // 合集仅支持单图海报；媒体库支持单图/海报墙（无单独设置时用全局默认）
    const style = target.kind === 'collection'
      ? 'single'
      : (isValidStyle(target.template) ? target.template : (isValidStyle(defStyle) ? defStyle : 'single'));
    const pickBy = effectivePickBy(target, settings);
    const genSettings = { ...(settings.coverByStyle?.[`${target.kind}-${style}`] || {}), width: size.width, height: size.height };
    const settingsHash = sha1(JSON.stringify({ cover: genSettings, template: style, defaultPickBy: pickBy }));
    const { posters, total } = await collectPosters(target, client, genSettings, { pickBy, manualItemId: target.manualItemId, need: posterNeed(style) });
    const hash = sha1(posters.map((p) => `${p.id}:${p.imageTag}`).join('|'));
    const localFile = path.join(COVERS_DIR, `${target.id}.png`);
    let png = null;
    const unchanged = hash === target.itemHash && settingsHash === target.coverSettingsHash;
    // 检测 Emby 中封面是否被外部修改过（如另一实例生成、手动替换），以 Emby 实际封面为准
    const embyHash = await embyCoverFingerprint(client, target.id);
    const coverChangedExternally = Boolean(
      embyHash &&
      target.coverFile &&
      (target.embyCoverHash ? embyHash !== target.embyCoverHash : (target.coverHash ? embyHash !== target.coverHash : false))
    );
    if (!force && unchanged && target.coverFile && !target.needsRegen && !target.needsUpload && !coverChangedExternally) {
      const patch = {};
      if (target.itemCount !== total) {
        patch.itemCount = total;
        patch.posterCount = posters.length;
      }
      const src = posters[0]?.name || '';
      if (target.posterSource !== src) patch.posterSource = src;
      if (embyHash && target.embyCoverHash !== embyHash) patch.embyCoverHash = embyHash;
      if (Object.keys(patch).length) store.updateTarget(target.id, patch);
      return { changed: false };
    }
    const canReuse = !force && unchanged && !coverChangedExternally && target.needsUpload && target.coverFile;
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
      embyCoverHash: embyHash,
      itemCount: total,
      posterCount: posters.length,
      posterSource: posters[0]?.name || '',
      lastGeneratedAt: now,
      needsRegen: false,
      missing: false
    };
    try {
      await client.uploadImage(target.id, png);
      const newEmbyHash = await embyCoverFingerprint(client, target.id);
      store.updateTarget(target.id, {
        ...basePatch,
        embyCoverHash: newEmbyHash || embyHash,
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

  async function runSync({ force = false, reason = '手动', onlyIds = null, onlyKind = null, onlyStyle = null, resume = false } = {}) {
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
        const locked = isNew ? !Boolean(settings.autoEnableNew) : existing.locked;
        store.upsertTarget({
          ...t,
          locked,
          enabled: !locked,
          missing: false,
          itemCount: t.kind === 'collection' ? (t.childCount ?? 0) : (existing?.itemCount ?? 0)
        });
      }
      // 清理 Emby 中已不存在的媒体库/合集（重建媒体库后残留的旧条目）
      const stale = store.listTargets().filter((t) => !seen.has(t.id));
      for (const t of stale) {
        info(`清理已不存在的目标：${t.name}`);
        store.deleteTarget(t.id);
      }
      let targets = store.listTargets().filter((t) => seen.has(t.id));
      if (onlyIds) targets = targets.filter((t) => onlyIds.includes(t.id) && !t.locked);
      else targets = targets.filter((t) => !t.locked);
      if (onlyKind) targets = targets.filter((t) => t.kind === onlyKind);
      if (onlyStyle) targets = targets.filter((t) => effectiveStyleOf(t, settings) === onlyStyle);
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
      const trig = triggerOf(reason);
      const precise = Boolean(onlyIds) && trig === 'webhook';
      const kindLabel = onlyKind === 'library' ? '媒体库' : onlyKind === 'collection' ? '合集' : '';
      const styleLabel = onlyStyle === 'wall3' ? '海报墙' : onlyStyle === 'single' ? '单图海报' : '';
      store.addTask(taskRecord({
        name: onlyStyle ? `按配置重新生成（${kindLabel}·${styleLabel} · ${targets.length} 项）` : (onlyKind ? `按类型重新生成（${kindLabel} · ${targets.length} 项）` : (onlyIds ? (precise ? `精准更新（${targets.length} 项）` : `批量更新（${targets.length} 项）`) : `全量同步（${targets.length} 项）`)),
        type: onlyStyle ? 'sync' : (onlyKind ? 'sync' : (precise ? 'precise' : onlyIds ? 'batch' : 'sync')),
        trigger: trig,
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
      const trig = triggerOf(reason);
      const precise = Boolean(onlyIds) && trig === 'webhook';
      const kindLabel = onlyKind === 'library' ? '媒体库' : onlyKind === 'collection' ? '合集' : '';
      const styleLabel = onlyStyle === 'wall3' ? '海报墙' : onlyStyle === 'single' ? '单图海报' : '';
      store.addTask(taskRecord({
        name: onlyStyle ? `按配置重新生成（${kindLabel}·${styleLabel}）` : (onlyKind ? `按类型重新生成（${kindLabel}）` : (onlyIds ? (precise ? `精准更新（${onlyIds.length} 项）` : `批量更新（${onlyIds.length} 项）`) : '全量同步')),
        type: onlyStyle ? 'sync' : (onlyKind ? 'sync' : (precise ? 'precise' : onlyIds ? 'batch' : 'sync')),
        trigger: trig,
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
      : (overrides.width && overrides.height ? { width: overrides.width, height: overrides.height } : resolveSize(target, settings));
    const defStyle = settings.styleByKind?.[target.kind] || 'single';
    const style = target.kind === 'collection'
      ? 'single'
      : (isValidStyle(overrides.style) ? overrides.style : (isValidStyle(target.template) ? target.template : (isValidStyle(defStyle) ? defStyle : 'single')));
    const pickBy = effectivePickBy(target, store.settings);
    const genSettings = { ...(settings.coverByStyle?.[`${target.kind}-${style}`] || {}), width: size.width, height: size.height };
    if (overrides.backgroundMode === 'poster' || overrides.backgroundMode === 'gradient') {
      genSettings.backgroundMode = overrides.backgroundMode;
    }
    const { posters, total } = await collectPosters(target, client, genSettings, { pickBy, manualItemId: target.manualItemId, need: posterNeed(style) });
    if (!posters.length) throw new Error('未找到任何带封面的影片');
    return buildCover(target, posters, genSettings, style, total);
  }

  // 用指定配置（样式/选图依据/封面元素设置）渲染某个真实媒体库或合集的预览
  async function previewWithSettings(id, { style = 'single', cover = {}, pickBy = 'added' } = {}) {
    const target = store.getTarget(id);
    if (!target) throw new Error('目标不存在');
    const client = await getClient();
    if (!client.configured) throw new Error('未配置 Emby 服务器地址或 API 密钥');
    const size = resolveSize(target, store.settings);
    const genSettings = { ...cover, width: size.width, height: size.height };
    const { posters, total } = await collectPosters(target, client, genSettings, {
      pickBy: pickBy === 'premiere' ? 'premiere' : 'added',
      manualItemId: target.manualItemId,
      need: posterNeed(style)
    });
    if (!posters.length) throw new Error('未找到任何带封面的影片');
    return buildCover(target, posters, genSettings, style, total);
  }

  return { state, runSync, syncById, previewById, previewWithSettings, requestPause, requestCancel, resume };
}
