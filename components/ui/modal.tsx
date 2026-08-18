'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const list = focusables ? Array.from(focusables) : [];
    if (list.length) list[0].focus();
    else panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      lastFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby={description ? 'modal-description' : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 !m-0 animate-in fade-in duration-200 ease-out motion-reduce:animate-none"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby={title ? 'modal-title' : undefined}
        className={cn(
          'my-auto max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border bg-card p-5 shadow-pop outline-none animate-in fade-in zoom-in-95 duration-200 ease-out motion-reduce:animate-none',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          {title ? (
            <h2 id="modal-title" className="text-sm font-semibold tracking-tight">
              {title}
            </h2>
          ) : null}
          <button className="cursor-pointer p-1.5 -m-1.5 text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-95" onClick={onClose} aria-label="关闭">
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {description ? (
          <p id="modal-description" className="mb-3 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
  return createPortal(overlay, document.body);
}
