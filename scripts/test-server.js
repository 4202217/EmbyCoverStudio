import http from 'node:http';
import { createApi } from '../server/api.js';

// 把生产 server/api.js 的 dispatch 暴露成 HTTP，让集成测试直接走生产路径
// （与 app/api/[...path]/route.ts 的行为一致：body/query/token/baseUrl 的传递方式相同）
export function createTestServer(app) {
  const { dispatch } = createApi(app);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const method = req.method.toUpperCase();
    let body = null;
    if (method !== 'GET' && method !== 'HEAD') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = null;
        }
      }
    }
    const result = await dispatch({
      method,
      pathname: url.pathname,
      query: url.searchParams,
      body,
      baseUrl: `${url.protocol}//${url.host}`,
      token: req.headers['x-access-token'] || '',
      headerToken: req.headers['x-webhook-secret'] || ''
    });
    const buf = Buffer.isBuffer(result.body) ? result.body : Buffer.from(JSON.stringify(result.body));
    res.writeHead(result.status, {
      'Content-Type': result.contentType || 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
  return server;
}
