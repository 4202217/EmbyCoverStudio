import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

export const TRIGGER_LABEL: Record<string, string> = {
  manual: '手动',
  batch: '批量操作',
  scheduler: '定时任务',
  webhook: 'Webhook',
  startup: '服务启动',
  resume: '继续任务',
  enable: '启用合集'
};

export const TRIGGER_COLOR: Record<string, string> = {
  manual: 'bg-slate-500/15 text-slate-300',
  batch: 'bg-purple-500/15 text-purple-300',
  scheduler: 'bg-amber-500/15 text-amber-300',
  webhook: 'bg-emerald-500/15 text-emerald-300',
  startup: 'bg-sky-500/15 text-sky-300',
  resume: 'bg-teal-500/15 text-teal-300',
  enable: 'bg-pink-500/15 text-pink-300'
};
