'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn, fmtTime, TRIGGER_LABEL } from '@/lib/utils';

type Task = {
  seq: number;
  name: string;
  type: string;
  ts: string;
  trigger: string;
  status: string;
  updated?: number;
  unchanged?: number;
  failed?: number;
  error?: string;
};

type Log = { ts: string; level: string; message: string };

const TYPE_LABEL: Record<string, string> = { single: '单张生成', batch: '批量更新', sync: '全量同步', precise: '精准更新' };

async function api<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`);
  return data as T;
}

export default function LogsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [sortKey, setSortKey] = useState<string>('seq');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [levelFilter, setLevelFilter] = useState<string>('all');

  const load = async () => {
    try {
      const [t, l] = await Promise.all([api<{ tasks: Task[] }>('/api/tasks'), api<{ logs: Log[] }>('/api/logs')]);
      setTasks(t.tasks);
      setLogs(l.logs);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sortedTasks = [...tasks]
    .filter((t) => levelFilter === 'all' || t.status === levelFilter)
    .sort((a, b) => {
      const cmp =
        sortKey === 'seq'
          ? (a.seq || 0) - (b.seq || 0)
          : sortKey === 'ts'
            ? new Date(a.ts).getTime() - new Date(b.ts).getTime()
            : String(a[sortKey as keyof Task] || '').localeCompare(String(b[sortKey as keyof Task] || ''), 'zh-CN');
      return cmp * sortDir;
    });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(key === 'seq' || key === 'ts' ? -1 : 1);
    }
  };

  const statusBadge = (s: string) =>
    s === 'success' ? <Badge variant="success">成功</Badge> : s === 'failed' ? <Badge variant="destructive">失败</Badge> : s === 'cancelled' ? <Badge variant="muted">已取消</Badge> : <Badge variant="warning">已暂停</Badge>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">运行记录</h1>
        <p className="text-sm text-muted-foreground">任务记录与系统日志，供需要时排查</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>任务记录</CardTitle>
          <div className="flex items-center gap-2">
            <select className="h-8 rounded-md border bg-transparent px-2 text-xs" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="all">全部结果</option>
              <option value="success">成功</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
              <option value="paused">已暂停</option>
            </select>
            <Button size="sm" variant="outline" onClick={load}>
              刷新
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('seq')}>序号</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('name')}>名称</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('type')}>类型</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('ts')}>时间</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('trigger')}>触发方式</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort('status')}>结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.slice(0, 100).map((t) => (
                <TableRow key={t.seq}>
                  <TableCell className="text-muted-foreground">{t.seq}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{TYPE_LABEL[t.type] || t.type || '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtTime(t.ts)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{TRIGGER_LABEL[t.trigger] || t.trigger || '—'}</Badge>
                  </TableCell>
                  <TableCell>
                    {statusBadge(t.status)}
                    {t.updated ? <div className="mt-0.5 text-[11px] text-muted-foreground">更新 {t.updated} 个</div> : null}
                    {t.status === 'failed' && t.error ? <div className="mt-0.5 max-w-[260px] truncate text-[11px] text-red-400" title={t.error}>{t.error}</div> : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>运行日志</CardTitle>
          <span className="text-xs text-muted-foreground">共 {logs.length} 条</span>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>级别</TableHead>
                <TableHead>内容</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.slice(0, 100).map((l, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs text-muted-foreground">{fmtTime(l.ts)}</TableCell>
                  <TableCell>
                    <Badge variant={l.level === 'error' ? 'destructive' : l.level === 'warn' ? 'warning' : 'secondary'}>{l.level}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{l.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
