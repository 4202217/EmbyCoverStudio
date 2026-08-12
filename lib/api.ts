'use client';

type TokenPrompt = (resolve: (token: string) => void) => void;
let promptHandler: TokenPrompt | null = null;

export function registerTokenPrompt(fn: TokenPrompt) {
  promptHandler = fn;
}

function storedToken() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('ecs_token') || '';
}

function promptForToken(): Promise<string> {
  return new Promise((resolve) => {
    if (!promptHandler) {
      resolve('');
      return;
    }
    promptHandler(resolve);
  });
}

async function doFetch(path: string, opts: RequestInit, token: string): Promise<Response> {
  const headers = new Headers(opts.headers || {});
  if (opts.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('x-access-token', token);
  return fetch(path, { ...opts, headers });
}

export async function rawFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  let token = storedToken();
  let res = await doFetch(path, opts, token);

  // 访问令牌失效或缺失：弹出输入框后重试一次
  if (res.status === 401) {
    const input = await promptForToken();
    if (!input) throw new Error('需要访问令牌');
    window.localStorage.setItem('ecs_token', input);
    token = input;
    res = await doFetch(path, opts, token);
  }
  return res;
}

export async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await rawFetch(path, opts);

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`);
    return data as T;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `请求失败（${res.status}）`);
  }
  return res as unknown as T;
}
