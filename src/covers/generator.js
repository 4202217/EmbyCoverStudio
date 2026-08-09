import sharp from 'sharp';
import { resolveFont } from './fonts.js';

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function svgRect(w, h, rx, fill) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="${fill}"/>` +
      `</svg>`
  );
}

async function backgroundLayer(width, height, bgTop, bgBottom, accent = '#00a4dc', decor = 'glow') {
  let rings = '';
  if (decor === 'rings') {
    rings =
      `<circle cx="50%" cy="43%" r="34%" fill="none" stroke="${accent}" stroke-opacity="0.14" stroke-width="2"/>` +
      `<circle cx="50%" cy="43%" r="26%" fill="none" stroke="${accent}" stroke-opacity="0.09" stroke-width="2"/>`;
  }
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>` +
      `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${bgTop}"/>` +
      `<stop offset="1" stop-color="${bgBottom}"/>` +
      `</linearGradient>` +
      `<radialGradient id="glow" cx="50%" cy="0%" r="90%">` +
      `<stop offset="0" stop-color="rgba(255,255,255,0.10)"/>` +
      `<stop offset="1" stop-color="rgba(255,255,255,0)"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="100%" height="100%" fill="url(#bg)"/>` +
      `<rect width="100%" height="100%" fill="url(#glow)"/>` +
      rings +
      `</svg>`
  );
  return sharp(svg).resize(width, height).png().toBuffer();
}

// 以海报模糊渐变作为背景（暗化处理保证标题可读）
async function posterBackground(poster, width, height) {
  const small = await sharp(poster).resize(96, 96, { fit: 'cover' }).blur(40).png().toBuffer();
  const full = await sharp(small).resize(width, height, { fit: 'cover' }).png().toBuffer();
  const overlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>` +
      `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="rgba(8,10,18,0.42)"/>` +
      `<stop offset="1" stop-color="rgba(8,10,18,0.68)"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="100%" height="100%" fill="url(#shade)"/>` +
      `</svg>`
  );
  const overlayPng = await sharp(overlay).png().toBuffer();
  return sharp(full).composite([{ input: overlayPng }]).png().toBuffer();
}

async function accentBar(width, height, color) {
  const svg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.max(1, Math.round(height / 2))}" fill="${color}"/>` +
      `</svg>`
  );
  return sharp(svg).png().toBuffer();
}

async function textLayer({ text, size, color, width, height, family, file, align = 'centre' }) {
  const fontDesc = `${family} ${size}`;
  const markup = `<span font="${fontDesc}" foreground="${color}" font_weight="bold">${escXml(text)}</span>`;
  const buf = await sharp({
    text: {
      text: markup,
      font: family,
      fontfile: file || undefined,
      width: Math.max(10, Math.floor(width)),
      height: Math.max(10, Math.floor(height)),
      align,
      rgba: true
    }
  }).png().toBuffer();
  return buf;
}

async function posterCell(buffer, w, h, radius, border, borderColor) {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  let img = sharp(buffer).resize({
    width: cw,
    height: ch,
    fit: 'cover',
    position: 'centre'
  }).rotate();
  if (radius > 0) {
    const mask = await sharp(svgRect(cw, ch, radius, 'white')).png().toBuffer();
    img = img.composite([{ input: mask, blend: 'dest-in' }]);
  }
  let cell = await img.png().toBuffer();
  if (border > 0) {
    const bw = Math.max(1, border);
    const borderSvg = Buffer.from(
      `<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="${bw / 2}" y="${bw / 2}" width="${cw - bw}" height="${ch - bw}" rx="${radius}" ry="${radius}" fill="none" stroke="${borderColor}" stroke-width="${bw}"/>` +
        `</svg>`
    );
    const borderPng = await sharp(borderSvg).png().toBuffer();
    cell = await sharp(cell).composite([{ input: borderPng }]).png().toBuffer();
  }
  return cell;
}

/**
 * 渲染标题 + 强调横线 + 副标题，返回图层（渲染在 topY=0，可整体位移）
 */
async function titleLayers({ ctx, maxW, align = 'center', cx = 0, titleSize, subtitleSize, centerIn = 0 }) {
  const size = titleSize || ctx.titleSize;
  const layers = [];
  const titlePng = await textLayer({
    text: ctx.title || '未命名',
    size,
    color: ctx.settings.titleColor || '#ffffff',
    width: maxW,
    height: Math.round(size * 1.7),
    family: ctx.family,
    file: ctx.file,
    align: align === 'left' ? 'left' : 'centre'
  });
  const tMeta = await sharp(titlePng).metadata();
  const tx = align === 'center' ? Math.round(cx - tMeta.width / 2) : cx;
  layers.push({ input: titlePng, left: tx, top: 0 });

  const barW = Math.min(Math.max(72, Math.round(tMeta.width * 0.55)), Math.round(ctx.W * 0.6));
  const barH = Math.max(3, Math.round(6 * ctx.scale));
  const gapA = Math.round(ctx.H * 0.012);
  const barY = tMeta.height + gapA;
  const barX = align === 'center' ? Math.round(cx - barW / 2) : tx;
  layers.push({ input: await accentBar(barW, barH, ctx.settings.accent || '#00a4dc'), left: barX, top: barY });

  let stackBottom = barY + barH;
  if (ctx.showCount && ctx.subtitle) {
    const subSize = subtitleSize || ctx.subtitleSize;
    const subPng = await textLayer({
      text: ctx.subtitle,
      size: subSize,
      color: ctx.settings.subtitleColor || '#c9d6f2',
      width: maxW,
      height: Math.round(subSize * 1.8),
      family: ctx.family,
      file: ctx.file,
      align: align === 'left' ? 'left' : 'centre'
    });
    const sMeta = await sharp(subPng).metadata();
    const sY = barY + barH + gapA;
    const sX = align === 'center' ? Math.round(cx - sMeta.width / 2) : tx;
    layers.push({ input: subPng, left: sX, top: sY });
    stackBottom = sY + sMeta.height;
  }

  let dy = 0;
  if (centerIn > 0) dy = Math.max(0, Math.round((centerIn - stackBottom) / 2));
  for (const l of layers) l.top += dy;
  return { layers, height: stackBottom + dy };
}

function buildCtx({ W, H, title, subtitle, settings, family, file, list }) {
  const scale = W / 1000;
  return {
    W,
    H,
    scale,
    title,
    subtitle,
    settings,
    family,
    file,
    list,
    titleSize: clampInt(settings.titleSize, 18, 480, 84) * scale,
    subtitleSize: clampInt(settings.subtitleSize, 12, 240, 36) * scale,
    radius: Math.round(clampInt(settings.radius, 0, 200, 20) * scale),
    border: Math.max(0, Math.round(clampInt(settings.cellBorder, 0, 40, 2) * scale)),
    showCount: settings.showCount !== false
  };
}

async function layoutSingle(ctx, list) {
  const { W, H } = ctx;
  const pad = Math.round(W * 0.05);
  const poster = list[0];
  const layers = [{ input: ctx.bg || await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent || '#00a4dc') }];
  if (H >= W * 1.2) {
    // 竖版：标题在上，海报居中
    const titlePadTop = Math.round(H * 0.05);
    const t = await titleLayers({ ctx, maxW: W - pad * 2, align: 'center', cx: W / 2 });
    const titleZone = titlePadTop + t.height + Math.round(H * 0.025);
    let ph = H - titleZone - pad;
    let pw = ph * (2 / 3);
    if (pw > W - pad * 2) {
      pw = W - pad * 2;
      ph = pw * 1.5;
    }
    const px = Math.round((W - pw) / 2);
    const py = Math.round(titleZone + (H - titleZone - pad - ph) / 2);
    layers.push({ input: await posterCell(poster, pw, ph, ctx.radius, ctx.border, 'rgba(255,255,255,0.3)'), left: px, top: py });
    for (const l of t.layers) l.top += titlePadTop;
    layers.push(...t.layers);
  } else {
    // 横版：标题在海报左侧空白区域完全居中
    let ph = H - pad * 2;
    let pw = ph * (2 / 3);
    if (pw > W * 0.58) {
      pw = W * 0.58;
      ph = pw * 1.5;
    }
    const px = Math.round(W - pad - pw);
    const py = Math.round((H - ph) / 2);
    layers.push({ input: await posterCell(poster, pw, ph, ctx.radius, ctx.border, 'rgba(255,255,255,0.3)'), left: px, top: py });
    const t = await titleLayers({ ctx, maxW: Math.max(120, px - pad * 0.4), align: 'center', cx: Math.round(px / 2), centerIn: H });
    layers.push(...t.layers);
  }
  return layers;
}

/**
 * 海报墙：左侧文字（左对齐、字号偏小），右侧为向右倾斜 30-45° 的海报墙
 */
async function layoutWall(ctx, list) {
  const { W, H } = ctx;
  const pad = Math.round(W * 0.07); // 文字左间距（与上间距保持一致）
  const angle = 30; // 向右倾斜角度
  const rows = 3;
  const gapX = Math.max(4, Math.round(8 * ctx.scale));
  const gapY = Math.max(4, Math.round(8 * ctx.scale));
  const cols = 3;
  const pw = Math.round(W * 0.19); // 海报更大
  const ph = Math.round(pw * 1.5);
  const staggerY = Math.round(ph * 0.42); // 偶数列纵向错位
  const firstColDown = Math.round(ph * 0.25); // 第一列单独下移 1/4 海报高度
  const wallW = cols * pw + (cols - 1) * gapX;
  const wallH = rows * ph + (rows - 1) * gapY + staggerY;
  const smallRadius = Math.max(2, Math.round(ctx.radius * 0.45)); // 圆角更小

  const comps = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c;
      if (idx >= list.length) break;
      const cell = await posterCell(list[idx], pw, ph, smallRadius, ctx.border, 'rgba(255,255,255,0.35)');
      const colOff = c === 0 ? firstColDown : (c % 2 === 1 ? staggerY : 0); // 第一列再下移，偶数列错位
      comps.push({ input: cell, left: c * (pw + gapX), top: r * (ph + gapY) + colOff });
    }
  }
  const wallPng = await sharp({
    create: { width: wallW, height: wallH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(comps).png().toBuffer();
  const rotated = await sharp(wallPng).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(rotated).metadata();

  // 在更大的画布上合成，让海报墙从上下/右侧溢出画面，再裁剪回目标尺寸，形成无限流
  const bleedTop = Math.max(0, Math.round((meta.height - H) / 2)) + Math.round(H * 0.08);
  const shiftDown = Math.round(H * 0.09); // 海报墙整体下移，覆盖左下角
  const bleedBottom = Math.max(0, Math.round((meta.height - H) / 2)) + Math.round(H * 0.08) + shiftDown;

  // 文字固定在左上角，海报墙整体右移后从右到左填满剩余空间（并向右溢出一点）
  const wallLeft = Math.max(pad, Math.round(W * 0.28)); // 整体再往左移，可见部分约占 3/5
  const bleedRight = Math.max(pad, Math.round(wallLeft + meta.width - W) + pad);
  const canvasW = W + bleedRight;
  const canvasH = H + bleedTop + bleedBottom;
  const wallTop = Math.round((H - meta.height) / 2) + bleedTop + shiftDown;

  const bg = ctx.bg || await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent || '#00a4dc');
  const layers = [{ input: bg, left: 0, top: bleedTop }];
  layers.push({ input: rotated, left: wallLeft, top: wallTop });

  // 文字区域向右侧扩展到海报墙可见边缘，避免大字号过早换行
  const textW = Math.max(120, Math.round(W * 0.36) - pad);
  const textTop = pad; // 上与左间距保持一致
  const t = await titleLayers({
    ctx,
    maxW: textW,
    align: 'left',
    cx: pad,
    titleSize: Math.round(ctx.titleSize * 0.68),
    subtitleSize: Math.round(ctx.subtitleSize * 0.85)
  });
  for (const l of t.layers) l.top += bleedTop + textTop;
  layers.push(...t.layers);

  const full = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  }).composite(layers).png().toBuffer();
  return sharp(full).extract({ left: 0, top: bleedTop, width: W, height: H }).png().toBuffer();
}

/**
 * 生成封面
 * @param {object} opts
 * @param {string} opts.title 标题（库名）
 * @param {string} [opts.subtitle] 副标题（如影片数量）
 * @param {Buffer[]} opts.posters 影片封面图
 * @param {object} opts.settings 封面设置（cover 字段）
 * @param {string} [opts.style] 样式（single 单图海报 / wall3 海报墙）
 * @param {object} [opts.font] 字体信息
 */
export async function generateCover({ title, subtitle = '', posters = [], settings = {}, style = 'single', font }) {
  const W = clampInt(settings.width, 200, 4096, 1000);
  const H = clampInt(settings.height, 200, 4096, 1500);
  const list = posters.filter(Boolean);
  if (!list.length) throw new Error('没有可用的影片封面，无法生成');

  const fontInfo = font || resolveFont(settings);
  const family = fontInfo.family || 'Noto Sans CJK SC';
  const file = fontInfo.file || undefined;
  const ctx = buildCtx({ W, H, title, subtitle, settings, family, file, list });
  if (settings.backgroundMode === 'poster' && list.length) {
    ctx.bg = await posterBackground(list[0], W, H);
  }

  let layers;
  if (style === 'wall3') {
    // 海报墙直接返回最终成图（含溢出裁剪）
    return layoutWall(ctx, list);
  }
  layers = await layoutSingle(ctx, list);

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  }).composite(layers).png().toBuffer();
}
