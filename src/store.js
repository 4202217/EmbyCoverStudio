import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DB_FILE, DATA_DIR, COVERS_DIR, CACHE_DIR } from './config.js';
import { isValidStyle } from './covers/styles.js';

export function randomToken(len = 16) {
  return crypto.randomBytes(len).toString('hex');
}

export function defaultSettings() {
  return {
    embyUrl: '',
    embyApiKey: '',
    webhookToken: randomToken(),
    accessToken: '',
    defaultStyle: 'single',
    styleByKind: { library: 'single', collection: 'single' },
    defaultPickByByStyle: {
      'library-single': 'added',
      'library-wall3': 'added',
      'collection-single': 'added'
    },
    cron: '0 */6 * * *',
    autoEnableNew: true,
    syncOnStart: true,
    webhookDebounceMs: 20000,
    coverByStyle: {
      'library-single': {
        width: 1600,
        height: 900,
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
      'library-wall3': {
        width: 1600,
        height: 900,
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
        width: 1000,
        height: 1500,
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

const COVER_NUM_FIELDS = ['width', 'height', 'titleSize', 'subtitleSize', 'radius', 'cellBorder'];
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
  return cover;
}

function sanitizeSettings(patch) {
  const out = {};
  if ('embyUrl' in patch) out.embyUrl = String(patch.embyUrl || '').trim();
  if ('embyApiKey' in patch) out.embyApiKey = String(patch.embyApiKey || '').trim();
  if ('webhookToken' in patch) out.webhookToken = String(patch.webhookToken || '').trim();
  if ('accessToken' in patch) out.accessToken = String(patch.accessToken || '').trim();
  if ('defaultStyle' in patch) out.defaultStyle = String(patch.defaultStyle || 'single');
  if ('defaultPickBy' in patch) {
    // 兼容旧字段：同时写入三套默认值
    const d = patch.defaultPickBy === 'premiere' ? 'premiere' : 'added';
    out.defaultPickByByStyle = { 'library-single': d, 'library-wall3': d, 'collection-single': d };
  }
  if ('defaultPickByByKind' in patch) {
    const s = patch.defaultPickByByKind || {};
    const lib = s.library === 'premiere' ? 'premiere' : 'added';
    const col = s.collection === 'premiere' ? 'premiere' : 'added';
    out.defaultPickByByStyle = {
      'library-single': lib,
      'library-wall3': lib,
      'collection-single': col
    };
  }
  if ('defaultPickByByStyle' in patch) {
    const s = patch.defaultPickByByStyle || {};
    out.defaultPickByByStyle = {
      'library-single': s['library-single'] === 'premiere' ? 'premiere' : 'added',
      'library-wall3': s['library-wall3'] === 'premiere' ? 'premiere' : 'added',
      'collection-single': s['collection-single'] === 'premiere' ? 'premiere' : 'added'
    };
  }
  if ('styleByKind' in patch) {
    const s = patch.styleByKind || {};
    out.styleByKind = {
      library: s.library === 'wall3' ? 'wall3' : 'single',
      collection: 'single'
    };
  }
  if ('cover' in patch) {
    // 兼容旧字段：同时应用到三套配置
    const c = sanitizeCover(patch.cover);
    out.coverByStyle = { 'library-single': c, 'library-wall3': c, 'collection-single': c };
  }
  if ('coverByKind' in patch) {
    const c = patch.coverByKind || {};
    out.coverByStyle = {
      'library-single': sanitizeCover(c.library),
      'library-wall3': sanitizeCover(c.library),
      'collection-single': sanitizeCover(c.collection)
    };
  }
  if ('coverByStyle' in patch) {
    const c = patch.coverByStyle || {};
    out.coverByStyle = {
      'library-single': sanitizeCover(c['library-single']),
      'library-wall3': sanitizeCover(c['library-wall3']),
      'collection-single': sanitizeCover(c['collection-single'])
    };
  }
  if ('cron' in patch) out.cron = String(patch.cron || '0 */6 * * *').trim();
  if ('autoEnableNew' in patch) out.autoEnableNew = !!patch.autoEnableNew;
  if ('syncOnStart' in patch) out.syncOnStart = !!patch.syncOnStart;
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
        'library-wall3': lib,
        'collection-single': col
      };
      delete st.defaultPickByByKind;
    }
    if (st.coverByKind !== undefined) {
      const lib = st.coverByKind.library || {};
      const col = st.coverByKind.collection || {};
      st.coverByStyle = {
        'library-single': { ...(st.coverByStyle?.['library-single'] || {}), ...lib, width: 1600, height: 900 },
        'library-wall3': { ...(st.coverByStyle?.['library-wall3'] || {}), ...lib, width: 1600, height: 900 },
        'collection-single': { ...(st.coverByStyle?.['collection-single'] || {}), ...col, width: 1000, height: 1500 }
      };
      delete st.coverByKind;
    }
    // 迁移：只保留单图/极简两种样式
    if (!isValidStyle(this.data.settings.defaultStyle)) this.data.settings.defaultStyle = 'single';
    for (const t of Object.values(this.data.targets)) {
      // 空 template 表示跟随所属类型的全局默认
      if (t.template && !isValidStyle(t.template)) t.template = '';
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
      if (t.embyCoverHash === undefined) t.embyCoverHash = '';
    }
    this.save();
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
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
      size: '',
      titleOverride: '',
      configured: false,
      itemHash: '',
      coverFile: '',
      coverHash: '',
      embyCoverHash: '',
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
