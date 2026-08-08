import fs from 'node:fs';
import path from 'node:path';
import { placeholderPoster } from '../src/covers/placeholders.js';
import { generateCover } from '../src/covers/generator.js';
import { defaultSettings } from '../src/store.js';

const count = 9;
const posters = [];
for (let i = 0; i < count; i += 1) {
  posters.push(await placeholderPoster(`MOVIE ${i + 1}`, i));
}
const cover = await generateCover({
  title: process.argv[2] || '漫威电影宇宙',
  subtitle: `共 ${count} 部作品`,
  posters,
  settings: defaultSettings().cover
});
const out = path.resolve(process.argv[3] || 'demo-cover.png');
fs.writeFileSync(out, cover);
console.log(`演示封面已生成: ${out} (${cover.length} bytes)`);
