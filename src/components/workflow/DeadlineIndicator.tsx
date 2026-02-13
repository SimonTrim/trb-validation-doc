import React, { useMemo } from 'react';
import { Clock, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface DeadlineIndicatorProps {
  deadline: string;
  completedAt?: string;
  className?: string;
  compact?: boolean;
}

export function DeadlineIndicator({ deadline, completedAt, className, compact = false }: DeadlineIndicatorProps) {
  const info = useMemo(() => {
    const deadlineDate = new Date(deadline);
    const now = new Date();

    if (completedAt) {
      const completed = new Date(completedAt);
      const wasOnTime = completed <= deadlineDate;
      return {
        status: wasOnTime ? 'completed-on-time' : 'completed-late',
        label: wasOnTime ? 'Terminé à temps' : 'Terminé en retard',
        color: wasOnTime ? 'text-green-600' : 'text-amber-600',
        bgColor: wasOnTime ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200',
        icon: wasOnTime ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />,
        daysText: '',
      };
    }

    const diffMs = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        status: 'overdue',
        label: `En retard (${Math.abs(diffDays)}j)`,
        color: 'text-red-600',
        bgColor: 'bg-red-50 border-red-200',
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        daysText: `${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''} de retard`,
      };
    } else if (diffDays <= 2) {
      return {
        status: 'urgent',
        label: diffDays === 0 ? 'Échéance aujourd\'hui' : `${diffDays}j restant${diffDays > 1 ? 's' : ''}`,
        color: 'text-orange-600',
        bgColor: 'bg-orange-50 border-orange-200',
        icon: <AlertCircle className="h-3.5 w-3.5" />,
        daysText: diffDays === 0 ? 'Échéance aujourd\'hui !' : `${diffDays} jour${diffDays > 1 ? 's' : ''} restant${diffDays > 1 ? 's' : ''}`,
      };
    } else if (diffDays <= 7) {
      return {
        status: 'warning',
        label: `${diffDays}j restants`,
        color: 'text-amber-600',
        bgColor: 'bg-amber-50 border-amber-200',
        icon: <Clock className="h-3.5 w-3.5" />,
        daysText: `${diffDays} jours restants`,
      };
    } else {
      return {
        status: 'ok',
        label: `${diffDays}j restants`,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50 border-muted',
        icon: <Clock className="h-3.5 w-3.5" />,
        daysText: `${diffDays} jours restants`,
      };
    }
  }, [deadline, completedAt]);

  const formattedDeadline = new Date(deadline).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn('flex items-center gap-1', info.color, className)}>
              {info.icon}
              <span className="text-xs font-medium">{info.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
          <p className="text-xs text-white">Échéance : {formattedDeadline}</p>
          {info.daysText && <p className="text-xs text-white/70">{info.daysText}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'gap-1 text-xs font-medium',
              info.bgColor,
              info.color,
              info.status === 'overdue' && 'animate-pulse',
              className
            )}
          >
            {info.icon}
            {info.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs font-medium text-white">Échéance : {formattedDeadline}</p>
          {info.daysText && <p className="text-xs text-white/70">{info.daysText}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
