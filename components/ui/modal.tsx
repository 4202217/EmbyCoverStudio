'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  children,
  className
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 !m-0 animate-in fade-in duration-200 ease-out motion-reduce:animate-none" onClick={onClose}>
      <div
        className={cn(
          'my-auto max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg border bg-card p-5 shadow-pop animate-in fade-in zoom-in-95 duration-200 ease-out motion-reduce:animate-none',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
          <button className="cursor-pointer p-1.5 -m-1.5 text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-95" onClick={onClose} aria-label="关闭">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
