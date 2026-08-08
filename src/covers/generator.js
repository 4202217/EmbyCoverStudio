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

async function textLayer({ text, size, color, width, height, family, file }) {
  const fontDesc = `${family} ${size}`;
  const markup = `<span font="${fontDesc}" foreground="${color}" font_weight="bold">${escXml(text)}</span>`;
  const buf = await sharp({
    text: {
      text: markup,
      font: family,
      fontfile: file || undefined,
      width: Math.max(10, Math.floor(width)),
      height: Math.max(10, Math.floor(height)),
      align: 'centre',
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

async function gridCells({ list, cols, cellW, cellH, gap, x0, y0, radius, border }) {
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = Math.round(x0 + col * (cellW + gap));
    const y = Math.round(y0 + row * (cellH + gap));
    out.push({
      input: await posterCell(list[i], cellW, cellH, radius, border, 'rgba(255,255,255,0.22)'),
      left: x,
      top: y
    });
  }
  return out;
}

/**
 * 渲染标题 + 强调横线 + 副标题，返回图层（渲染在 topY=0，可整体位移）
 */
async function titleLayers({ ctx, maxW, align = 'center', cx = 0, titleSize, centerIn = 0 }) {
  const size = titleSize || ctx.titleSize;
  const layers = [];
  const titlePng = await textLayer({
    text: ctx.title || '未命名',
    size,
    color: ctx.settings.titleColor || '#ffffff',
    width: maxW,
    height: Math.round(size * 1.7),
    family: ctx.family,
    file: ctx.file
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
    const subPng = await textLayer({
      text: ctx.subtitle,
      size: ctx.subtitleSize,
      color: ctx.settings.subtitleColor || '#c9d6f2',
      width: maxW,
      height: Math.round(ctx.subtitleSize * 1.8),
      family: ctx.family,
      file: ctx.file
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

async function layoutGrid(ctx, list) {
  const { W, H } = ctx;
  const pad = Math.round(W * 0.045);
  const gap = Math.round(W * 0.018);
  const columns = clampInt(ctx.settings.columns, 1, 8, 3);
  const titlePadTop = Math.round(H * 0.028);
  const t = await titleLayers({ ctx, maxW: W - pad * 2, align: 'center', cx: W / 2 });
  const titleZone = titlePadTop + t.height + Math.round(H * 0.03);
  const availH = Math.max(80, H - titleZone - pad);
  let cellW = (W - pad * 2 - (columns - 1) * gap) / columns;
  let cellH = cellW * 1.5;
  const rows = Math.ceil(list.length / columns);
  let gridH = rows * cellH + (rows - 1) * gap;
  if (gridH > availH) {
    cellH = Math.max(24, (availH - (rows - 1) * gap) / rows);
    cellW = cellH / 1.5;
    gridH = rows * cellH + (rows - 1) * gap;
  }
  const gridW = columns * cellW + (columns - 1) * gap;
  const gridX = Math.round((W - gridW) / 2);
  const gridY = Math.round(titleZone);
  const layers = [{ input: ctx.bg || await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent) }];
  layers.push(...await gridCells({ list, cols: columns, cellW, cellH, gap, x0: gridX, y0: gridY, radius: ctx.radius, border: ctx.border }));
  for (const l of t.layers) l.top += titlePadTop;
  layers.push(...t.layers);
  return layers;
}

async function layoutSplit(ctx, list) {
  const { W, H } = ctx;
  const pad = Math.round(W * 0.05);
  const gap = Math.round(W * 0.02);
  const columns = clampInt(ctx.settings.columns, 1, 8, 3);
  const titleColW = Math.round(W * 0.34);
  const gridX = titleColW + gap;
  const gridW = W - pad - gridX;
  const availH = H - pad * 2;
  let cellW = (gridW - (columns - 1) * gap) / columns;
  let cellH = cellW * 1.5;
  const rows = Math.ceil(list.length / columns);
  let gridH = rows * cellH + (rows - 1) * gap;
  if (gridH > availH) {
    cellH = Math.max(24, (availH - (rows - 1) * gap) / rows);
    cellW = cellH / 1.5;
    gridH = rows * cellH + (rows - 1) * gap;
  }
  const gridTotalW = columns * cellW + (columns - 1) * gap;
  const startX = Math.round(gridX + (gridW - gridTotalW) / 2);
  const startY = Math.round((H - gridH) / 2);
  const layers = [{ input: ctx.bg || await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent) }];
  layers.push(...await gridCells({ list, cols: columns, cellW, cellH, gap, x0: startX, y0: startY, radius: ctx.radius, border: ctx.border }));
  const t = await titleLayers({ ctx, maxW: titleColW - pad * 0.4, align: 'left', cx: pad, centerIn: H });
  layers.push(...t.layers);
  return layers;
}

async function layoutSpotlight(ctx, list) {
  const { W, H } = ctx;
  const pad = Math.round(W * 0.045);
  const gap = Math.round(W * 0.02);
  const columns = clampInt(ctx.settings.columns, 1, 8, 2);
  const titlePadTop = Math.round(H * 0.025);
  const t = await titleLayers({ ctx, maxW: W - pad * 2, align: 'center', cx: W / 2 });
  const titleZone = titlePadTop + t.height + Math.round(H * 0.022);
  const availH = Math.max(80, H - titleZone - pad);
  let heroW = Math.round(W * 0.34);
  let heroH = heroW * 1.5;
  if (heroH > availH) {
    heroH = availH;
    heroW = heroH / 1.5;
  }
  const heroX = pad;
  const heroY = Math.round(titleZone + (availH - heroH) / 2);
  const rightX = Math.round(heroX + heroW + gap);
  const rightW = Math.max(120, W - pad - rightX);
  const rest = list.slice(1);
  const layers = [{ input: ctx.bg || await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent) }];
  if (list.length) {
    layers.push({ input: await posterCell(list[0], heroW, heroH, ctx.radius, ctx.border, 'rgba(255,255,255,0.3)'), left: heroX, top: heroY });
  }
  if (rest.length) {
    let cellW = (rightW - (columns - 1) * gap) / columns;
    let cellH = cellW * 1.5;
    const rows = Math.ceil(rest.length / columns);
    let gridH = rows * cellH + (rows - 1) * gap;
    if (gridH > availH) {
      cellH = Math.max(24, (availH - (rows - 1) * gap) / rows);
      cellW = cellH / 1.5;
      gridH = rows * cellH + (rows - 1) * gap;
    }
    const totalW = columns * cellW + (columns - 1) * gap;
    const startX = Math.round(rightX + (rightW - totalW) / 2);
    const startY = Math.round(titleZone + (availH - gridH) / 2);
    layers.push(...await gridCells({ list: rest, cols: columns, cellW, cellH, gap, x0: startX, y0: startY, radius: ctx.radius, border: ctx.border }));
  }
  for (const l of t.layers) l.top += titlePadTop;
  layers.push(...t.layers);
  return layers;
}

async function layoutFilmstrip(ctx, list) {
  const { W, H } = ctx;
  const pad = Math.round(W * 0.05);
  const gap = Math.round(W * 0.012);
  const titlePadTop = Math.round(H * 0.035);
  const t = await titleLayers({ ctx, maxW: W - pad * 2, align: 'center', cx: W / 2 });
  const stripTop = titlePadTop + t.height + Math.round(H * 0.03);
  const stripH = Math.max(80, H - stripTop - pad);
  let cellH = Math.min(stripH, Math.round(H * 0.5));
  let cellW = cellH * (2 / 3);
  const n = list.length;
  let totalW = n * cellW + (n - 1) * gap;
  if (totalW > W - pad * 2) {
    cellW = (W - pad * 2 - (n - 1) * gap) / n;
    cellH = cellW * 1.5;
    totalW = n * cellW + (n - 1) * gap;
  }
  const startX = Math.round((W - totalW) / 2);
  const y = Math.round(stripTop + (stripH - cellH) / 2);
  const layers = [{ input: ctx.bg || await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent) }];
  for (let i = 0; i < n; i += 1) {
    layers.push({
      input: await posterCell(list[i], cellW, cellH, ctx.radius, ctx.border, 'rgba(255,255,255,0.22)'),
      left: Math.round(startX + i * (cellW + gap)),
      top: y
    });
  }
  for (const l of t.layers) l.top += titlePadTop;
  layers.push(...t.layers);
  return layers;
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
 * 生成封面
 * @param {object} opts
 * @param {string} opts.title 标题（库名）
 * @param {string} [opts.subtitle] 副标题（如影片数量）
 * @param {Buffer[]} opts.posters 影片封面图
 * @param {object} opts.settings 封面设置（cover 字段）
 * @param {string} [opts.style] 样式：single/grid/split/spotlight/filmstrip
 * @param {object} [opts.font] 字体信息
 */
export async function generateCover({ title, subtitle = '', posters = [], settings = {}, style = 'grid', font }) {
  const W = clampInt(settings.width, 200, 4096, 1000);
  const H = clampInt(settings.height, 200, 4096, 1500);
  const maxItems = clampInt(settings.maxItems, 1, 64, 9);
  const list = posters.slice(0, maxItems).filter(Boolean);
  if (!list.length) throw new Error('没有可用的影片封面，无法生成');

  const fontInfo = font || resolveFont(settings);
  const family = fontInfo.family || 'Noto Sans CJK SC';
  const file = fontInfo.file || undefined;
  const ctx = buildCtx({ W, H, title, subtitle, settings, family, file, list });
  if (settings.backgroundMode === 'poster' && list.length) {
    ctx.bg = await posterBackground(list[0], W, H);
  }

  let layers;
  if (style === 'split') layers = await layoutSplit(ctx, list);
  else if (style === 'spotlight') layers = await layoutSpotlight(ctx, list);
  else if (style === 'filmstrip') layers = await layoutFilmstrip(ctx, list);
  else if (style === 'single') layers = await layoutSingle(ctx, list);
  else layers = await layoutGrid(ctx, list);

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  }).composite(layers).png().toBuffer();
}
