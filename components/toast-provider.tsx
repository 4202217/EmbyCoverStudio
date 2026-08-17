'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastType = 'ok' | 'err' | 'info';
type ToastItem = { id: number; type: ToastType; text: string; leaving?: boolean };

let pushToast: ((type: ToastType, text: string) => void) | null = null;

export function toast(type: ToastType | string, text?: string) {
  if (text === undefined) {
    text = type;
    type = 'info';
  }
  pushToast?.(type as ToastType, text);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const removeSoon = (id: number) => {
    setItems((list) => list.map((t) => (t.id === id && !t.leaving ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 180);
  };

  useEffect(() => {
    pushToast = (type, text) => {
      const id = Date.now() + Math.random();
      setItems((list) => [...list, { id, type, text }]);
      setTimeout(() => removeSoon(id), 4200);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  const dismiss = (id: number) => removeSoon(id);

  return (
    <>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-md border bg-card px-3 py-2.5 text-xs shadow-lg transition-[transform,opacity] duration-150 ease-out motion-reduce:translate-y-0 animate-in fade-in slide-in-from-bottom-3 duration-200 ease-out motion-reduce:animate-none',
              t.type === 'ok' && 'border-emerald-500/40',
              t.type === 'err' && 'border-red-500/40',
              t.type === 'info' && 'border-border',
              t.leaving && 'translate-y-2 opacity-0'
            )}
          >
            {t.type === 'ok' ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : null}
            {t.type === 'err' ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" /> : null}
            {t.type === 'info' ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" /> : null}
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => dismiss(t.id)} aria-label="关闭">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
