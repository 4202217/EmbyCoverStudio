'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Film, LayoutDashboard, Images, Settings, ScrollText, Sparkles } from 'lucide-react';
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

export function Sidebar({ version }: { version: string }) {
  const pathname = usePathname();
  const [changelog, setChangelog] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [update, setUpdate] = useState<{ hasUpdate?: boolean; current?: string; latest?: string; changelog?: string } | null>(null);
  const [status, setStatus] = useState<{ running?: boolean; emby?: { connected?: boolean; configured?: boolean; serverName?: string }; stats?: { failed?: number } } | null>(null);

  useEffect(() => {
    api<{ text: string }>('/api/changelog')
      .then((d) => setChangelog(d.text || '暂无更新记录'))
      .catch(() => setChangelog('暂无更新记录'));
  }, []);

  useEffect(() => {
    const load = () => {
      api<{ running?: boolean; emby?: { connected?: boolean; configured?: boolean; serverName?: string }; stats?: { failed?: number } }>('/api/status')
        .then(setStatus)
        .catch(() => setStatus(null));
    };
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
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
    if (s.emby?.connected) return { color: 'bg-emerald-500', text: `已连接 ${s.emby.serverName || 'Emby'}` };
    if (s.emby?.configured) return { color: 'bg-red-500', text: 'Emby 连接异常' };
    return { color: 'bg-slate-400', text: '未配置 Emby' };
  })();

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-5 border-r bg-card/80 px-4 py-5 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-1">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky-700 text-white shadow-soft">
          <Film aria-hidden="true" className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-bold">Emby 封面工坊</div>
          <div className="text-xs text-muted-foreground">封面生成器</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-[color,background-color,box-shadow] duration-150 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 after:absolute after:left-0 after:top-1/2 after:h-4 after:w-[3px] after:-translate-y-1/2 after:rounded-r-full after:bg-primary after:transition-opacity after:duration-150',
                active && 'bg-primary/10 text-primary font-semibold after:opacity-100',
                !active && 'after:opacity-0'
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div role="status" className="mt-auto overflow-hidden rounded-md border bg-card p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground shadow-soft">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground/60">System</span>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', state.color, status?.running && 'animate-pulse')} />
        </div>
        <div className="mt-1 truncate text-foreground/90">{state.text}</div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
          {status?.emby?.serverName
            ? `EMBY · ${status.emby.serverName}`
            : status?.emby?.configured
              ? 'EMBY · 连接异常'
              : 'EMBY · 未配置'}
        </div>
      </div>
      <Button variant="link" className="h-auto justify-start gap-1.5 px-1 font-mono text-xs text-muted-foreground" onClick={() => setOpen(true)}>
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
