'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Images, Layers, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { toast } from '@/components/toast-provider';
import { cn, fmtTime, TRIGGER_COLOR, TRIGGER_LABEL } from '@/lib/utils';
import { dominantColor } from '@/lib/dominant-color';

type Status = {
  running?: boolean;
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
  const [colors, setColors] = useState<Record<string, string | null>>({});
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
  const recentLibs = useMemo(
    () =>
      [...targets]
        .filter((t) => t.kind === 'library' && t.coverUrl && t.lastGeneratedAt)
        .sort((a, b) => new Date(b.lastGeneratedAt!).getTime() - new Date(a.lastGeneratedAt!).getTime())
        .slice(0, 5),
    [targets]
  );
  const recentCols = useMemo(
    () =>
      [...targets]
        .filter((t) => t.kind === 'collection' && t.coverUrl && t.lastGeneratedAt)
        .sort((a, b) => new Date(b.lastGeneratedAt!).getTime() - new Date(a.lastGeneratedAt!).getTime())
        .slice(0, 8),
    [targets]
  );
  const previewList = useMemo(
    () =>
      targets
        .filter((t) => t.coverUrl)
        .sort((a, b) => new Date(b.lastGeneratedAt || 0).getTime() - new Date(a.lastGeneratedAt || 0).getTime()),
    [targets]
  );
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    for (const t of previewList) {
      if (!t.coverUrl || colors[t.id] !== undefined) continue;
      dominantColor(t.coverUrl).then((c) => {
        if (alive) setColors((prev) => (prev[t.id] === c ? prev : { ...prev, [t.id]: c }));
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewList]);

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

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-card via-card/85 to-card/45 shadow-soft">
        <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-1/3 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div className="min-w-0">
            <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              <span className="inline-block h-px w-7 bg-gold/60" />
              Cinema Wall
            </div>
            <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">概览</h1>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">封面工坊运行状态一览</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HeroChip
              icon={<Server aria-hidden="true" className="h-3.5 w-3.5" />}
              label="Emby 服务器"
              value={status?.emby?.serverName || '未命名服务器'}
              dotColor={embyState.color}
            />
            <HeroChip
              icon={<CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />}
              label="定时任务"
              value={status?.cron || '—'}
            />
            <HeroChip
              icon={<Clock3 aria-hidden="true" className="h-3.5 w-3.5" />}
              label="下次运行"
              value={status?.webhookPending ? 'Webhook 待执行' : status?.nextRun ? fmtTime(status.nextRun) : '等待触发'}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {!loaded ? (
          [0, 1, 2, 3, 4].map((i) => <StatTileSkeleton key={i} />)
        ) : (
          <>
            <StatTile
              icon={Server}
              label="Emby 服务器"
              value={status?.emby?.serverName || '未命名服务器'}
              sub={status?.emby?.version ? `v${status.emby.version}` : status?.emby?.configured ? '已配置' : '未配置'}
              dot
              dotColor={embyState.color}
              delay={0}
            />
            <StatTile
              icon={Layers}
              label="监控合集"
              value={`${status?.stats?.enabled ?? 0} / ${status?.stats?.targets ?? 0}`}
              sub={`已生成封面 ${status?.stats?.generated ?? 0} 个`}
              delay={40}
            />
            <StatTile
              icon={Images}
              label="生成封面"
              value={status?.stats?.coversGenerated ?? 0}
              sub="累计生成（含重新生成）"
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

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>需要关注</CardTitle>
          {failedTargets.length || failedTasks.length ? (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-red-400">
              {failedTargets.length + failedTasks.length} 项
            </span>
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
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5 transition-colors duration-150 ease-out hover:bg-muted/50">
                        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-red-400" />
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
                      <div key={t.seq} className="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5 transition-colors duration-150 ease-out hover:bg-muted/50">
                        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-red-400" />
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
            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
            全部正常，无需关注
          </div>
        )}
      </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>最近生成</CardTitle>
          {recentLibs.length || recentCols.length ? (
            <Link
              href="/targets"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              全部封面
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
          ) : recentLibs.length || recentCols.length ? (
            <div className="space-y-4">
              {recentLibs.length ? (
                <RecentRow
                  title="媒体库"
                  items={recentLibs}
                  wide
                  colors={colors}
                  onPreview={(t) => {
                    setPreviewTarget(t);
                    setPreviewIndex(previewList.findIndex((x) => x.id === t.id));
                  }}
                />
              ) : null}
              {recentCols.length ? (
                <RecentRow
                  title="合集"
                  items={recentCols}
                  colors={colors}
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
                  className="max-h-[50vh] max-w-full rounded-lg object-contain"
                  style={glowShadow(colors[previewTarget.id])}
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
  colors,
  onPreview
}: {
  title: string;
  items: Target[];
  wide?: boolean;
  colors: Record<string, string | null>;
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
        <div className="flex gap-3">
          {items.map((t) => {
            const color = t.coverUrl ? colors[t.id] : null;
            return (
              <div key={t.id} className={cn('group shrink-0 cursor-pointer', wide ? 'w-36' : 'w-24')} onClick={() => onPreview(t)}>
                <div
                  className={cn(
                    'relative overflow-hidden rounded-lg border bg-muted/40 transition-[border-color,box-shadow,transform] duration-300 ease-out group-hover:border-primary/45 group-hover:shadow-pop',
                    wide ? 'aspect-video' : 'aspect-[9/16]',
                    !ready[t.id] && 'animate-pulse'
                  )}
                  style={color ? { borderColor: withAlpha(color, 0.33), boxShadow: `0 10px 30px -14px ${color}` } : undefined}
                >
                  <img
                    src={t.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onLoad={() => setReady((p) => ({ ...p, [t.id]: true }))}
                    onError={() => setReady((p) => ({ ...p, [t.id]: true }))}
                    className={cn('h-full w-full object-cover transition-[opacity,transform] duration-300 ease-out group-hover:scale-[1.04]', ready[t.id] ? 'opacity-100' : 'opacity-0')}
                  />
                  {t.kind === 'collection' || !t.template || t.template === 'single' ? (
                    <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/90 via-black/45 to-transparent px-1.5 py-1 text-[10px] leading-tight text-white transition-transform duration-200 ease-out hoverable:group-hover:translate-y-0">
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
                <div className="text-[11px] text-muted-foreground/80">{fmtTime(t.lastGeneratedAt)}</div>
              </div>
            );
          })}
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
      <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-5 w-3/4 animate-pulse rounded bg-muted/70" />
      <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded bg-muted/60" />
    </div>
  );
}

function HeroChip({
  icon,
  label,
  value,
  dotColor
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 backdrop-blur-sm transition-colors duration-150 ease-out hover:border-primary/30">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
          {label}
          {dotColor ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotColor)} /> : null}
        </div>
        <div className="mt-0.5 max-w-[180px] truncate font-mono text-xs font-semibold text-foreground/90">{value}</div>
      </div>
    </div>
  );
}

function RecentSkeleton({ wide }: { wide?: boolean }) {
  return (
    <div>
      <div className="mb-2 h-3 w-16 animate-pulse rounded bg-muted" />
      <div className="flex gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('shrink-0 animate-pulse rounded-lg bg-muted/50', wide ? 'aspect-video w-36' : 'aspect-[9/16] w-24')} />
        ))}
      </div>
    </div>
  );
}

function visibleGlowColor(color: string | null | undefined): string | undefined {
  if (!color) return undefined;
  const m = color.match(/\d+/g);
  if (m && m.length >= 3) {
    const [r, g, b] = m.map(Number);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum < 0.32) return 'hsl(var(--primary))';
  }
  return color;
}

function withAlpha(color: string, alpha: number): string {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  return `hsl(var(--primary) / ${alpha})`;
}

function glowShadow(color: string | null | undefined): { boxShadow: string } | undefined {
  const g = visibleGlowColor(color);
  if (!g) return undefined;
  return { boxShadow: `0 0 0 1px ${withAlpha(g, 0.4)}, 0 0 18px 2px ${withAlpha(g, 0.55)}, 0 0 44px 10px ${withAlpha(g, 0.28)}` };
}
