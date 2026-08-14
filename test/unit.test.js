import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 单元测试使用临时数据目录，避免污染仓库 data/
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emby-cover-unit-'));
process.env.DATA_DIR = tmp;

const { parseCron, matches, nextRunDate } = await import('../src/scheduler.js');
const { STYLES, isValidStyle, configStyle, resolveSize, isValidPickBy, pickDefault, wallLayout, SIZE_PRESETS, DEFAULT_SIZE_BY_KIND } = await import('../src/covers/styles.js');
const { normalizeEmbyBase, isRelevantWebhookEvent } = await import('../src/emby/client.js');
const { defaultSettings, Store } = await import('../src/store.js');

test('parseCron 解析标准 5 段表达式', () => {
  const spec = parseCron('0 */6 * * *');
  assert.ok(spec.minute.has(0));
  assert.ok(spec.hour.has(0) && spec.hour.has(6) && spec.hour.has(18));
  assert.throws(() => parseCron('bad'));
  assert.throws(() => parseCron('0 0 * *'));
});

test('matches 判断 cron 是否命中', () => {
  const spec = parseCron('0 */6 * * *');
  assert.equal(matches(spec, new Date(2026, 0, 1, 6, 0, 0)), true);
  assert.equal(matches(spec, new Date(2026, 0, 1, 7, 0, 0)), false);
});

test('nextRunDate 返回未来时间', () => {
  const from = new Date(2026, 0, 1, 12, 0, 0);
  const d = nextRunDate(parseCron('0 0 * * *'), from);
  assert.ok(d > from);
});

test('normalizeEmbyBase 自动补 /emby 前缀', () => {
  assert.equal(normalizeEmbyBase('http://127.0.0.1:8096'), 'http://127.0.0.1:8096/emby');
  assert.equal(normalizeEmbyBase('http://127.0.0.1:8096/emby'), 'http://127.0.0.1:8096/emby');
  assert.equal(normalizeEmbyBase(''), '');
});

test('isRelevantWebhookEvent 识别相关事件', () => {
  assert.equal(isRelevantWebhookEvent('item.added'), true);
  assert.equal(isRelevantWebhookEvent('playback.start'), false);
});

test('样式/选图/尺寸工具函数', () => {
  assert.equal(isValidStyle('single'), true);
  assert.equal(isValidStyle('hero'), true);
  assert.equal(isValidStyle('wall-h'), false);
  assert.equal(isValidStyle('wall-v'), true);
  assert.equal(isValidStyle('wall3'), false);
  assert.equal(isValidStyle('wall5'), false);
  assert.equal(configStyle('hero'), 'single');
  assert.equal(configStyle('wall-h'), 'wall-h');
  assert.equal(configStyle('wall-v'), 'wall');
  assert.equal(resolveSize({ kind: 'library' }).id, 'thumb');
  assert.equal(resolveSize({ kind: 'collection' }).id, 'poster');
  assert.equal(isValidPickBy('rating'), false);
  assert.equal(isValidPickBy('unwatched'), false);
  assert.equal(isValidPickBy('nope'), false);
  assert.equal(pickDefault('rating'), 'added');
  assert.equal(pickDefault('manual'), 'added');
  assert.equal(wallLayout('wall-h', 7), null);
  assert.deepEqual(wallLayout('wall-v', 8), { mode: 'waterfall', vertical: true, tiles: 8 });
  assert.equal(wallLayout('single', 8), null);
});

test('默认设置已移除死字段', () => {
  const s = defaultSettings();
  assert.ok(!('styleByKind' in s));
  assert.ok(!('defaultStyle' in s));
  assert.equal(s.outputFormat, 'png');
  assert.equal(s.excludeUsedPosters, false);
  for (const c of Object.values(s.coverByStyle)) {
    assert.ok(!('width' in c));
    assert.ok(!('height' in c));
  }
});

test('Store 保存/迁移与 flush', () => {
  const store = new Store();
  store.updateSettings({
    embyUrl: 'http://x:8096',
    outputFormat: 'webp',
    defaultPickByByStyle: { 'library-single': 'premiere' }
  });
  assert.equal(store.settings.embyUrl, 'http://x:8096');
  assert.equal(store.settings.outputFormat, 'webp');
  assert.equal(store.settings.defaultPickByByStyle['library-single'], 'premiere');
  store.upsertTarget({ id: 't1', name: '测试目标' });
  assert.equal(store.getTarget('t1').name, '测试目标');
  store.flush();
  const store2 = new Store();
  assert.equal(store2.settings.embyUrl, 'http://x:8096');
  assert.equal(store2.getTarget('t1').chosenItemId, '');
});

fs.rmSync(tmp, { recursive: true, force: true });
