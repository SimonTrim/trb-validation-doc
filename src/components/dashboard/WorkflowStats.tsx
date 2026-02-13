import React, { useMemo } from 'react';
import {
  GitBranch, Clock, CheckCircle, XCircle, Users,
  TrendingUp, Timer, AlertTriangle, BarChart3, ArrowRight,
  Zap, Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useDocumentStore } from '@/stores/documentStore';
import { formatDate } from '@/lib/utils';

interface WorkflowMetrics {
  definitionId: string;
  name: string;
  totalInstances: number;
  activeInstances: number;
  completedInstances: number;
  averageCompletionTimeMs: number;
  minCompletionTimeMs: number;
  maxCompletionTimeMs: number;
  approvalRate: number;
  rejectionRate: number;
  totalReviews: number;
  completedReviews: number;
  bottleneckNode: string | null;
  bottleneckAvgTimeMs: number;
  overdueCount: number;
  onTimeRate: number;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—';
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${Math.round(ms / (1000 * 60))} min`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `${days.toFixed(1)}j`;
  return `${Math.round(days / 7)} sem.`;
}

export function WorkflowStats() {
  const { definitions, instances } = useWorkflowStore();
  const { documents } = useDocumentStore();

  const metrics = useMemo<WorkflowMetrics[]>(() => {
    return definitions.map((def) => {
      const defInstances = instances.filter((i) => i.workflowDefinitionId === def.id);
      const active = defInstances.filter((i) => !i.completedAt);
      const completed = defInstances.filter((i) => !!i.completedAt);

      // Completion time stats
      const completionTimes = completed
        .map((i) => new Date(i.completedAt!).getTime() - new Date(i.startedAt).getTime())
        .filter((t) => t > 0);

      const avgCompletionTime = completionTimes.length > 0
        ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
        : 0;
      const minCompletionTime = completionTimes.length > 0 ? Math.min(...completionTimes) : 0;
      const maxCompletionTime = completionTimes.length > 0 ? Math.max(...completionTimes) : 0;

      // Approval/rejection rates
      const finalStatuses = completed.map((i) => i.currentStatusId);
      const approvals = finalStatuses.filter((s) => ['approved', 'vso', 'vao'].includes(s)).length;
      const rejections = finalStatuses.filter((s) => ['rejected', 'refused'].includes(s)).length;
      const approvalRate = completed.length > 0 ? (approvals / completed.length) * 100 : 0;
      const rejectionRate = completed.length > 0 ? (rejections / completed.length) * 100 : 0;

      // Reviews
      const totalReviews = defInstances.reduce((acc, i) => acc + i.reviews.length, 0);
      const completedReviews = defInstances.reduce(
        (acc, i) => acc + i.reviews.filter((r) => r.isCompleted).length, 0
      );

      // Bottleneck detection — node where instances spend the most time
      const nodeTimings: Record<string, { totalMs: number; count: number; name: string }> = {};
      for (const inst of defInstances) {
        for (let i = 0; i < inst.history.length - 1; i++) {
          const entry = inst.history[i];
          const next = inst.history[i + 1];
          const durationMs = new Date(next.timestamp).getTime() - new Date(entry.timestamp).getTime();
          const nodeId = entry.toNodeId;
          const node = def.nodes.find((n) => n.id === nodeId);
          if (!nodeTimings[nodeId]) {
            nodeTimings[nodeId] = { totalMs: 0, count: 0, name: (node?.data.label as string) || nodeId };
          }
          nodeTimings[nodeId].totalMs += durationMs;
          nodeTimings[nodeId].count++;
        }
      }

      let bottleneckNode: string | null = null;
      let bottleneckAvgTimeMs = 0;
      for (const [nodeId, timing] of Object.entries(nodeTimings)) {
        const avg = timing.totalMs / timing.count;
        if (avg > bottleneckAvgTimeMs) {
          bottleneckAvgTimeMs = avg;
          bottleneckNode = timing.name;
        }
      }

      // Deadline tracking
      const withDeadline = defInstances.filter((i) => i.deadline);
      const overdue = withDeadline.filter((i) => {
        if (i.completedAt) {
          return new Date(i.completedAt) > new Date(i.deadline!);
        }
        return new Date() > new Date(i.deadline!);
      });
      const onTime = withDeadline.filter((i) => {
        if (i.completedAt) {
          return new Date(i.completedAt) <= new Date(i.deadline!);
        }
        return new Date() <= new Date(i.deadline!);
      });
      const onTimeRate = withDeadline.length > 0 ? (onTime.length / withDeadline.length) * 100 : 100;

      return {
        definitionId: def.id,
        name: def.name,
        totalInstances: defInstances.length,
        activeInstances: active.length,
        completedInstances: completed.length,
        averageCompletionTimeMs: avgCompletionTime,
        minCompletionTimeMs: minCompletionTime,
        maxCompletionTimeMs: maxCompletionTime,
        approvalRate,
        rejectionRate,
        totalReviews,
        completedReviews,
        bottleneckNode,
        bottleneckAvgTimeMs,
        overdueCount: overdue.length,
        onTimeRate,
      };
    });
  }, [definitions, instances]);

  if (metrics.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">Aucun workflow défini</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {metrics.map((m) => (
          <Card key={m.definitionId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">{m.name}</CardTitle>
                </div>
                <Badge variant="outline" className="text-xs">
                  {m.totalInstances} instance{m.totalInstances > 1 ? 's' : ''}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniKPI
                  icon={<Activity className="h-3.5 w-3.5 text-blue-500" />}
                  label="Actifs"
                  value={String(m.activeInstances)}
                />
                <MiniKPI
                  icon={<CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                  label="Terminés"
                  value={String(m.completedInstances)}
                />
                <MiniKPI
                  icon={<Timer className="h-3.5 w-3.5 text-amber-500" />}
                  label="Temps moyen"
                  value={formatDuration(m.averageCompletionTimeMs)}
                />
                <MiniKPI
                  icon={<Users className="h-3.5 w-3.5 text-purple-500" />}
                  label="Visas"
                  value={`${m.completedReviews}/${m.totalReviews}`}
                />
              </div>

              <Separator />

              {/* Approval rate bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Taux d'approbation</span>
                  <span className="font-medium">{m.approvalRate.toFixed(0)}%</span>
                </div>
                <div className="flex h-2 w-full rounded-full overflow-hidden bg-muted">
                  <div
                    className="bg-green-500 transition-all duration-500"
                    style={{ width: `${m.approvalRate}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all duration-500"
                    style={{ width: `${m.rejectionRate}%` }}
                  />
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Approuvé {m.approvalRate.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> Rejeté {m.rejectionRate.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/30" /> Autre {(100 - m.approvalRate - m.rejectionRate).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Bottleneck & Deadlines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Bottleneck */}
                {m.bottleneckNode && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      Goulot d'étranglement
                    </div>
                    <p className="text-sm font-medium">{m.bottleneckNode}</p>
                    <p className="text-xs text-muted-foreground">
                      Temps moyen : {formatDuration(m.bottleneckAvgTimeMs)}
                    </p>
                  </div>
                )}

                {/* Deadline compliance */}
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    Respect des délais
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.onTimeRate.toFixed(0)}%</span>
                    {m.overdueCount > 0 && (
                      <Badge variant="outline" className="text-[10px] text-red-600 border-red-200">
                        {m.overdueCount} en retard
                      </Badge>
                    )}
                  </div>
                  <Progress value={m.onTimeRate} className="h-1.5" />
                </div>
              </div>

              {/* Timing range */}
              {m.completedInstances > 0 && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>⏱️ Min : {formatDuration(m.minCompletionTimeMs)}</span>
                  <span>Moy : {formatDuration(m.averageCompletionTimeMs)}</span>
                  <span>Max : {formatDuration(m.maxCompletionTimeMs)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </TooltipProvider>
  );
}

function MiniKPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5 text-center space-y-1">
      <div className="flex items-center justify-center gap-1 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
