import { NextRequest } from 'next/server';
import { getApp } from '@/server/app';
import { createApi } from '@/server/api';

const { dispatch } = createApi(getApp());

async function handle(req: NextRequest, method: string) {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const body = method === 'GET' || method === 'HEAD' ? null : await req.json().catch(() => null);
  const baseUrl = `${url.protocol}//${url.host}`;
  const token = req.headers.get('x-access-token') || '';
  const headerToken = req.headers.get('x-webhook-secret') || '';
  const result = await dispatch({
    method,
    pathname,
    query: url.searchParams,
    body,
    baseUrl,
    token,
    headerToken
  });
  if (Buffer.isBuffer(result.body)) {
    return new Response(new Uint8Array(result.body), {
      status: result.status,
      headers: { 'content-type': result.contentType || 'application/octet-stream', 'cache-control': 'no-cache' }
    });
  }
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': result.contentType || 'application/json; charset=utf-8', 'cache-control': 'no-cache' }
  });
}

export async function GET(req: NextRequest) {
  return handle(req, 'GET');
}

export async function POST(req: NextRequest) {
  return handle(req, 'POST');
}

export async function PUT(req: NextRequest) {
  return handle(req, 'PUT');
}

export async function DELETE(req: NextRequest) {
  return handle(req, 'DELETE');
}
