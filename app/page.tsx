'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, fmtTime, TRIGGER_LABEL } from '@/lib/utils';

type Status = {
  emby?: { connected?: boolean; configured?: boolean; serverName?: string; version?: string; error?: string };
  stats?: { targets?: number; enabled?: number; generated?: number; coversGenerated?: number; failed?: number; taskCount?: number };
  cron?: string;
  nextRun?: string;
  webhookPending?: boolean;
  lastRun?: string;
  lastReason?: string;
  lastError?: string;
};

type Target = {
  id: string;
  name: string;
  kind: 'library' | 'collection';
  coverUrl?: string;
  lastGeneratedAt?: string;
  lastError?: string;
  acknowledged?: boolean;
  locked?: boolean;
  lastTrigger?: string;
};

type Task = {
  seq: number;
  name: string;
  type: string;
  ts: string;
  trigger: string;
  status: string;
  updated?: number;
  error?: string;
  acknowledged?: boolean;
};

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`);
  return data as T;
}

const TRIGGER_COLOR: Record<string, string> = {
  manual: 'bg-slate-500/20 text-slate-300',
  batch: 'bg-purple-500/20 text-purple-300',
  scheduler: 'bg-amber-500/20 text-amber-300',
  webhook: 'bg-emerald-500/20 text-emerald-300',
  startup: 'bg-sky-500/20 text-sky-300',
  resume: 'bg-teal-500/20 text-teal-300',
  enable: 'bg-pink-500/20 text-pink-300'
};

export default function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = async () => {
    try {
      const [s, t, tk] = await Promise.all([
        api<Status>('/api/status'),
        api<{ targets: Target[] }>('/api/targets'),
        api<{ tasks: Task[] }>('/api/tasks')
      ]);
      setStatus(s);
      setTargets(t.targets);
      setTasks(tk.tasks);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  const failedTargets = targets.filter((t) => t.lastError && !t.acknowledged);
  const failedTasks = tasks.filter((t) => t.status === 'failed' && !t.acknowledged).slice(0, 5);
  const recentSort = (list: Target[]) =>
    [...list]
      .filter((t) => t.coverUrl && t.lastGeneratedAt)
      .sort((a, b) => new Date(b.lastGeneratedAt!).getTime() - new Date(a.lastGeneratedAt!).getTime())
      .slice(0, 5);
  const recentLibs = recentSort(targets.filter((t) => t.kind === 'library'));
  const recentCols = recentSort(targets.filter((t) => t.kind === 'collection'));

  const embyState = !status?.emby?.configured
    ? { text: '未配置', color: 'bg-slate-400' }
    : status.emby?.connected
      ? { text: '已连接', color: 'bg-emerald-400' }
      : { text: '连接失败', color: 'bg-red-400' };

  const ack = async (body: Record<string, unknown>) => {
    await api('/api/acknowledge', { method: 'POST', body: JSON.stringify(body) });
    load();
  };

  const retry = async (id: string) => {
    await api(`/api/targets/${id}/generate`, { method: 'POST', body: '{}' });
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">概览</h1>
        <p className="text-sm text-muted-foreground">封面工坊运行状态一览</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', embyState.color)} />
              Emby 服务器
            </CardTitle>
            <CardDescription>{status?.emby?.serverName ? `${status.emby.serverName} v${status.emby.version}` : ''}</CardDescription>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{embyState.text}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>监控中的合集</CardTitle>
            <CardDescription>已生成封面 {status?.stats?.generated ?? 0} 个</CardDescription>
          </CardHeader>
          <CardContent className="text-xl font-semibold">
            {status?.stats?.enabled ?? 0}
            <span className="text-sm font-normal text-muted-foreground"> / {status?.stats?.targets ?? 0}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>封面生成张数</CardTitle>
            <CardDescription>累计生成（含重新生成）</CardDescription>
          </CardHeader>
          <CardContent className="text-xl font-semibold">{status?.stats?.coversGenerated ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>最近同步</CardTitle>
            <CardDescription>
              {status?.lastReason || ''}
              {status?.lastError ? ' · 有错误' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-semibold">{fmtTime(status?.lastRun)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>需要关注</CardTitle>
          {failedTargets.length || failedTasks.length ? (
            <Button size="sm" variant="outline" onClick={() => ack({ all: true })}>
              一键清除
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {failedTargets.length || failedTasks.length ? (
            <div className="space-y-4">
              {failedTargets.length ? (
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">封面生成异常（{failedTargets.length}）</div>
                  <div className="space-y-2">
                    {failedTargets.map((t) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-md border bg-muted/30 p-2.5">
                        <span className="shrink-0 text-sm font-semibold">{t.name}</span>
                        <Badge variant="secondary">{t.kind === 'library' ? '媒体库' : '合集'}</Badge>
                        <span className="min-w-0 flex-1 truncate text-xs text-red-400" title={t.lastError}>
                          {t.lastError}
                        </span>
                        <Button size="sm" onClick={() => retry(t.id)}>
                          重试
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => ack({ targetId: t.id })}>
                          已读
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {failedTasks.length ? (
                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">最近失败任务（{failedTasks.length}）</div>
                  <div className="space-y-2">
                    {failedTasks.map((t) => (
                      <div key={t.seq} className="flex items-center gap-3 rounded-md border bg-muted/30 p-2.5">
                        <span className="shrink-0 text-sm font-semibold">{t.name}</span>
                        <span className="text-xs text-muted-foreground">{fmtTime(t.ts)}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-red-400" title={t.error}>
                          {t.error || '未知错误'}
                        </span>
                        <Button size="sm" variant="outline" onClick={() => ack({ taskSeq: t.seq })}>
                          已读
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 text-sm text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              全部正常，无需关注
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近生成</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLibs.length || recentCols.length ? (
            <div className="space-y-4">
              {recentLibs.length ? (
                <RecentRow title="媒体库" items={recentLibs} wide />
              ) : null}
              {recentCols.length ? <RecentRow title="合集" items={recentCols} /> : null}
            </div>
          ) : (
            <div className="py-2 text-sm text-muted-foreground">还没有生成记录</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RecentRow({ title, items, wide }: { title: string; items: Target[]; wide?: boolean }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-muted-foreground">{title}</div>
      <ScrollArea className="flex gap-3">
        <div className="flex gap-3">
          {items.map((t) => (
            <div key={t.id} className={cn('shrink-0 cursor-pointer', wide ? 'w-36' : 'w-24')}>
              <img src={t.coverUrl} alt="" className="w-full rounded-md border bg-muted/40" />
              {t.lastTrigger ? (
                <div className="mt-1">
                  <span className={cn('inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium', TRIGGER_COLOR[t.lastTrigger] || 'bg-slate-500/20 text-slate-300')}>
                    {TRIGGER_LABEL[t.lastTrigger] || t.lastTrigger}
                  </span>
                </div>
              ) : null}
              <div className="mt-0.5 truncate text-xs">{t.name}</div>
              <div className="text-[11px] text-muted-foreground">{fmtTime(t.lastGeneratedAt)}</div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}
