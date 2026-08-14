export const STYLES = [
  { id: 'single', name: '单图海报', desc: '根据加入/发行时间挑选一张海报展示' },
  { id: 'hero', name: '大标题', desc: '整幅海报模糊背景 + 居中大标题' },
  { id: 'wall-v', name: '竖向海报墙', desc: '瀑布流海报墙：2:3 原比例、倾斜、铺满右侧' }
];

export const SIZE_PRESETS = {
  poster: { id: 'poster', label: '海报 2:3', width: 1000, height: 1500 },
  thumb: { id: 'thumb', label: '缩略图 16:9', width: 1600, height: 900 }
};

export const DEFAULT_SIZE_BY_KIND = {
  library: 'thumb',
  collection: 'poster'
};

export function resolveSize(target) {
  // 尺寸强制：媒体库 16:9 缩略图，合集 2:3 海报
  return SIZE_PRESETS[DEFAULT_SIZE_BY_KIND[target.kind] || 'poster'];
}

export function isValidStyle(id) {
  return STYLES.some((s) => s.id === id);
}

// 海报墙排版指纹描述（瀑布流拼贴；同步用于生成与指纹：调整排版后墙类封面会自动重新生成）
export function wallLayout(style, count) {
  if (style !== 'wall-v') return null;
  return {
    mode: 'waterfall',
    vertical: true,
    tiles: Math.max(2, Math.min(Number(count) || 2, 8))
  };
}

// 样式配置归属：hero 复用单图配置；海报墙用独立的「wall」配置
export function configStyle(style) {
  if (style === 'hero') return 'single';
  if (style === 'wall-v') return 'wall';
  return style;
}

// 选图依据：added 最新入库 / premiere 最新发行 / random 随机 / manual 手动
export const PICK_OPTIONS = ['added', 'premiere', 'random', 'manual'];

export function isValidPickBy(v) {
  return PICK_OPTIONS.includes(v);
}

// 全局默认选图依据（不含 manual）
export function pickDefault(v) {
  return ['premiere', 'random'].includes(v) ? v : 'added';
}
