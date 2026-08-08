import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const CANDIDATES = [
  process.env.FONT_FILE,
  '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc', // Alpine（font-noto-cjk）
  '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', // Debian / Ubuntu
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

function looksCjk(file) {
  const b = path.basename(String(file)).toLowerCase();
  return /noto|pingfang|hiragino|yahei|msyh|sourcehans|simhei|simsun|cjk/i.test(b);
}

// 用 fontconfig 动态查找中文字体（适配不同发行版的安装路径）
function matchCjkFont() {
  try {
    const out = execFileSync('fc-match', ['-f', '%{file}', 'Noto Sans CJK SC'], {
      encoding: 'utf8',
      timeout: 3000
    });
    const file = String(out).trim();
    return file && fs.existsSync(file) && looksCjk(file) ? file : null;
  } catch {
    return null;
  }
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
  const matched = matchCjkFont();
  if (matched) {
    return { file: matched, family: coverSettings.fontFamily || guessFamily(matched) };
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
