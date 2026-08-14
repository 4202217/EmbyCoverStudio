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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div
        className={cn('my-auto max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg border bg-card p-5 shadow-xl', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
