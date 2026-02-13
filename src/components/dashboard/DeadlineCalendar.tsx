import React, { useMemo, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, FileText, Clock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkflowStore } from '@/stores/workflowStore';
import { cn } from '@/lib/utils';

const MONTH_NAMES = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

interface CalendarEvent {
  instanceId: string;
  documentName: string;
  deadline: string;
  isOverdue: boolean;
  isCompleted: boolean;
  daysLeft: number;
}

export function DeadlineCalendar() {
  const { instances } = useWorkflowStore();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const goToPrev = useCallback(() => {
    setCurrentMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { ...prev, month: prev.month - 1 };
    });
  }, []);

  const goToNext = useCallback(() => {
    setCurrentMonth((prev) => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { ...prev, month: prev.month + 1 };
    });
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() });
  }, []);

  // Build events from instances with deadlines
  const events = useMemo<Map<string, CalendarEvent[]>>(() => {
    const map = new Map<string, CalendarEvent[]>();
    const now = new Date();

    for (const inst of instances) {
      if (!inst.deadline) continue;
      const deadlineDate = new Date(inst.deadline);
      const dateKey = deadlineDate.toISOString().split('T')[0];
      const diffDays = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const event: CalendarEvent = {
        instanceId: inst.id,
        documentName: inst.documentName,
        deadline: inst.deadline,
        isOverdue: !inst.completedAt && diffDays < 0,
        isCompleted: !!inst.completedAt,
        daysLeft: diffDays,
      };

      const existing = map.get(dateKey) || [];
      existing.push(event);
      map.set(dateKey, existing);
    }
    return map;
  }, [instances]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const { year, month } = currentMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Get day of week (Monday=0)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean }[] = [];

    // Previous month padding
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false, isToday: false });
    }

    // Current month
    const today = new Date();
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      days.push({
        date,
        isCurrentMonth: true,
        isToday: date.toDateString() === today.toDateString(),
      });
    }

    // Next month padding
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: d, isCurrentMonth: false, isToday: false });
      }
    }

    return days;
  }, [currentMonth]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendrier des échéances
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={goToToday}>
              Aujourd'hui
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm font-semibold">
          {MONTH_NAMES[currentMonth.month]} {currentMonth.year}
        </p>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={200}>
          {/* Day names header */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px">
            {calendarDays.map((day, idx) => {
              const dateKey = day.date.toISOString().split('T')[0];
              const dayEvents = events.get(dateKey) || [];
              const hasOverdue = dayEvents.some((e) => e.isOverdue);
              const hasActive = dayEvents.some((e) => !e.isCompleted && !e.isOverdue);
              const allCompleted = dayEvents.length > 0 && dayEvents.every((e) => e.isCompleted);

              return (
                <Tooltip key={idx}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'relative flex flex-col items-center rounded-md p-1 min-h-[36px] transition-colors cursor-default',
                        !day.isCurrentMonth && 'opacity-30',
                        day.isToday && 'ring-2 ring-primary bg-primary/5',
                        dayEvents.length > 0 && 'hover:bg-muted/60',
                      )}
                    >
                      <span className={cn(
                        'text-xs',
                        day.isToday && 'font-bold text-primary',
                      )}>
                        {day.date.getDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {hasOverdue && <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
                          {hasActive && <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                          {allCompleted && <div className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  {dayEvents.length > 0 && (
                    <TooltipContent side="bottom" className="max-w-[240px] p-0">
                      <div className="px-3 py-2">
                        <p className="text-xs font-semibold text-white mb-1">
                          {day.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
                          {' — '}{dayEvents.length} échéance{dayEvents.length > 1 ? 's' : ''}
                        </p>
                        <ul className="space-y-1">
                          {dayEvents.map((evt) => (
                            <li key={evt.instanceId} className="flex items-start gap-1.5 text-[11px]">
                              {evt.isOverdue ? (
                                <AlertTriangle className="h-3 w-3 shrink-0 text-red-400 mt-0.5" />
                              ) : evt.isCompleted ? (
                                <Clock className="h-3 w-3 shrink-0 text-green-400 mt-0.5" />
                              ) : (
                                <FileText className="h-3 w-3 shrink-0 text-white/50 mt-0.5" />
                              )}
                              <span className="text-white">
                                {evt.documentName}
                                {evt.isOverdue && <span className="text-red-300 ml-1">(en retard)</span>}
                                {evt.isCompleted && <span className="text-green-300 ml-1">(terminé)</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> En retard</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> À venir</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Terminé</span>
        </div>
      </CardContent>
    </Card>
  );
}
