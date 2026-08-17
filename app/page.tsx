'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Images } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { toast } from '@/components/toast-provider';
import { cn, fmtTime, TRIGGER_COLOR, TRIGGER_LABEL } from '@/lib/utils';

type Status = {
  emby?: { connected?: boolean; configured?: boolean; serverName?: string; version?: string; error?: string };
  stats?: { targets?: number; enabled?: number; generated?: number; coversGenerated?: number; failed?: number; taskCount?: number };
  cron?: string;
  nextRun?: string;
  webhookPending?: boolean;
  lastRun?: string;
  lastReason?: string;
  lastError?: string;
  font?: { hint?: string; fontFamily?: string };
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
  template?: string;
  posterSource?: string;
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

export default function DashboardPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [targets, setTargets] = useState<Target[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [previewTarget, setPreviewTarget] = useState<Target | null>(null);
  const [generating, setGenerating] = useState(false);

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
  const recentSort = (list: Target[], limit = 5) =>
    [...list]
      .filter((t) => t.coverUrl && t.lastGeneratedAt)
      .sort((a, b) => new Date(b.lastGeneratedAt!).getTime() - new Date(a.lastGeneratedAt!).getTime())
      .slice(0, limit);
  const recentLibs = recentSort(targets.filter((t) => t.kind === 'library'), 5);
  const recentCols = recentSort(targets.filter((t) => t.kind === 'collection'), 8);

  const embyState = !status?.emby?.configured
    ? { text: '未配置', color: 'bg-slate-400' }
    : status.emby?.connected
      ? { text: '已连接', color: 'bg-emerald-400' }
      : { text: '连接失败', color: 'bg-red-400' };

  const ack = async (body: Record<string, unknown>) => {
    try {
      await api('/api/acknowledge', { method: 'POST', body: JSON.stringify(body) });
      toast('ok', '已标记为已读');
      load();
    } catch (e: any) {
      toast('err', e.message);
    }
  };

  const retry = async (id: string) => {
    try {
      await api(`/api/targets/${id}/generate`, { method: 'POST', body: '{}' });
      toast('ok', '已重新生成');
      load();
    } catch (e: any) {
      toast('err', e.message);
    }
  };

  const updatePreview = async () => {
    if (!previewTarget) return;
    setGenerating(true);
    try {
      await api(`/api/targets/${previewTarget.id}/generate`, { method: 'POST', body: '{}' });
      await load();
      setPreviewTarget(null);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">概览</h1>
        <p className="text-sm text-muted-foreground">封面工坊运行状态一览</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
        <Card>
          <CardHeader>
            <CardTitle>定时任务</CardTitle>
            <CardDescription>{status?.webhookPending ? 'Webhook 待执行' : status?.nextRun ? `下次 ${fmtTime(status.nextRun)}` : '等待触发'}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm font-semibold">{status?.cron || '—'}</CardContent>
        </Card>
      </div>

      {status?.font?.hint ? (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {status.font.hint}（当前使用字体：{status.font.fontFamily || '未知'}）
          </span>
        </div>
      ) : null}

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
                        <span className="min-w-0 flex-1 break-words text-xs text-red-400">
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
                        <span className="min-w-0 flex-1 break-words text-xs text-red-400">
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
              <CheckCircle2 className="h-4 w-4" />
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
                <RecentRow title="媒体库" items={recentLibs} wide onPreview={setPreviewTarget} />
              ) : null}
              {recentCols.length ? <RecentRow title="合集" items={recentCols} onPreview={setPreviewTarget} /> : null}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-6 text-sm text-muted-foreground">
              <Images className="h-5 w-5 text-muted-foreground/40" />
              还没有生成记录
            </div>
          )}
        </CardContent>
      </Card>

      <Modal open={!!previewTarget} onClose={() => setPreviewTarget(null)} title="封面预览" className="max-w-3xl">
        {previewTarget ? (
          <div>
            <div className="flex items-center justify-center">
              {previewTarget.coverUrl ? (
                <img
                  src={`${previewTarget.coverUrl}?v=${encodeURIComponent(previewTarget.lastGeneratedAt || Date.now())}`}
                  alt={previewTarget.name}
                  className="max-h-[62vh] max-w-full rounded border object-contain"
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center rounded border text-xs text-muted-foreground">
                  尚未生成封面
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0 space-y-1 text-xs text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{previewTarget.name}</div>
                <div>
                  {previewTarget.kind === 'library' ? '媒体库' : '合集'}
                  {previewTarget.lastGeneratedAt ? ` · 生成于 ${fmtTime(previewTarget.lastGeneratedAt)}` : ''}
                </div>
                {previewTarget.posterSource ? <div>海报来源：{previewTarget.posterSource}</div> : null}
                {previewTarget.lastError ? <div className="text-red-400">最近错误：{previewTarget.lastError}</div> : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreviewTarget(null)}>
                  关闭
                </Button>
                <Button size="sm" disabled={generating} onClick={updatePreview}>
                  {generating ? '生成中…' : '更新并上传'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RecentRow({ title, items, wide, onPreview }: { title: string; items: Target[]; wide?: boolean; onPreview: (t: Target) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY + e.deltaX;
    };
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      el.scrollLeft = startLeft - (e.clientX - startX);
    };
    const onUp = () => {
      dragging = false;
      el.style.cursor = '';
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-muted-foreground">{title}</div>
      <ScrollArea ref={ref} className="cursor-grab">
        <div className="flex gap-3">
          {items.map((t) => (
            <div key={t.id} className={cn('group shrink-0 cursor-pointer', wide ? 'w-36' : 'w-24')} onClick={() => onPreview(t)}>
              <div className="relative overflow-hidden rounded-md border bg-muted/40">
                <img src={t.coverUrl} alt="" className="w-full" />
                {t.kind === 'collection' || !t.template || t.template === 'single' ? (
                  <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/75 px-1.5 py-1 text-[10px] leading-tight text-white transition-transform duration-200 ease-out hoverable:group-hover:translate-y-0">
                    <span className="line-clamp-2">{t.posterSource || '未知来源影片'}</span>
                  </div>
                ) : null}
              </div>
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
