'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Film, LayoutDashboard, Images, Settings, ScrollText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

  useEffect(() => {
    fetch('/api/changelog')
      .then((r) => r.json())
      .then((d) => setChangelog(d.text || '暂无更新记录'))
      .catch(() => setChangelog('暂无更新记录'));
  }, []);

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
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          已连接 Emby
        </div>
      </div>
      <Button variant="link" className="h-auto justify-start px-1 text-xs text-muted-foreground" onClick={() => {
        if (changelog) window.alert(changelog);
      }}>
        v{version}
      </Button>
    </aside>
  );
}
