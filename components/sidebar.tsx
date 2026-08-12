'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Film, LayoutDashboard, Images, Settings, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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
    <aside className="flex w-56 shrink-0 flex-col gap-5 border-r bg-card px-4 py-5">
      <div className="flex items-center gap-2.5 px-1">
        <Film className="h-7 w-7 text-primary" />
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
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                active && 'bg-accent text-primary font-semibold'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-md border bg-muted/40 p-2.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', state.color)} />
          {state.text}
        </div>
      </div>
      <Button variant="link" className="h-auto justify-start px-1 text-xs text-muted-foreground" onClick={() => setOpen(true)}>
        v{version}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[75vh] w-full max-w-lg overflow-auto rounded-lg border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">更新记录</h2>
              <button className="text-muted-foreground hover:text-foreground" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="max-h-[60vh] overflow-auto text-xs leading-relaxed">{changelog ? <Markdown text={changelog} /> : '加载中…'}</div>
          </div>
        </div>
      ) : null}
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
