export const STYLES = [
  { id: 'single', name: '单图海报', desc: '根据加入/发行时间挑选一张海报展示' }
];

export const SIZE_PRESETS = {
  poster: { id: 'poster', label: '海报 2:3', width: 1000, height: 1500 },
  thumb: { id: 'thumb', label: '缩略图 16:9', width: 1600, height: 900 }
};

export const DEFAULT_SIZE_BY_KIND = {
  library: 'thumb',
  collection: 'poster'
};

export function resolveSize(target, cover = {}) {
  const def = DEFAULT_SIZE_BY_KIND[target.kind] || 'poster';
  return SIZE_PRESETS[def];
}

export function isValidStyle(id) {
  return STYLES.some((s) => s.id === id);
}
