'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Clock3, Images, Layers, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { cn, fmtTime } from '@/lib/utils';

type Status = {
  running?: boolean;
  uptime?: number;
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
  missing?: boolean;
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
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [loaded, setLoaded] = useState(false);

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
    } finally {
      setLoaded(true);
    }
  };

  const failedTargets = targets.filter((t) => t.lastError && !t.acknowledged);
  const failedTasks = tasks.filter((t) => t.status === 'failed' && !t.acknowledged).slice(0, 5);
  const allLibs = useMemo(
    () =>
      [...targets]
        .filter((t) => t.kind === 'library' && !t.missing)
        .sort((a, b) => new Date(b.lastGeneratedAt || 0).getTime() - new Date(a.lastGeneratedAt || 0).getTime()),
    [targets]
  );
  const allCols = useMemo(
    () =>
      [...targets]
        .filter((t) => t.kind === 'collection' && !t.missing)
        .sort((a, b) => new Date(b.lastGeneratedAt || 0).getTime() - new Date(a.lastGeneratedAt || 0).getTime()),
    [targets]
  );
  const generated24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return tasks.filter((t) => new Date(t.ts).getTime() >= cutoff).reduce((sum, t) => sum + (t.updated || 0), 0);
  }, [tasks]);
  const previewList = useMemo(
    () =>
      targets
        .filter((t) => !t.missing)
        .sort((a, b) => new Date(b.lastGeneratedAt || 0).getTime() - new Date(a.lastGeneratedAt || 0).getTime()),
    [targets]
  );
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!previewTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewTarget(null);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (previewList.length < 2) return;
      const idx = previewList.findIndex((t) => t.id === previewTarget.id);
      const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + previewList.length) % previewList.length;
      setPreviewTarget(previewList[next]);
      setPreviewIndex(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewTarget, previewList]);

  const navPreview = (dir: 1 | -1) => {
    if (previewList.length < 2 || !previewTarget) return;
    const idx = previewList.findIndex((t) => t.id === previewTarget.id);
    const next = (idx + dir + previewList.length) % previewList.length;
    setPreviewTarget(previewList[next]);
    setPreviewIndex(next);
  };

  const markAllRead = async () => {
    try {
      await api('/api/acknowledge', { method: 'POST', body: JSON.stringify({ all: true }) });
      load();
    } catch {
      // 静默失败，下次刷新重试
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-card via-card/85 to-card/45 shadow-soft">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        <div className="relative p-6 md:p-8">
          <div className="max-w-2xl">
            <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              <span className="inline-block h-px w-7 bg-gold/60" />
              Cinema Wall
            </div>
            <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">概览</h1>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">封面工坊运行状态一览</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {!loaded ? (
          [0, 1, 2, 3, 4, 5].map((i) => <StatTileSkeleton key={i} />)
        ) : (
          <>
            <StatTile
              icon={Layers}
              label="监控合集"
              value={`${status?.stats?.enabled ?? 0} / ${status?.stats?.targets ?? 0}`}
              sub={`已生成封面 ${status?.stats?.generated ?? 0} 个`}
              delay={0}
            />
            <StatTile
              icon={Images}
              label="生成封面"
              value={status?.stats?.coversGenerated ?? 0}
              sub="累计生成（含重新生成）"
              delay={40}
            />
            <StatTile
              icon={Activity}
              label="近 24 小时"
              value={generated24h}
              sub="生成封面（含重新生成）"
              delay={80}
            />
            <StatTile
              icon={Clock3}
              label="最近同步"
              value={fmtTime(status?.lastRun)}
              sub={status?.lastError ? '有错误，请关注' : status?.lastReason || '等待首次同步'}
              delay={120}
            />
            <StatTile
              icon={CalendarClock}
              label="定时任务"
              value={status?.cron || '—'}
              sub={status?.webhookPending ? 'Webhook 待执行' : status?.nextRun ? `下次 ${fmtTime(status.nextRun)}` : '等待触发'}
              delay={160}
            />
            <StatTile
              icon={Timer}
              label="运行时长"
              value={status?.uptime != null ? fmtDuration(status.uptime) : '—'}
              sub={
                status?.uptime != null
                  ? `启动于 ${fmtTime(new Date(Date.now() - status.uptime * 1000).toISOString())}`
                  : '服务运行状态'
              }
              delay={200}
            />
          </>
        )}
      </div>

      {status?.font?.hint ? (
        <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>
            {status.font.hint}（当前使用字体：{status.font.fontFamily || '未知'}）
          </span>
        </div>
      ) : null}

      {failedTargets.length || failedTasks.length ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="font-medium">有 {failedTargets.length + failedTasks.length} 项封面异常需要处理</span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={markAllRead}
              className="cursor-pointer rounded-md px-2 py-1 text-red-400/90 transition-colors duration-150 ease-out hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            >
              全部已读
            </button>
            <Link
              href="/targets"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-red-400 transition-colors duration-150 ease-out hover:bg-red-500/15 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
            >
              前往封面管理
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </span>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>封面墙</CardTitle>
          {allLibs.length || allCols.length ? (
            <Link
              href="/targets"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              封面管理
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <div className="space-y-4">
              <RecentSkeleton wide />
              <RecentSkeleton />
            </div>
          ) : allLibs.length || allCols.length ? (
            <div className="space-y-4">
              {allLibs.length ? (
                <RecentRow
                  title="媒体库"
                  items={allLibs}
                  wide
                  onPreview={(t) => {
                    setPreviewTarget(t);
                    setPreviewIndex(previewList.findIndex((x) => x.id === t.id));
                  }}
                />
              ) : null}
              {allCols.length ? (
                <RecentRow
                  title="合集"
                  items={allCols}
                  onPreview={(t) => {
                    setPreviewTarget(t);
                    setPreviewIndex(previewList.findIndex((x) => x.id === t.id));
                  }}
                />
              ) : null}
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
            <div className="flex items-center justify-center rounded-lg py-6">
              {previewTarget.coverUrl ? (
                <img
                  src={`${previewTarget.coverUrl}?v=${encodeURIComponent(previewTarget.lastGeneratedAt || Date.now())}`}
                  alt={previewTarget.name}
                  className="max-h-[50vh] max-w-full rounded-lg border border-border/40 object-contain"
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center rounded border text-xs text-muted-foreground">
                  尚未生成封面
                </div>
              )}
            </div>
            <div className="mt-4 text-center">
              <div className="text-base font-semibold text-foreground">{previewTarget.name}</div>
              <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                <div>
                  {previewTarget.kind === 'library' ? '媒体库' : '合集'}
                  {previewTarget.lastGeneratedAt ? ` · 生成于 ${fmtTime(previewTarget.lastGeneratedAt)}` : ''}
                </div>
                {previewTarget.posterSource ? <div>海报来源：{previewTarget.posterSource}</div> : null}
                {previewTarget.lastError ? <div className="text-red-400">最近错误：{previewTarget.lastError}</div> : null}
              </div>
              {previewList.length > 1 ? (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => navPreview(-1)} aria-label="上一张">
                    <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <span className="font-mono text-xs text-muted-foreground">
                    {previewIndex + 1} / {previewList.length}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => navPreview(1)} aria-label="下一张">
                    <ChevronRight aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function RecentRow({
  title,
  items,
  wide,
  onPreview
}: {
  title: string;
  items: Target[];
  wide?: boolean;
  onPreview: (t: Target) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState<Record<string, boolean>>({});
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
        <div className="flex gap-4">
          {items.map((t) => (
            <div key={t.id} className={cn('group shrink-0 cursor-pointer', wide ? 'w-44' : 'w-28')} onClick={() => onPreview(t)}>
              <div
                className={cn(
                  'relative overflow-hidden rounded-lg bg-muted/40 shadow-soft ring-1 ring-white/5 transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-pop',
                  wide ? 'aspect-video' : 'aspect-[9/16]',
                  t.coverUrl && !ready[t.id] && 'animate-pulse'
                )}
              >
                {t.coverUrl ? (
                  <img
                    src={t.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setReady((p) => ({ ...p, [t.id]: true }))}
                    onError={() => setReady((p) => ({ ...p, [t.id]: true }))}
                    className={cn('h-full w-full object-cover transition-[opacity,transform] duration-300 ease-out group-hover:scale-[1.02]', ready[t.id] ? 'opacity-100' : 'opacity-0')}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Images aria-hidden="true" className="h-5 w-5 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  dot,
  dotColor,
  icon: Icon,
  delay = 0
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  dot?: boolean;
  dotColor?: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  delay?: number;
}) {
  return (
    <div
      className="animate-fade-up rounded-lg border bg-card p-4 font-mono shadow-soft transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-primary/30 hover:shadow-pop"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/80">
          {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary/75" /> : null}
          <span className="truncate">{label}</span>
        </span>
        {dot ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor)} /> : null}
      </div>
      <div className="mt-2 truncate text-xl font-semibold tracking-tight text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">{sub}</div>
    </div>
  );
}

function StatTileSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 font-mono shadow-soft">
      <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-7 w-3/4 animate-pulse rounded bg-muted/70" />
      <div className="mt-0.5 h-3.5 w-1/2 animate-pulse rounded bg-muted/60" />
    </div>
  );
}

function fmtDuration(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分钟`;
}


function RecentSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div>
      <div className="mb-2 h-3 w-16 animate-pulse rounded bg-muted" />
      <div className="flex gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('shrink-0 animate-pulse rounded-lg bg-muted/50', wide ? 'aspect-video w-44' : 'aspect-[9/16] w-28')} />
        ))}
      </div>
    </div>
  );
}
