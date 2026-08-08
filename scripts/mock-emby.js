import http from 'node:http';
import { placeholderPoster } from '../src/covers/placeholders.js';

const API_KEY = process.env.MOCK_KEY || 'mock-api-key';

const movies = [
  { id: 'm1', name: '钢铁侠', library: 'lib-movies', date: '2020-01-01', premiere: '2019-04-26', color: 0 },
  { id: 'm2', name: '美国队长', library: 'lib-movies', date: '2020-02-01', premiere: '2019-07-15', color: 1 },
  { id: 'm3', name: '雷神', library: 'lib-movies', date: '2020-03-01', premiere: '2019-09-01', color: 2 },
  { id: 'm4', name: '复仇者联盟', library: 'lib-movies', date: '2020-04-01', premiere: '2020-01-01', color: 3 },
  { id: 'm5', name: '黑豹', library: 'lib-movies', date: '2020-05-01', premiere: '2020-03-01', color: 4 },
  { id: 'm6', name: '星际穿越', library: 'lib-movies', date: '2020-06-01', premiere: '2022-01-01', color: 5 },
  { id: 'm7', name: '流浪地球', library: 'lib-movies', date: '2020-07-01', premiere: '2023-01-01', color: 6 },
  { id: 'm8', name: '沙丘', library: 'lib-movies', date: '2020-08-01', premiere: '2021-01-01', color: 7 }
];
const series = [
  { id: 's1', name: '绝命毒师', library: 'lib-tv', date: '2021-01-01', color: 0 },
  { id: 's2', name: '权力的游戏', library: 'lib-tv', date: '2021-02-01', color: 1 }
];
const libraries = [
  { ItemId: 'lib-movies', Name: '电影', CollectionType: 'movies' },
  { ItemId: 'lib-tv', Name: '剧集', CollectionType: 'tvshows' }
];
const collections = [
  { Id: 'col-1', Name: '漫威电影宇宙', children: ['m1', 'm2', 'm3', 'm4', 'm5'] },
  { Id: 'col-2', Name: '星际科幻合集', children: ['m6', 'm7', 'm8'] }
];

const imageCache = new Map();
const uploads = {};

function allItems() {
  return [
    ...movies.map((m) => ({ ...m, type: 'Movie' })),
    ...series.map((s) => ({ ...s, type: 'Series' }))
  ];
}

function itemToDto(it) {
  return {
    Id: it.id,
    Name: it.name,
    Type: it.type,
    DateCreated: it.date,
    PremiereDate: it.premiere || it.date,
    ImageTags: { Primary: it.id }
  };
}

async function posterFor(it) {
  if (!imageCache.has(it.id)) {
    const buf = await placeholderPoster(it.name.toUpperCase(), it.color, 300, 450);
    imageCache.set(it.id, buf);
  }
  return imageCache.get(it.id);
}

function itemsResponse(list) {
  return JSON.stringify({ Items: list, TotalRecordCount: list.length });
}

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function auth(req) {
  return req.headers['x-emby-token'] === API_KEY;
}

function handleItems(query, res) {
  const type = query.get('IncludeItemTypes') || '';
  const parentId = query.get('ParentId') || '';
  if (type.split(',').includes('BoxSet')) {
    const list = collections.map((c) => ({
      Id: c.Id,
      Name: c.Name,
      Type: 'BoxSet',
      ChildCount: c.children.length,
      ImageTags: {}
    }));
    send(res, 200, itemsResponse(list));
    return;
  }
  if (parentId.startsWith('col-')) {
    const col = collections.find((c) => c.Id === parentId);
    const list = (col ? col.children : []).map((id) => allItems().find((i) => i.id === id)).filter(Boolean).map(itemToDto);
    send(res, 200, itemsResponse(list));
    return;
  }
  if (parentId === 'lib-movies' || parentId === 'lib-tv') {
    const inType = type.split(',').filter(Boolean);
    let list = allItems().filter((i) => i.library === parentId);
    if (inType.length) list = list.filter((i) => inType.includes(i.type));
    list = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
    send(res, 200, itemsResponse(list.map(itemToDto)));
    return;
  }
  send(res, 200, itemsResponse([]));
}

export async function startMock({ port = 8199, host = '127.0.0.1' } = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${host}:${port}`);
    const p = url.pathname;
    const query = url.searchParams;

    if (p.startsWith('/__mock/')) {
      if (p === '/__mock/add-movie') {
        let body = '';
        for await (const c of req) body += c;
        const data = JSON.parse(body || '{}');
        movies.push({ id: data.id || `m-new-${movies.length}`, name: data.name || '新片入库', library: 'lib-movies', date: new Date().toISOString().slice(0, 10), color: movies.length % 9 });
        send(res, 200, JSON.stringify({ ok: true, movies: movies.length }));
        return;
      }
      if (p === '/__mock/state') {
        send(res, 200, JSON.stringify({ uploads, movies: movies.map((m) => m.id) }));
        return;
      }
      send(res, 404, JSON.stringify({ error: 'unknown mock endpoint' }));
      return;
    }

    if (!p.startsWith('/emby/')) {
      send(res, 404, JSON.stringify({ error: 'not found' }));
      return;
    }
    if (!auth(req)) {
      send(res, 401, JSON.stringify({ error: 'invalid token' }));
      return;
    }

    if (req.method === 'GET' && p === '/emby/System/Info') {
      send(res, 200, JSON.stringify({ ServerName: 'Mock Emby', Version: '4.8.0.0' }));
      return;
    }
    if (req.method === 'GET' && p === '/emby/Users') {
      send(res, 200, JSON.stringify([{ Id: 'u1', Name: '管理员' }]));
      return;
    }
    if (req.method === 'GET' && p === '/emby/Library/VirtualFolders') {
      send(res, 200, JSON.stringify(libraries));
      return;
    }
    if (req.method === 'GET' && (p === '/emby/Items' || p === '/emby/Users/u1/Items')) {
      handleItems(query, res);
      return;
    }
    if (req.method === 'GET' && p === '/emby/Users/u1/Views') {
      send(res, 200, itemsResponse(libraries.map((l) => ({ Id: l.ItemId, Name: l.Name, CollectionType: l.CollectionType }))));
      return;
    }

    const imageMatch = p.match(/^\/emby\/(?:Users\/[^/]+\/)?Items\/([^/]+)\/Images\/Primary$/);
    if (imageMatch) {
      const id = imageMatch[1];
      const it = allItems().find((i) => i.id === id);
      if (req.method === 'GET') {
        if (!it) {
          send(res, 404, JSON.stringify({ error: 'no item' }));
          return;
        }
        const img = await posterFor(it);
        send(res, 200, img, 'image/png');
        return;
      }
      if (req.method === 'POST') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks);
        let decoded = raw;
        const text = raw.toString('utf8').trim();
        if (/^[A-Za-z0-9+/=\s]+$/.test(text)) {
          try {
            decoded = Buffer.from(text, 'base64');
          } catch {
            decoded = raw;
          }
        }
        uploads[id] = {
          count: (uploads[id]?.count || 0) + 1,
          bytes: decoded.length,
          lastAt: new Date().toISOString()
        };
        send(res, 204, '');
        return;
      }
    }
    send(res, 404, JSON.stringify({ error: 'not found' }));
  });

  await new Promise((resolve) => server.listen(port, host, resolve));
  return {
    port,
    server,
    close: () => new Promise((resolve) => server.close(resolve)),
    getUploads: () => uploads
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const inst = await startMock({ port: Number(process.env.MOCK_PORT || 8199) });
  console.log(`Mock Emby 已启动: http://127.0.0.1:${inst.port} （API Key: ${API_KEY}）`);
  process.on('SIGINT', () => inst.close());
}
