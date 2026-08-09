import fs from 'node:fs';
import { Store } from '../src/store.js';
import { EmbyClient } from '../src/emby/client.js';
import { generateCover } from '../src/covers/generator.js';
import { resolveFont } from '../src/covers/fonts.js';
import { SIZE_PRESETS } from '../src/covers/styles.js';

// 用真实媒体库的前几部影片海报，生成海报墙样式预览图
const store = new Store();
const client = new EmbyClient(store.settings);
const target = store.listTargets().find((t) => t.kind === 'library');
if (!target) {
  console.error('未找到媒体库');
  process.exit(1);
}
const raw = await client.getCoverItems(target, 20);
const items = raw.filter((i) => i.hasPrimary).slice(0, 12);
const posters = [];
for (const it of items) {
  const buf = await client.getImage(it.id, 500).catch(() => null);
  if (buf) posters.push(buf);
}
if (posters.length < 6) {
  console.error('海报数量不足');
  process.exit(1);
}
const size = SIZE_PRESETS.thumb; // 1600×900
const settings = { ...store.settings.cover, width: size.width, height: size.height };
const font = resolveFont(settings);
const png = await generateCover({
  title: target.name,
  subtitle: `共 ${items.length} 部作品`,
  posters: posters.slice(0, 9),
  settings,
  style: 'wall3',
  font
});
fs.writeFileSync('/tmp/emby-wall3.png', png);
console.log('已生成 /tmp/emby-wall3.png');
