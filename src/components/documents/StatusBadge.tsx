import React from 'react';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  name: string;
  color: string;
  className?: string;
  pulse?: boolean;
}

export function StatusBadge({ name, color, className, pulse }: StatusBadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        pulse && 'status-pulse',
        className
      )}
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}10`,
        color: color,
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </div>
  );
}
