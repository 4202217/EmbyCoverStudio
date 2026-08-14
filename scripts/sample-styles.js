import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateCover } from '../src/covers/generator.js';
import { placeholderPoster } from '../src/covers/placeholders.js';
import { fontStatus } from '../src/covers/fonts.js';

// 生成 hero / wall5 各变体样张到 public/samples/，供浏览器对比（http://localhost:3000/samples/xxx.png）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'samples');
fs.mkdirSync(outDir, { recursive: true });

const posters = [];
for (let i = 0; i < 15; i += 1) posters.push(await placeholderPoster(`MOVIE ${i + 1}`, i));

const base = {
  width: 1600,
  height: 900,
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
};

const TITLE = '我的电影合集';
const SUB = '共 18 部作品';

console.log('font:', JSON.stringify(fontStatus(base)));

async function save(name, buf) {
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('saved', name, buf.length, 'bytes');
}

// hero 样张
await save('hero-center.png', await generateCover({ title: TITLE, subtitle: SUB, posters, settings: base, style: 'hero' }));

// 海报墙样张：竖向瀑布流（8 张）/ 少量（3 张）
await save('wall-v-8.png', await generateCover({ title: TITLE, subtitle: SUB, posters, settings: base, style: 'wall-v' }));
await save('wall-v-3.png', await generateCover({ title: TITLE, subtitle: SUB, posters: posters.slice(0, 3), settings: base, style: 'wall-v' }));
