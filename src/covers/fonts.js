import fs from 'node:fs';
import path from 'node:path';

const CANDIDATES = [
  process.env.FONT_FILE,
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/PingFang.ttc',
  '/System/Library/Fonts/Hiragino Sans GB.ttc',
  '/Library/Fonts/Arial Unicode.ttf',
  'C:/Windows/Fonts/msyh.ttc',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
].filter(Boolean);

function guessFamily(file) {
  const b = path.basename(String(file)).toLowerCase();
  if (b.includes('pingfang')) return 'PingFang SC';
  if (b.includes('hiragino')) return 'Hiragino Sans GB';
  if (b.includes('noto')) return 'Noto Sans CJK SC';
  if (b.includes('yahei') || b.includes('msyh')) return 'Microsoft YaHei';
  if (b.includes('dejavu')) return 'DejaVu Sans';
  return 'sans-serif';
}

export function resolveFont(coverSettings = {}) {
  const explicit = String(coverSettings.fontFile || '').trim();
  if (explicit && fs.existsSync(explicit)) {
    return { file: explicit, family: coverSettings.fontFamily || guessFamily(explicit) };
  }
  for (const c of CANDIDATES) {
    if (c && fs.existsSync(c)) {
      return { file: c, family: coverSettings.fontFamily || guessFamily(c) };
    }
  }
  return { file: null, family: coverSettings.fontFamily || 'Noto Sans CJK SC' };
}

export function fontStatus(coverSettings = {}) {
  const f = resolveFont(coverSettings);
  return {
    fontFile: f.file,
    fontFamily: f.family,
    cjk: Boolean(f.file),
    hint: f.file ? '' : '未找到中文字体文件，中文标题可能无法渲染，请设置封面字体文件路径'
  };
}
