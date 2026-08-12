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
