'use client';

import { useEffect, useRef, useState } from 'react';
import { registerTokenPrompt } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';

export function TokenPrompt() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const resolver = useRef<((token: string) => void) | null>(null);

  useEffect(() => {
    registerTokenPrompt((resolve) => {
      resolver.current = resolve;
      setValue('');
      setOpen(true);
    });
  }, []);

  const finish = (token: string) => {
    resolver.current?.(token);
    resolver.current = null;
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={() => finish('')} title="访问令牌">
      <p className="mb-3 text-xs text-muted-foreground">服务端已开启访问令牌，请输入后继续（会保存在本机浏览器）。</p>
      <PasswordInput
        aria-label="访问令牌"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="访问令牌"
        autoFocus
        onKeyDown={(e) => e.key === 'Enter' && finish(value.trim())}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => finish('')}>
          取消
        </Button>
        <Button size="sm" onClick={() => finish(value.trim())}>
          保存并继续
        </Button>
      </div>
    </Modal>
  );
}
