'use client';

import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export type ConfirmState = {
  title: string;
  description: string;
  confirmText?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({ state, onClose }: { state: ConfirmState | null; onClose: () => void }) {
  return (
    <Modal open={!!state} onClose={onClose} title={state?.title || '确认操作'}>
      {state ? (
        <div>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/15">
              <AlertTriangle className="h-4 w-4 text-red-400" />
            </span>
            <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{state.description}</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button
              size="sm"
              variant={state.destructive === false ? 'default' : 'destructive'}
              onClick={() => {
                onClose();
                state.onConfirm();
              }}
            >
              {state.confirmText || '确认'}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
