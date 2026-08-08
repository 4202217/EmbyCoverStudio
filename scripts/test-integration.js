import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emby-cover-test-'));
process.env.DATA_DIR = tmp;
process.env.PORT = '3199';
process.env.HOST = '127.0.0.1';

const { startMock } = await import('./mock-emby.js');
const { createApp } = await import('../src/server.js');

const APP = 'http://127.0.0.1:3199';
const MOCK = 'http://127.0.0.1:8199';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name} ${extra}`);
  }
}

async function api(method, p, body, headers = {}) {
  const res = await fetch(`${APP}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mock = await startMock({ port: 8199 });
const app = await createApp();
await app.listen();

console.log('== 1. 配置 Emby 连接 ==');
let r = await api('PUT', '/api/settings', {
  embyUrl: 'http://127.0.0.1:8199',
  embyApiKey: 'mock-api-key',
  syncOnStart: false,
  webhookDebounceMs: 500,
  cron: '0 0 * * *',
  cover: { width: 600, height: 900, columns: 3, maxItems: 6, titleSize: 54, subtitleSize: 26 }
});
check('保存设置', r.status === 200 && r.data.settings.embyUrl.includes('8199'));

r = await api('POST', '/api/emby/test');
check('测试 Emby 连接', r.status === 200 && r.data.ok && r.data.serverName === 'Mock Emby');

console.log('== 2. 执行同步 ==');
r = await api('POST', '/api/sync', {});
check('同步成功', r.status === 200 && r.data.ok === true, JSON.stringify(r.data));

r = await api('GET', '/api/targets');
check('发现媒体库与合集', r.data.targets.length >= 4);
const col1 = r.data.targets.find((t) => t.id === 'col-1');
check('合集已启用并生成封面', col1 && col1.enabled && col1.coverFile === 'col-1.png' && col1.lastGeneratedAt, JSON.stringify(col1));
const libMovies = r.data.targets.find((t) => t.id === 'lib-movies');
check('媒体库已生成封面', libMovies && libMovies.coverFile, JSON.stringify(libMovies));

r = await fetch(`${APP}/api/covers/col-1.png`);
check('封面文件可下载', r.status === 200 && r.headers.get('content-type').includes('png'));
const coverBytes = (await r.arrayBuffer()).byteLength;
check('封面文件非空', coverBytes > 5000, `bytes=${coverBytes}`);

const stateBefore = (await (await fetch(`${MOCK}/__mock/state`)).json());
check('封面已上传到 Emby', stateBefore.uploads['col-1']?.count >= 1 && stateBefore.uploads['lib-movies']?.count >= 1);

console.log('== 3. Webhook 自动更新 ==');
await fetch(`${MOCK}/__mock/add-movie`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'm-new', name: '新片入库' })
});
const beforeUpload = stateBefore.uploads['lib-movies']?.count || 0;
const wh = await api('GET', '/api/webhook/url');
const token = new URL(wh.data.url).searchParams.get('token');
r = await api('POST', `/api/webhook/emby?token=${token}`, {
  Event: 'item.added',
  Item: { Id: 'm-new', Name: '新片入库' }
});
check('Webhook 接收成功', r.status === 200 && r.data.handled === true);
await sleep(2500);
const stateAfter = (await (await fetch(`${MOCK}/__mock/state`)).json());
const afterUpload = stateAfter.uploads['lib-movies']?.count || 0;
check('入库后自动重新生成并上传', afterUpload > beforeUpload, `before=${beforeUpload} after=${afterUpload}`);

console.log('== 4. 预览与演示 ==');
r = await api('GET', '/api/demo-preview?width=400&height=600&columns=2&maxItems=4&title=演示合集');
check('演示封面可生成', r.status === 200 && r.data.length > 3000);
r = await api('GET', '/api/preview/col-1');
check('合集预览可生成', r.status === 200 && r.data.length > 3000);

console.log('== 4.5 样式、尺寸与批量操作 ==');
r = await api('GET', '/api/styles');
check('样式清单接口（仅单图）', r.status === 200 && r.data.styles.length === 1 && r.data.styles[0].id === 'single' && r.data.sizes.length === 2, JSON.stringify(r.data?.styles?.map((s) => s.id)));
r = await api('GET', '/api/demo-preview?style=single&size=thumb&backgroundMode=poster');
check('单图+缩略图+海报背景可生成', r.status === 200 && r.data.length > 3000);
r = await api('GET', '/api/demo-preview?style=single&size=poster&backgroundMode=gradient');
check('单图+海报+渐变背景可生成', r.status === 200 && r.data.length > 3000);
const batchIds = ['col-1', 'col-2'];
r = await api('POST', '/api/targets/batch', { ids: batchIds, action: 'disable' });
check('批量停用', r.status === 200 && r.data.updated === 2);
r = await api('POST', '/api/targets/batch', { ids: batchIds, action: 'template', value: 'single' });
check('批量应用样式', r.status === 200 && r.data.updated === 2);
r = await api('POST', '/api/targets/batch', { ids: batchIds, action: 'enable' });
check('批量启用并生成', r.status === 200 && r.data.updated === 2);
await sleep(3500);
r = await api('GET', '/api/targets');
const col1b = r.data.targets.find((t) => t.id === 'col-1');
check('批量后样式生效', col1b.template === 'single' && col1b.coverFile, JSON.stringify(col1b));
r = await api('GET', '/api/status');
check('同步进度字段存在', r.status === 200 && typeof r.data.sync?.total === 'number' && typeof r.data.sync?.done === 'number', JSON.stringify(r.data.sync));
r = await api('POST', '/api/sync/pause');
check('暂停接口可用', r.status === 200);
r = await api('POST', '/api/sync/cancel');
check('取消接口可用', r.status === 200);
r = await api('POST', '/api/sync/resume');
check('继续接口可用', r.status === 200);

console.log('== 4.6 单图样式与选图依据 ==');
r = await api('GET', '/api/demo-preview?style=single&size=poster');
check('单图样式可生成', r.status === 200 && r.data.length > 3000);
r = await api('PUT', '/api/targets/col-2', { template: 'single' });
check('设置单图样式', r.status === 200 && r.data.target.template === 'single', JSON.stringify(r.data.target));
const pAdded = await fetch(`${APP}/api/preview/col-2?style=single`);
const bAdded = Buffer.from(await pAdded.arrayBuffer());
await api('PUT', '/api/settings', { defaultPickBy: 'premiere' });
const pPremiere = await fetch(`${APP}/api/preview/col-2?style=single`);
const bPremiere = Buffer.from(await pPremiere.arrayBuffer());
check('全局选图依据生效（加入/发行不同封面）', !bAdded.equals(bPremiere));
await api('PUT', '/api/settings', { defaultPickBy: 'added' });
await api('PUT', '/api/targets/col-2', { template: 'single' });

console.log('== 5. 日志与访问令牌 ==');
r = await api('GET', '/api/logs');
check('日志有记录', r.status === 200 && r.data.logs.length > 0);
r = await api('PUT', '/api/settings', { accessToken: 'test-token' });
check('开启访问令牌', r.status === 200);
r = await api('GET', '/api/status');
check('无令牌被拒绝', r.status === 401);
r = await api('GET', '/api/status', null, { 'x-access-token': 'test-token' });
check('有令牌可访问', r.status === 200);
await api('PUT', '/api/settings', { accessToken: '' });

await app.close();
await mock.close();
fs.rmSync(tmp, { recursive: true, force: true });

console.log('');
if (failures) {
  console.log(`测试结束：${failures} 项失败`);
  process.exit(1);
}
console.log('全部测试通过 ✅');
