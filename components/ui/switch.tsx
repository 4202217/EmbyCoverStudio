import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <label className={cn('relative inline-flex h-5 w-9 cursor-pointer items-center', className)}>
      <input
        type="checkbox"
        ref={ref}
        className="peer sr-only"
        onChange={(e) => {
          onChange?.(e);
          onCheckedChange?.(e.target.checked);
        }}
        {...props}
      />
      <span className="absolute inset-0 rounded-full bg-muted transition-colors duration-200 ease-out peer-checked:bg-primary peer-disabled:cursor-not-allowed peer-disabled:opacity-50" />
      <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out peer-checked:translate-x-4 motion-reduce:transition-none" />
    </label>
  )
);
Switch.displayName = 'Switch';

export { Switch };
