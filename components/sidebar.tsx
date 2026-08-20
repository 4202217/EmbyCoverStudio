'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Images, Settings, ScrollText, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';

const NAV = [
  { href: '/', label: '概览', icon: LayoutDashboard },
  { href: '/targets', label: '封面管理', icon: Images },
  { href: '/settings', label: '设置', icon: Settings },
  { href: '/logs', label: '运行记录', icon: ScrollText }
];

type Status = {
  running?: boolean;
  emby?: { connected?: boolean; configured?: boolean; serverName?: string; version?: string };
  stats?: { failed?: number };
  sync?: { status?: string; running?: boolean; total?: number; done?: number; current?: string };
};

function useSystemStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingRefresh = false;
    const load = async () => {
      try {
        const s = await api<Status>('/api/status');
        if (!alive) return;
        setStatus(s);
        const active = !!s.sync?.running || s.sync?.status === 'paused';
        // 收到刷新事件后的第一轮即使还没进入运行态，也快速复查一次（2 秒），避免竞态导致延迟
        timer = setTimeout(load, active || pendingRefresh ? 2000 : 15000);
        pendingRefresh = false;
      } catch {
        if (!alive) return;
        setStatus(null);
        timer = setTimeout(load, 15000);
        pendingRefresh = false;
      }
    };
    const onRefresh = () => {
      if (timer) clearTimeout(timer);
      pendingRefresh = true;
      load();
    };
    window.addEventListener('ecs:status-refresh', onRefresh);
    load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('ecs:status-refresh', onRefresh);
    };
  }, []);
  return status;
}

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box = size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  const svgSize = size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-lg shadow-soft ring-1 ring-white/10', box)}>
      <svg viewBox="0 0 64 64" className={svgSize} aria-hidden="true">
        <defs>
          <linearGradient id="brand-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#1a2333" />
            <stop offset="1" stop-color="#0b101a" />
          </linearGradient>
          <linearGradient id="brand-e" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#1a7d28" />
            <stop offset="0.45" stop-color="#52B54B" />
            <stop offset="1" stop-color="#eaf7e7" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill="url(#brand-bg)" />
        <rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="#ffffff" stroke-opacity="0.08" />
        <g transform="translate(32 32) scale(1.35) translate(-12 -12)">
          <path
            fill="url(#brand-e)"
            d="M11.041 0c-.007 0-1.456 1.43-3.219 3.176L4.615 6.352l.512.513.512.512-2.819 2.791L0 12.961l1.83 1.848c1.006 1.016 2.438 2.46 3.182 3.209l1.351 1.359.508-.496c.28-.273.515-.498.524-.498.008 0 1.266 1.264 2.794 2.808L12.97 24l.187-.182c.23-.225 5.007-4.95 5.717-5.656l.52-.516-.502-.513c-.276-.282-.5-.52-.496-.53.003-.009 1.264-1.26 2.802-2.783 1.538-1.522 2.8-2.776 2.803-2.785.005-.012-3.617-3.684-6.107-6.193L17.65 4.6l-.505.505c-.279.278-.517.501-.53.497-.013-.005-1.27-1.267-2.793-2.805A449.655 449.655 0 0011.041 0z"
          />
          <path
            fill="#ffffff"
            d="M9.223 7.367c.091.038 7.951 4.608 7.957 4.627.003.013-1.781 1.056-3.965 2.32a999.898 999.898 0 01-3.996 2.307c-.019.006-.026-1.266-.026-4.629 0-3.7.007-4.634.03-4.625Z"
          />
        </g>
        <path fill="#ffbc1f" transform="translate(52 12) scale(0.62)" d="M0 -6 C1.1 -1.4 1.4 -1.1 6 0 C1.4 1.1 1.1 1.4 0 6 C-1.1 1.4 -1.4 1.1 -6 0 C-1.4 -1.1 -1.1 -1.4 0 -6 Z" />
      </svg>
    </div>
  );
}

export function Sidebar({ version, className }: { version: string; className?: string }) {
  const pathname = usePathname();
  const [changelog, setChangelog] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [update, setUpdate] = useState<{ hasUpdate?: boolean; current?: string; latest?: string; changelog?: string } | null>(null);
  const status = useSystemStatus();
  const failedCount = status?.stats?.failed || 0;
  const sync = status?.sync || null;
  const syncActive = !!sync?.running || sync?.status === 'paused';
  const syncPct = sync?.total ? Math.round(((sync.done || 0) / sync.total) * 100) : 0;

  useEffect(() => {
    api<{ text: string }>('/api/changelog')
      .then((d) => setChangelog(d.text || '暂无更新记录'))
      .catch(() => setChangelog('暂无更新记录'));
  }, []);

  useEffect(() => {
    const check = () => {
      api<{ hasUpdate?: boolean; current?: string; latest?: string; changelog?: string }>('/api/update/check')
        .then(setUpdate)
        .catch(() => setUpdate(null));
    };
    check();
    const timer = setInterval(check, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const state = (() => {
    const s = status;
    if (!s) return { color: 'bg-red-500', text: '服务不可用' };
    if (s.running) return { color: 'bg-sky-500', text: '正在同步…' };
    if ((s.stats?.failed || 0) > 0) return { color: 'bg-red-500', text: `${s.stats?.failed ?? 0} 个封面异常` };
    if (s.emby?.connected) return { color: 'bg-emerald-500', text: '已连接' };
    if (s.emby?.configured) return { color: 'bg-red-500', text: 'Emby 连接异常' };
    return { color: 'bg-slate-400', text: '未配置 Emby' };
  })();

  return (
    <aside className={cn('sticky top-0 hidden h-[100dvh] w-56 shrink-0 flex-col gap-5 overflow-hidden border-r bg-card/80 px-4 py-5 backdrop-blur-xl lg:flex', className)}>
      <div className="flex items-center gap-2.5 px-1">
        <BrandMark />
        <div>
          <div className="text-sm font-bold">Emby 封面工坊</div>
          <div className="text-xs text-muted-foreground">封面生成器</div>
        </div>
      </div>
      <nav className="scrollbar-none flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-[color,background-color,box-shadow] duration-150 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 after:absolute after:left-0 after:top-1/2 after:h-5 after:w-[3px] after:-translate-y-1/2 after:rounded-r-full after:bg-primary after:transition-opacity after:duration-150',
                active && 'bg-primary/10 font-semibold text-primary shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.12)] after:opacity-100',
                !active && 'after:opacity-0'
              )}
            >
              <Icon aria-hidden="true" className={cn('h-4 w-4 transition-transform duration-150 ease-out', active ? 'text-primary' : 'group-hover:scale-110')} />
              {item.label}
              {item.href === '/targets' && failedCount > 0 ? (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {failedCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {syncActive && sync ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate font-medium text-foreground/90">{sync.status === 'paused' ? '已暂停' : '封面更新中'}</span>
            <span className="shrink-0 font-mono text-muted-foreground">{syncPct}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              role="progressbar"
              aria-label="封面更新进度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={syncPct}
              className="h-full rounded-full bg-primary film-progress transition-[width] duration-500 ease-out"
              style={{ width: `${syncPct}%` }}
            />
          </div>
          <div className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">
            {sync.done ?? 0} / {sync.total ?? 0}
            {sync.current ? ` · ${sync.current}` : ''}
          </div>
        </div>
      ) : null}
      <div role="status" className="mt-auto overflow-hidden rounded-lg border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground shadow-soft">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">System</span>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', state.color, status?.running && 'animate-pulse')} />
        </div>
        <div className="mt-1.5 truncate text-[12px] font-medium text-foreground/90">{state.text}</div>
        <div className="mt-1 truncate text-[10px] text-muted-foreground/75">
          {status?.emby?.serverName
            ? `EMBY · ${status.emby.serverName}${status.emby.version ? ` · v${status.emby.version}` : ''}`
            : status?.emby?.configured
              ? 'EMBY · 连接异常'
              : 'EMBY · 未配置'}
        </div>
      </div>
      <Button variant="link" className="h-auto justify-start gap-1.5 px-1 font-mono text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>
        v{version}
        {update?.hasUpdate ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
            <Sparkles aria-hidden="true" className="h-2.5 w-2.5" />
            有新版本
          </span>
        ) : null}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="更新记录">
        {update?.hasUpdate ? (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <div className="mb-1 font-semibold text-amber-300">发现新版本 v{update.latest}</div>
            {update.changelog ? (
              <div className="space-y-1 text-muted-foreground">
                <Markdown text={update.changelog} />
              </div>
            ) : null}
          </div>
        ) : null}
        {update?.hasUpdate ? <div className="mb-3 border-t" /> : null}
        <div className="max-h-[60vh] overflow-auto text-xs leading-relaxed">{changelog ? <Markdown text={changelog} /> : '加载中…'}</div>
      </Modal>
    </aside>
  );
}

export function MobileNav({ version }: { version: string }) {
  const pathname = usePathname();
  const status = useSystemStatus();
  const failedCount = status?.stats?.failed || 0;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark size="sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight">Emby 封面工坊</div>
            <div className="truncate font-mono text-[10px] text-muted-foreground">v{version}</div>
          </div>
        </div>
      </div>
      <nav aria-label="主导航" className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-2">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-[color,background-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
                active ? 'bg-primary/10 text-primary' : 'hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon aria-hidden="true" className="h-3.5 w-3.5" />
              {item.label}
              {item.href === '/targets' && failedCount > 0 ? (
                <span className="ml-auto flex items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  {failedCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function Markdown({ text }: { text: string }) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) => {
    // **粗体** 与 `行内代码`
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
        return <strong key={i}>{p.slice(2, -2)}</strong>;
      }
      if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
        return (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono">
            {p.slice(1, -1)}
          </code>
        );
      }
      return <span key={i}>{p}</span>;
    });
  };

  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="my-1.5 space-y-1 pl-4">
        {list.map((li, i) => (
          <li key={i} className="list-disc">{inline(li)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  text.split('\n').forEach((raw) => {
    const line = esc(raw);
    if (/^###\s+/.test(line)) {
      flushList();
      blocks.push(<h4 key={blocks.length} className="mt-3 mb-1 font-semibold">{inline(line.replace(/^###\s+/, ''))}</h4>);
    } else if (/^##\s+/.test(line)) {
      flushList();
      blocks.push(<h3 key={blocks.length} className="mt-4 mb-1.5 text-sm font-bold">{inline(line.replace(/^##\s+/, ''))}</h3>);
    } else if (/^#\s+/.test(line)) {
      flushList();
      blocks.push(<h2 key={blocks.length} className="mt-4 mb-1.5 text-base font-bold">{inline(line.replace(/^#\s+/, ''))}</h2>);
    } else if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ''));
    } else if (!line.trim()) {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={blocks.length} className="my-1">{inline(line)}</p>);
    }
  });
  flushList();
  return <>{blocks}</>;
}
