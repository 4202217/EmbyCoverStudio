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
    defaultPickBy: 'added',
    cron: '0 */6 * * *',
    autoEnableNew: true,
    syncOnStart: true,
    webhookDebounceMs: 20000,
    cover: {
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
  const cover = { ...defaultSettings().cover, ...(patch || {}) };
  for (const k of COVER_NUM_FIELDS) {
    if (patch && k in patch) cover[k] = clampInt(patch[k], 1, 8192, defaultSettings().cover[k]);
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
  if ('defaultPickBy' in patch) out.defaultPickBy = patch.defaultPickBy === 'premiere' ? 'premiere' : 'added';
  if ('cron' in patch) out.cron = String(patch.cron || '0 */6 * * *').trim();
  if ('autoEnableNew' in patch) out.autoEnableNew = !!patch.autoEnableNew;
  if ('syncOnStart' in patch) out.syncOnStart = !!patch.syncOnStart;
  if ('webhookDebounceMs' in patch) out.webhookDebounceMs = clampInt(patch.webhookDebounceMs, 0, 600000, 20000);
  if ('cover' in patch) out.cover = sanitizeCover(patch.cover);
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
      logs: [],
      tasks: []
    };
    this.data = deepMerge(fresh, raw || {});
    // 迁移：只保留单图/极简两种样式
    if (!isValidStyle(this.data.settings.defaultStyle)) this.data.settings.defaultStyle = 'single';
    for (const t of Object.values(this.data.targets)) {
      if (!isValidStyle(t.template)) t.template = 'single';
    }
    // 迁移：旧版本把「跟随全局默认」误存成了 added，统一改为空值
    if (!this.data.settings.pickByMigrated) {
      for (const t of Object.values(this.data.targets)) {
        if (t.pickBy === 'added') t.pickBy = '';
      }
      this.data.settings.pickByMigrated = true;
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
      enabled: false,
      template: this.settings?.defaultStyle || 'single',
      size: '',
      titleOverride: '',
      itemHash: '',
      coverFile: '',
      coverHash: '',
      itemCount: 0,
      posterCount: 0,
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
    this.save();
    return target;
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
