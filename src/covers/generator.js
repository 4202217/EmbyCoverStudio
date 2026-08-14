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
  // 用足够宽的盒渲染，避免 vips_text 因宽度不足自动缩小字号；渲染后裁剪到字形边界
  const renderW = Math.max(10, Math.floor(width), Math.floor(size * 6));
  const rendered = await sharp({
    text: {
      text: markup,
      font: family,
      fontfile: file || undefined,
      width: renderW,
      height: Math.max(10, Math.floor(height)),
      align,
      rgba: true
    }
  }).png().toBuffer();
  const trimmed = sharp(rendered).trim();
  const meta = await trimmed.metadata();
  // 超出目标宽度时等比缩小到 width 内（贴合可用区域，避免溢出布局）
  let out = trimmed;
  if (meta.width > width) {
    out = trimmed.resize({ width: Math.floor(width) });
  }
  return out.png().toBuffer();
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
 * 大标题：整幅海报模糊背景 + 居中大标题（hero）
 */
async function layoutHero(ctx, list) {
  const { W, H } = ctx;
  const poster = list[0];
  // 无海报时退化为渐变背景（用于库内无媒体时的兜底封面）
  const bg = poster
    ? await posterBackground(poster, W, H)
    : await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent || '#00a4dc');
  const layers = [{ input: bg }];
  const t = await titleLayers({
    ctx,
    maxW: W - Math.round(W * 0.14),
    align: 'center',
    cx: W / 2,
    titleSize: Math.round(ctx.titleSize * 1.3),
    subtitleSize: Math.round(ctx.subtitleSize * 1.1),
    centerIn: 0
  });
  for (const l of t.layers) l.top += Math.max(0, Math.round((H - t.height) / 2));
  layers.push(...t.layers);
  return layers;
}

// 竖向标题条（三列横排）：媒体库名竖排 ｜ 蓝色竖分割线 ｜ 副标题竖排，整块垂直居中
// 文字逐字渲染并手动堆叠（字形 ≈ 2×请求字号），精确控制字间距
async function verticalTitleStrip(ctx, H) {
  const chars = [...ctx.title];
  const charCount = chars.length || 1;
  const pad = Math.max(12, Math.round(ctx.W * 0.04)); // 左侧边距

  const renderStack = async (text, targetH, color, boxW) => {
    const layers = [];
    let maxW = 0;
    for (const ch of [...text]) {
      if (/\s/.test(ch)) continue; // 跳过空白字符（如副标题中的空格）
      const buf = await textLayer({ text: ch, size: Math.max(8, Math.round(targetH / 2)), color, width: boxW, height: Math.round(targetH * 1.5), family: ctx.family, file: ctx.file, align: 'centre' });
      const m = await sharp(buf).metadata();
      layers.push({ buf, meta: m });
      if (m.width > maxW) maxW = m.width;
    }
    return { layers, maxW, count: layers.length };
  };

  const gapRatio = 0.62; // 字间距 = 字高的 62%
  const titleTarget = Math.max(16, Math.min(Math.round(ctx.titleSize * 0.72), Math.floor((H * 0.92) / (charCount * (1 + gapRatio)))));
  const titleGap = Math.max(4, Math.round(titleTarget * gapRatio));
  const { layers: titleLayers, maxW: titleMaxW } = await renderStack(ctx.title, titleTarget, ctx.settings.titleColor || '#ffffff', Math.round(H * 0.6));
  const titleH = titleLayers.length * titleTarget + (titleLayers.length - 1) * titleGap;
  const comps = titleLayers.map((l, i) => ({
    input: l.buf,
    left: pad + Math.round((titleMaxW - l.meta.width) / 2),
    top: Math.max(0, Math.round((H - titleH) / 2)) + i * (titleTarget + titleGap)
  }));
  let width = pad + titleMaxW;

  if (ctx.subtitle) {
    const subChars = [...ctx.subtitle];
    const colGap = Math.max(8, Math.round(titleTarget * 0.25)); // 对称列间距（收窄）
    // 分隔条：与其它样式完全相同的横向强调条，用 sharp 旋转 90° 竖起来
    const barLen = Math.max(56, Math.min(Math.round(titleMaxW * 1.3), Math.round(ctx.W * 0.5)));
    const barThick = Math.max(3, Math.round(5 * ctx.scale));
    const hbar = await accentBar(barLen, barThick, ctx.settings.accent || '#00a4dc');
    const line = await sharp(hbar).rotate(90).png().toBuffer();
    const lineMeta = await sharp(line).metadata();
    // 三列对齐居中：标题｜分隔条｜副标题，全部垂直居中，分隔条落在两列间隙正中
    const divX = pad + titleMaxW + colGap + Math.round((colGap - lineMeta.width) / 2);
    const subX = pad + titleMaxW + 2 * colGap + lineMeta.width;
    comps.push({ input: line, left: divX, top: Math.round((H - lineMeta.height) / 2) });
    width = subX;
    // 副标题按实际字符数（跳过空格）算高度预算，避免三位数作品数被挤压；并限制不超过标题列高度
    // 副标题字间距单独调大（保证每字之间有明显空隙）
    const subGapRatio = 0.9;
    const glyphCount = subChars.filter((ch) => !/\s/.test(ch)).length || 1;
    const subTarget = Math.max(10, Math.min(
      Math.round(ctx.subtitleSize * 0.55),
      Math.floor((H * 0.92) / (glyphCount * (1 + subGapRatio))),
      Math.floor(Math.max(titleH, H * 0.45) / (glyphCount * (1 + subGapRatio)))
    ));
    const subGap = Math.max(3, Math.round(subTarget * subGapRatio));
    const { layers: subLayers, maxW: subMaxW } = await renderStack(ctx.subtitle, subTarget, ctx.settings.subtitleColor || '#c9d6f2', Math.round(H * 0.5));
    const subH = subLayers.length * subTarget + (subLayers.length - 1) * subGap;
    subLayers.forEach((l, i) => {
      comps.push({
        input: l.buf,
        left: width + Math.round((subMaxW - l.meta.width) / 2),
        top: Math.max(0, Math.round((H - subH) / 2)) + i * (subTarget + subGap)
      });
    });
    width += subMaxW;
  }
  width += Math.round(pad * 0.5); // 右侧留少量边距
  const buffer = await sharp({ create: { width, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(comps)
    .png()
    .toBuffer();
  return { buffer, width };
}

// 竖向瀑布流海报墙：左侧竖向标题条，右侧 2:3 原比例瀑布流（倾斜、铺满并右/下出血）
async function layoutWaterfall(ctx, list) {
  const { W, H } = ctx;
  const angle = 18; // 倾斜角度
  const gapX = Math.max(5, Math.round(12 * ctx.scale));
  const gapY = Math.max(5, Math.round(12 * ctx.scale));
  const cols = 3;
  const rows = Math.ceil(list.length / cols);
  const pw = Math.round(W * 0.21); // 海报更大（竖向标题条让位）
  const ph = Math.round(pw * 1.5);
  const stagger = Math.round(ph * 0.45);

  const comps = [];
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const idx = c * rows + r; // 列主序填充
      if (idx >= list.length) break;
      const cell = await posterCell(list[idx], pw, ph, Math.max(2, Math.round(ctx.radius * 0.45)), ctx.border, 'rgba(255,255,255,0.35)');
      comps.push({ input: cell, left: c * (pw + gapX), top: c * stagger + r * (ph + gapY) });
    }
  }
  const wallW = cols * pw + (cols - 1) * gapX;
  const wallH = (cols - 1) * stagger + rows * ph + (rows - 1) * gapY;
  const wallPng = await sharp({
    create: { width: wallW, height: wallH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(comps).png().toBuffer();
  const rotated = await sharp(wallPng).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const meta = await sharp(rotated).metadata();

  // 在更大的画布上合成，让海报墙从上下/右侧溢出画面，再裁剪回目标尺寸，形成无限流
  const bleedTop = Math.max(0, Math.round((meta.height - H) / 2)) + Math.round(H * 0.08);
  const shiftDown = Math.round(H * 0.08);
  const bleedBottom = Math.max(0, Math.round((meta.height - H) / 2)) + Math.round(H * 0.08) + shiftDown;
  // 竖向标题条（三列）占左侧，瀑布流从条右侧开始
  const strip = await verticalTitleStrip(ctx, H);
  const wallLeft = strip.width + Math.round(W * 0.025);
  const bleedRight = Math.max(12, Math.round(wallLeft + meta.width - W) + Math.round(W * 0.04));
  const canvasW = W + bleedRight;
  const canvasH = H + bleedTop + bleedBottom;
  const wallTop = Math.round((H - meta.height) / 2) + bleedTop + shiftDown;

  const bg = ctx.bg || await backgroundLayer(W, H, ctx.settings.bgTop || '#17233d', ctx.settings.bgBottom || '#0a0f1c', ctx.settings.accent || '#00a4dc');
  const layers = [{ input: bg, left: 0, top: bleedTop }];
  layers.push({ input: rotated, left: wallLeft, top: wallTop });
  // 竖向标题条覆盖在最上层
  layers.push({ input: strip.buffer, left: 0, top: bleedTop });

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
 * @param {string} [opts.style] 样式（single 单图 / hero 大标题 / wall-v 竖向海报墙）
 * @param {object} [opts.font] 字体信息
 */
export async function generateCover({ title, subtitle = '', posters = [], settings = {}, style = 'single', font }) {
  const W = clampInt(settings.width, 200, 4096, 1000);
  const H = clampInt(settings.height, 200, 4096, 1500);
  const list = posters.filter(Boolean);
  // hero 允许无海报（用渐变背景兜底），其余样式必须至少一张海报
  if (!list.length && style !== 'hero') throw new Error('没有可用的影片封面，无法生成');

  const fontInfo = font || resolveFont(settings);
  const family = fontInfo.family || 'Noto Sans CJK SC';
  const file = fontInfo.file || undefined;
  const ctx = buildCtx({ W, H, title, subtitle, settings, family, file, list });
  if (settings.backgroundMode === 'poster' && list.length) {
    ctx.bg = await posterBackground(list[0], W, H);
  }

  let layers;
  if (style === 'wall-v') {
    // 海报墙：竖向瀑布流（2:3 原比例、倾斜、铺满右侧）
    return layoutWaterfall(ctx, list);
  }
  layers = style === 'hero' ? await layoutHero(ctx, list) : await layoutSingle(ctx, list);

  return sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  }).composite(layers).png().toBuffer();
}
