'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/data-table';
import { api } from '@/lib/api';
import { cn, fmtTime, TRIGGER_COLOR, TRIGGER_LABEL } from '@/lib/utils';

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

export default function LogsPage() {
  const [logCount, setLogCount] = useState(0);

  const taskColumns: Column<Task>[] = [
    { key: 'seq', label: '序号', width: '70px', sortable: true, render: (t) => <span className="text-muted-foreground">{t.seq ?? ''}</span> },
    { key: 'name', label: '名称', sortable: true, render: (t) => <span className="whitespace-nowrap">{t.name}</span> },
    {
      key: 'type',
      label: '类型',
      width: '104px',
      sortable: true,
      filterOpts: Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
      render: (t) => <span className="whitespace-nowrap">{TYPE_LABEL[t.type] || t.type || '—'}</span>
    },
    { key: 'ts', label: '时间', width: '170px', sortable: true, render: (t) => <span className="text-xs text-muted-foreground">{fmtTime(t.ts)}</span> },
    {
      key: 'trigger',
      label: '触发方式',
      width: '116px',
      sortable: true,
      filterOpts: Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label })),
      render: (t) => (
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', TRIGGER_COLOR[t.trigger || 'manual'] || 'bg-slate-500/15 text-slate-300')}>
          {TRIGGER_LABEL[t.trigger] || t.trigger || '—'}
        </span>
      )
    },
    {
      key: 'status',
      label: '结果',
      width: '150px',
      sortable: true,
      filterOpts: [
        { value: 'success', label: '成功' },
        { value: 'failed', label: '失败' },
        { value: 'cancelled', label: '已取消' },
        { value: 'paused', label: '已暂停' }
      ],
      render: (t) => {
        const badge =
          t.status === 'success' ? (
            <Badge variant="success">成功</Badge>
          ) : t.status === 'failed' ? (
            <Badge variant="destructive">失败</Badge>
          ) : t.status === 'cancelled' ? (
            <Badge variant="muted">已取消</Badge>
          ) : (
            <Badge variant="warning">已暂停</Badge>
          );
        const detail = [t.updated ? `更新 ${t.updated}` : '', t.unchanged ? `无变化 ${t.unchanged}` : '', t.failed ? `失败 ${t.failed}` : '']
          .filter(Boolean)
          .join('，');
        return (
          <div>
            {badge}
            {detail ? <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div> : null}
            {t.status === 'failed' && t.error ? (
              <div className="mt-0.5 max-w-[240px] whitespace-pre-wrap break-words text-[11px] text-red-400" title={t.error}>
                {t.error}
              </div>
            ) : null}
          </div>
        );
      }
    }
  ];

  const logColumns: Column<Log>[] = [
    { key: 'ts', label: '时间', width: '170px', sortable: true, render: (l) => <span className="text-xs text-muted-foreground">{fmtTime(l.ts)}</span> },
    {
      key: 'level',
      label: '级别',
      width: '80px',
      sortable: true,
      filterOpts: [
        { value: 'info', label: 'info' },
        { value: 'warn', label: 'warn' },
        { value: 'error', label: 'error' }
      ],
      render: (l) => (
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-xs font-medium',
            l.level === 'error'
              ? 'bg-red-500/15 text-red-400'
              : l.level === 'warn'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-slate-500/15 text-slate-300'
          )}
        >
          {l.level}
        </span>
      )
    },
    { key: 'message', label: '内容', render: (l) => <span className="whitespace-pre-wrap break-words text-xs">{l.message}</span> }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">运行记录</h1>
        <p className="text-sm text-muted-foreground">任务记录与系统日志，供需要时排查</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>任务记录</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={taskColumns}
            fetchData={() => api<{ tasks: Task[] }>('/api/tasks').then((r) => r.tasks || [])}
            fetchPage={async (page, pageSize) => {
              const r = await api<{ tasks: Task[]; total: number }>(`/api/tasks?page=${page}&pageSize=${pageSize}`);
              return { rows: r.tasks || [], total: r.total || 0 };
            }}
            pageSize={50}
            emptyText="暂无任务记录"
            initialSort={{ key: 'seq', dir: -1 }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>运行日志</CardTitle>
          <span className="text-xs text-muted-foreground">共 {logCount} 条</span>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={logColumns}
            fetchData={() => api<{ logs: Log[] }>('/api/logs').then((r) => r.logs || [])}
            emptyText="暂无日志"
            initialSort={{ key: 'ts', dir: -1 }}
            onLoaded={(rows) => setLogCount(rows.length)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
