import fs from 'node:fs';
import crypto from 'node:crypto';
import { DB_FILE, DATA_DIR, COVERS_DIR, CACHE_DIR } from './config.js';
import { isValidStyle, pickDefault } from './covers/styles.js';

export function randomToken(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

export function defaultSettings() {
  return {
    embyUrl: '',
    embyApiKey: '',
    webhookToken: randomToken(),
    accessToken: '',
    defaultPickByByStyle: {
      'library-single': 'added',
      'library-wall': 'added',
      'collection-single': 'added'
    },
    cron: '0 */6 * * *',
    autoEnableNew: true,
    syncOnStart: true,
    excludeUsedPosters: false,
    outputFormat: 'png',
    webhookDebounceMs: 20000,
    coverByStyle: {
      'library-single': {
        titleSize: 84,
        subtitleSize: 36,
        titleColor: '#ffffff',
        subtitleColor: '#c9d6f2',
        bgTop: '#17233d',
        bgBottom: '#0a0f1c',
        backgroundMode: 'gradient',
        accent: '#00a4dc',
        radius: 20,
        cellBorder: 2,
        showCount: true,
        fontFamily: 'Noto Sans CJK SC',
        fontFile: ''
      },
      'library-wall': {
        titleSize: 84,
        subtitleSize: 36,
        titleColor: '#ffffff',
        subtitleColor: '#c9d6f2',
        bgTop: '#17233d',
        bgBottom: '#0a0f1c',
        backgroundMode: 'gradient',
        accent: '#00a4dc',
        radius: 20,
        cellBorder: 2,
        showCount: true,
        fontFamily: 'Noto Sans CJK SC',
        fontFile: ''
      },
      'collection-single': {
        titleSize: 84,
        subtitleSize: 36,
        titleColor: '#ffffff',
        subtitleColor: '#c9d6f2',
        bgTop: '#17233d',
        bgBottom: '#0a0f1c',
        backgroundMode: 'gradient',
        accent: '#00a4dc',
        radius: 20,
        cellBorder: 2,
        showCount: true,
        fontFamily: 'Noto Sans CJK SC',
        fontFile: ''
      }
    }
  };
}

const COVER_NUM_FIELDS = ['titleSize', 'subtitleSize', 'radius', 'cellBorder'];
const COVER_BOOL_FIELDS = ['showCount'];
const COVER_STR_FIELDS = ['titleColor', 'subtitleColor', 'bgTop', 'bgBottom', 'backgroundMode', 'accent', 'fontFamily', 'fontFile'];

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizeCover(patch) {
  const cover = { ...defaultSettings().coverByStyle['library-single'], ...(patch || {}) };
  for (const k of COVER_NUM_FIELDS) {
    if (patch && k in patch) cover[k] = clampInt(patch[k], 1, 8192, defaultSettings().coverByStyle['library-single'][k]);
  }
  for (const k of COVER_BOOL_FIELDS) {
    if (patch && k in patch) cover[k] = !!patch[k];
  }
  for (const k of COVER_STR_FIELDS) {
    if (patch && k in patch) cover[k] = String(patch[k] ?? '').trim();
  }
  // 尺寸由目标类型固定决定（媒体库 16:9 / 合集 2:3），不接受配置
  delete cover.width;
  delete cover.height;
  return cover;
}

function sanitizeSettings(patch) {
  const out = {};
  if ('embyUrl' in patch) out.embyUrl = String(patch.embyUrl || '').trim();
  if ('embyApiKey' in patch) out.embyApiKey = String(patch.embyApiKey || '').trim();
  if ('webhookToken' in patch) out.webhookToken = String(patch.webhookToken || '').trim();
  if ('accessToken' in patch) out.accessToken = String(patch.accessToken || '').trim();
  if ('defaultPickBy' in patch) {
    // 兼容旧字段：同时写入三套默认值
    const d = patch.defaultPickBy === 'premiere' ? 'premiere' : 'added';
    out.defaultPickByByStyle = { 'library-single': d, 'library-wall': d, 'collection-single': d };
  }
  if ('defaultPickByByKind' in patch) {
    const s = patch.defaultPickByByKind || {};
    const lib = pickDefault(s.library);
    const col = pickDefault(s.collection);
    out.defaultPickByByStyle = {
      'library-single': lib,
      'library-wall': lib,
      'collection-single': col
    };
  }
  if ('defaultPickByByStyle' in patch) {
    const s = patch.defaultPickByByStyle || {};
    out.defaultPickByByStyle = {
      'library-single': pickDefault(s['library-single']),
      'library-wall': pickDefault(s['library-wall']),
      'collection-single': pickDefault(s['collection-single'])
    };
  }
  if ('cover' in patch) {
    // 兼容旧字段：同时应用到三套配置
    const c = sanitizeCover(patch.cover);
    out.coverByStyle = { 'library-single': c, 'library-wall': c, 'collection-single': c };
  }
  if ('coverByKind' in patch) {
    const c = patch.coverByKind || {};
    out.coverByStyle = {
      'library-single': sanitizeCover(c.library),
      'library-wall': sanitizeCover(c.library),
      'collection-single': sanitizeCover(c.collection)
    };
  }
  if ('coverByStyle' in patch) {
    const c = patch.coverByStyle || {};
    out.coverByStyle = {
      'library-single': sanitizeCover(c['library-single']),
      'library-wall': sanitizeCover(c['library-wall']),
      'collection-single': sanitizeCover(c['collection-single'])
    };
  }
  if ('cron' in patch) out.cron = String(patch.cron || '0 */6 * * *').trim();
  if ('autoEnableNew' in patch) out.autoEnableNew = !!patch.autoEnableNew;
  if ('syncOnStart' in patch) out.syncOnStart = !!patch.syncOnStart;
  if ('excludeUsedPosters' in patch) out.excludeUsedPosters = !!patch.excludeUsedPosters;
  if ('outputFormat' in patch) out.outputFormat = patch.outputFormat === 'webp' ? 'webp' : 'png';
  if ('webhookDebounceMs' in patch) out.webhookDebounceMs = clampInt(patch.webhookDebounceMs, 0, 600000, 20000);
  return out;
}

function deepMerge(base, patch) {
  for (const k of Object.keys(patch || {})) {
    const pv = patch[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv) && base[k] && typeof base[k] === 'object') {
      deepMerge(base[k], pv);
    } else {
      base[k] = pv;
    }
  }
  return base;
}

export class Store {
  constructor(file = DB_FILE) {
    this.file = file;
    this.data = null;
    this._saveTimer = null;
    this._saveDelayMs = 200;
    this.load();
  }

  load() {
    for (const dir of [DATA_DIR, COVERS_DIR, CACHE_DIR]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      raw = null;
    }
    const fresh = {
      settings: defaultSettings(),
      targets: {},
      acknowledged: { targets: {}, tasks: {} },
      logs: [],
      tasks: []
    };
    this.data = deepMerge(fresh, raw || {});
    // 迁移：cover / defaultPickBy 拆分为媒体库、合集各自一套
    const st = this.data.settings;
    // 迁移：移除 WebDAV 同步功能，清理历史残留设置
    for (const k of ['webdavUrl', 'webdavUser', 'webdavPassword', 'webdavFile', 'webdavAutoBackup', 'webdavIntervalHours', 'webdavLastBackup', 'webdavSync']) {
      delete st[k];
    }
    if (st.cover !== undefined) {
      const oldCover = st.cover || {};
      st.coverByKind = {
        library: { ...st.coverByKind, ...oldCover, width: 1600, height: 900 },
        collection: { ...st.coverByKind, ...oldCover, width: 1000, height: 1500 }
      };
      delete st.cover;
    }
    if (st.defaultPickBy !== undefined) {
      const d = st.defaultPickBy === 'premiere' ? 'premiere' : 'added';
      st.defaultPickByByKind = { library: d, collection: d };
      delete st.defaultPickBy;
    }
    if (st.defaultPickByByKind !== undefined) {
      const lib = st.defaultPickByByKind.library === 'premiere' ? 'premiere' : 'added';
      const col = st.defaultPickByByKind.collection === 'premiere' ? 'premiere' : 'added';
      st.defaultPickByByStyle = {
        'library-single': lib,
        'library-wall': lib,
        'collection-single': col
      };
      delete st.defaultPickByByKind;
    }
    if (st.coverByKind !== undefined) {
      const lib = st.coverByKind.library || {};
      const col = st.coverByKind.collection || {};
      st.coverByStyle = {
        'library-single': { ...(st.coverByStyle?.['library-single'] || {}), ...lib, width: 1600, height: 900 },
        'library-wall': { ...(st.coverByStyle?.['library-wall'] || {}), ...lib, width: 1600, height: 900 },
        'collection-single': { ...(st.coverByStyle?.['collection-single'] || {}), ...col, width: 1000, height: 1500 }
      };
      delete st.coverByKind;
    }
    // 迁移：旧墙样式 wall3/wall5/wall-h 统一 → 竖向 wall-v
    const cbs = st.coverByStyle || {};
    if (cbs['library-wall3']) {
      cbs['library-wall'] = { ...(cbs['library-wall'] || {}), ...cbs['library-wall3'] };
      delete cbs['library-wall3'];
    }
    delete cbs['library-wall5'];
    const dpp = st.defaultPickByByStyle || {};
    if (dpp['library-wall3'] !== undefined) dpp['library-wall'] = dpp['library-wall3'];
    delete dpp['library-wall3'];
    delete dpp['library-wall5'];
    for (const t of Object.values(this.data.targets)) {
      if (t.template === 'wall3' || t.template === 'wall5' || t.template === 'wall-h') t.template = 'wall-v';
    }
    // 迁移：清理非法样式模板（未配置的媒体库固定使用单图海报）
    for (const t of Object.values(this.data.targets)) {
      if (t.template && !isValidStyle(t.template)) t.template = '';
    }
    // 迁移：尺寸由目标类型固定决定，清理历史遗留的 width/height 配置
    for (const key of Object.keys(this.data.settings.coverByStyle || {})) {
      const c = this.data.settings.coverByStyle[key];
      if (c && typeof c === 'object') {
        delete c.width;
        delete c.height;
      }
    }
    // 迁移：旧版本把「跟随全局默认」误存成了 added，统一改为空值
    if (!this.data.settings.pickByMigrated) {
      for (const t of Object.values(this.data.targets)) {
        if (t.pickBy === 'added') t.pickBy = '';
      }
      this.data.settings.pickByMigrated = true;
    }
    // 迁移：为旧数据补齐手动选图/锁定/Emby 封面指纹字段
    for (const t of Object.values(this.data.targets)) {
      if (t.manualItemId === undefined) t.manualItemId = '';
      if (t.manualItemName === undefined) t.manualItemName = '';
      if (t.locked === undefined) {
        // 旧版「停用」等价于新版的「锁定（不监控）」
        t.locked = t.enabled === false;
        t.enabled = !t.locked;
      }
      if (t.configured === undefined) {
        // 只有明确保存过配置（如手动选片）才视为手动配置
        t.configured = Boolean(t.manualItemId);
      }
      if (t.embyCoverTag === undefined) t.embyCoverTag = '';
      if (t.chosenItemId === undefined) t.chosenItemId = '';
      // 旧版存的是封面内容哈希，与新的图片 tag 不可比，直接丢弃
      if (t.embyCoverHash !== undefined) delete t.embyCoverHash;
    }
    // 加载后立即落盘一次（持久化迁移结果），不经过 debounce
    this.saveSync();
  }

  // 合并高频写入：多次 save() 在极短时间内只落盘一次，避免同步阻塞事件循环
  save() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.saveSync();
    }, this._saveDelayMs);
  }

  saveSync() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // 立即落盘（进程退出、测试收尾等场景），并取消未决的 debounce
  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this.saveSync();
  }

  get settings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    deepMerge(this.data.settings, sanitizeSettings(patch || {}));
    this.save();
    return this.data.settings;
  }

  listTargets() {
    return Object.values(this.data.targets).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  getTarget(id) {
    return this.data.targets[String(id)] || null;
  }

  upsertTarget(partial) {
    const id = String(partial.id);
    const existing = this.data.targets[id] || {
      id,
      kind: 'collection',
      name: '',
      collectionType: '',
      enabled: true,
      template: '',
      titleOverride: '',
      configured: false,
      lastTrigger: '',
      itemHash: '',
      coverFile: '',
      coverHash: '',
      embyCoverTag: '',
      chosenItemId: '',
      itemCount: 0,
      posterCount: 0,
      manualItemId: '',
      manualItemName: '',
      locked: false,
      lastGeneratedAt: '',
      lastError: '',
      missing: false,
      needsRegen: false,
      pickBy: ''
    };
    this.data.targets[id] = { ...existing, ...partial, id };
    this.save();
    return this.data.targets[id];
  }

  updateTarget(id, patch) {
    const target = this.getTarget(id);
    if (!target) return null;
    Object.assign(target, patch);
    // 错误状态发生变化（清除或变为新错误）时，重置该目标的已读标记
    if ('lastError' in patch) delete this.data.acknowledged.targets[String(id)];
    this.save();
    return target;
  }

  acknowledgeTargets(ids) {
    for (const id of ids) this.data.acknowledged.targets[String(id)] = Date.now();
    this.save();
  }

  acknowledgeTasks(seqs) {
    for (const s of seqs) this.data.acknowledged.tasks[String(s)] = Date.now();
    this.save();
  }

  isAcknowledgedTarget(id) {
    return Boolean(this.data.acknowledged.targets[String(id)]);
  }

  isAcknowledgedTask(seq) {
    return Boolean(this.data.acknowledged.tasks[String(seq)]);
  }

  deleteTarget(id) {
    const key = String(id);
    if (!this.data.targets[key]) return null;
    const target = this.data.targets[key];
    delete this.data.targets[key];
    this.save();
    return target;
  }

  // 整体替换配置、目标与任务记录（用于导入备份）
  replaceAll(settings, targets, tasks) {
    this.data.settings = deepMerge(defaultSettings(), sanitizeSettings(settings || {}));
    const map = {};
    const list = Array.isArray(targets) ? targets : Object.values(targets || {});
    for (const t of list) {
      if (t && t.id) map[String(t.id)] = { ...t, id: String(t.id) };
    }
    this.data.targets = map;
    this.data.tasks = Array.isArray(tasks) ? tasks.slice(-300) : [];
    this.save();
  }

  addLog(level, message) {
    this.data.logs.push({ ts: new Date().toISOString(), level, message });
    if (this.data.logs.length > 500) this.data.logs = this.data.logs.slice(-500);
    this.save();
  }

  addTask(record) {
    const last = this.data.tasks[this.data.tasks.length - 1];
    this.data.tasks.push({
      seq: (last?.seq || 0) + 1,
      ts: new Date().toISOString(),
      ...record
    });
    if (this.data.tasks.length > 300) this.data.tasks = this.data.tasks.slice(-300);
    this.save();
  }

  listTasks() {
    return [...this.data.tasks].reverse();
  }
}
