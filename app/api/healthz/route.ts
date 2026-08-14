import { NextResponse } from 'next/server';

// Docker HEALTHCHECK 与部署探活使用
export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    version: process.env.npm_package_version || '0.0.0'
  });
}
