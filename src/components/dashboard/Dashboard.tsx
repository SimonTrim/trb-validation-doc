import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  FileText, Clock, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, ArrowRight, GitBranch, Eye, Users, Zap,
  History, Download, Loader2, CalendarClock, BarChart3,
  GripVertical, Settings2, RotateCcw, EyeOff,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/documents/StatusBadge';
import { DeadlineIndicator } from '@/components/workflow/DeadlineIndicator';
import { WorkflowStats } from './WorkflowStats';
import { DeadlineCalendar } from './DeadlineCalendar';
import { useDashboardLayout } from '@/hooks/useDashboardLayout';
import { Switch } from '@/components/ui/switch';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAppStore } from '@/stores/appStore';
import { DOCUMENT_VALIDATION_STATUSES } from '@/models/workflow';
import { formatDate } from '@/lib/utils';

export function Dashboard() {
  const { documents } = useDocumentStore();
  const { instances, definitions } = useWorkflowStore();
  const { setCurrentView, notifications } = useAppStore();
  const {
    widgets, isCustomizing, setCustomizing, toggleWidget,
    dragIndex, dragOverIndex, setDragIndex, setDragOverIndex, reorder, resetLayout,
  } = useDashboardLayout();

  // ── Stats calculées depuis les stores ─────────────────────────────────
  const totalDocs = documents.length;
  const pendingDocs = documents.filter((d) => d.currentStatus.id === 'pending').length;
  const approvedDocs = documents.filter((d) =>
    ['approved', 'vso'].includes(d.currentStatus.id)
  ).length;
  const rejectedDocs = documents.filter((d) =>
    ['rejected', 'refused'].includes(d.currentStatus.id)
  ).length;
  const inReviewDocs = documents.filter((d) =>
    ['commented', 'vao', 'vao_blocking'].includes(d.currentStatus.id)
  ).length;

  const approvalRate = totalDocs > 0 ? Math.round((approvedDocs / totalDocs) * 100) : 0;

  // ── Stats workflow engine ─────────────────────────────────────────────
  const workflowStats = useMemo(() => {
    const activeInstances = instances.filter((i) => !i.completedAt);
    const completedInstances = instances.filter((i) => !!i.completedAt);
    const totalReviews = instances.reduce((acc, i) => acc + i.reviews.length, 0);
    const totalHistoryEntries = instances.reduce((acc, i) => acc + i.history.length, 0);

    // Pending reviews (documents on a review node)
    const docsOnReviewNode = activeInstances.filter((i) => {
      const def = definitions.find((d) => d.id === i.workflowDefinitionId);
      const currentNode = def?.nodes.find((n) => n.id === i.currentNodeId);
      return currentNode?.type === 'review';
    });

    return {
      activeInstances: activeInstances.length,
      completedInstances: completedInstances.length,
      totalReviews,
      totalHistoryEntries,
      docsAwaitingReview: docsOnReviewNode.length,
    };
  }, [instances, definitions]);

  // Recent documents (last 5)
  const recentDocs = [...documents]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 5);

  // Status distribution (with document names for tooltips)
  const statusDistribution = DOCUMENT_VALIDATION_STATUSES.map((status) => {
    const matchingDocs = documents.filter((d) => d.currentStatus.id === status.id);
    return {
      ...status,
      count: matchingDocs.length,
      documentNames: matchingDocs.map((d) => d.fileName),
    };
  }).filter((s) => s.count > 0);

  // Recent workflow activity (last 5 history entries across all instances)
  const recentActivity = useMemo(() => {
    const allEntries = instances.flatMap((inst) =>
      inst.history.map((h) => ({
        ...h,
        documentName: inst.documentName,
        instanceId: inst.id,
      }))
    );
    return allEntries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);
  }, [instances]);

  // Weekly activity (last 7 days bar chart data with event details for tooltips)
  const weeklyActivity = useMemo(() => {
    const days: {
      label: string;
      date: string;
      dateFormatted: string;
      count: number;
      events: { action: string; documentName: string; userName: string }[];
    }[] = [];
    const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const monthNames = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayEvents: { action: string; documentName: string; userName: string }[] = [];
      for (const inst of instances) {
        for (const h of inst.history) {
          if (h.timestamp.startsWith(dateStr)) {
            dayEvents.push({
              action: h.action,
              documentName: inst.documentName,
              userName: h.userName,
            });
          }
        }
      }
      days.push({
        label: dayNames[d.getDay()],
        date: dateStr,
        dateFormatted: `${d.getDate()} ${monthNames[d.getMonth()]}`,
        count: dayEvents.length,
        events: dayEvents,
      });
    }
    return days;
  }, [instances]);

  const maxWeeklyCount = Math.max(1, ...weeklyActivity.map((d) => d.count));

  // Unread notifications
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const isWidgetVisible = useCallback((id: string) => {
    const w = widgets.find((w) => w.id === id);
    return w ? w.visible : true;
  }, [widgets]);

  const widgetOrder = useMemo(() => widgets.filter((w) => w.visible).map((w) => w.id), [widgets]);

  // ── Export PDF ─────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  const handleExportPDF = useCallback(async () => {
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 15;
      let y = 15;

      // Header
      doc.setFillColor(0, 67, 136); // Trimble blue
      doc.rect(0, 0, pageWidth, 32, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Tableau de bord — Validation documentaire', margin, 15);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, 23);
      y = 40;

      // Stats summary
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Résumé', margin, y);
      y += 8;

      const statsData = [
        ['Total documents', String(totalDocs)],
        ['En attente', String(pendingDocs)],
        ['Approuvés', String(approvedDocs)],
        ['Rejetés', String(rejectedDocs)],
        ['En revue', String(inReviewDocs)],
        ['Taux d\'approbation', `${approvalRate}%`],
        ['Workflows actifs', String(workflowStats.activeInstances)],
        ['Workflows terminés', String(workflowStats.completedInstances)],
        ['Visas soumis', String(workflowStats.totalReviews)],
      ];

      autoTable(doc, {
        startY: y,
        head: [['Indicateur', 'Valeur']],
        body: statsData,
        margin: { left: margin, right: margin },
        theme: 'grid',
        headStyles: { fillColor: [0, 67, 136], fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });

      y = (doc as any).lastAutoTable.finalY + 12;

      // Status distribution
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Répartition par statut', margin, y);
      y += 8;

      if (statusDistribution.length > 0) {
        const statusBody = statusDistribution.map((s) => [
          s.name,
          String(s.count),
          `${totalDocs > 0 ? Math.round((s.count / totalDocs) * 100) : 0}%`,
          s.documentNames.join(', '),
        ]);

        autoTable(doc, {
          startY: y,
          head: [['Statut', 'Nombre', '%', 'Documents']],
          body: statusBody,
          margin: { left: margin, right: margin },
          theme: 'grid',
          headStyles: { fillColor: [0, 67, 136], fontSize: 9, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 15, halign: 'center' },
            2: { cellWidth: 15, halign: 'center' },
            3: { cellWidth: 'auto' },
          },
          alternateRowStyles: { fillColor: [245, 247, 250] },
        });

        y = (doc as any).lastAutoTable.finalY + 12;
      }

      // Recent documents
      if (y > 250) { doc.addPage(); y = 15; }
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Documents récents', margin, y);
      y += 8;

      if (recentDocs.length > 0) {
        const docsBody = recentDocs.map((d) => [
          d.fileName,
          d.currentStatus.name,
          d.uploadedByName,
          formatDate(d.uploadedAt),
        ]);

        autoTable(doc, {
          startY: y,
          head: [['Document', 'Statut', 'Déposé par', 'Date']],
          body: docsBody,
          margin: { left: margin, right: margin },
          theme: 'grid',
          headStyles: { fillColor: [0, 67, 136], fontSize: 9, fontStyle: 'bold' },
          bodyStyles: { fontSize: 8 },
          alternateRowStyles: { fillColor: [245, 247, 250] },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${i}/${pageCount}`,
          pageWidth - margin,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'right' }
        );
      }

      doc.save(`dashboard-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  }, [totalDocs, pendingDocs, approvedDocs, rejectedDocs, inReviewDocs, approvalRate, workflowStats, statusDistribution, recentDocs]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Tableau de bord</h2>
          <p className="text-sm text-muted-foreground">
            Vue d'ensemble de la validation documentaire
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isCustomizing ? 'default' : 'outline'}
            size="sm"
            className="gap-1.5"
            onClick={() => setCustomizing(!isCustomizing)}
          >
            <Settings2 className="h-4 w-4" />
            {isCustomizing ? 'Terminer' : 'Personnaliser'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportPDF}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export PDF
          </Button>
          {unreadNotifs > 0 && (
            <Badge variant="destructive" className="gap-1">
              {unreadNotifs} notification(s) non lue(s)
            </Badge>
          )}
        </div>
      </div>

      {/* Customization panel */}
      {isCustomizing && (
        <Card className="border-dashed border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Widgets visibles — Glissez pour réorganiser</p>
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={resetLayout}>
                <RotateCcw className="h-3 w-3" />
                Réinitialiser
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {widgets.map((w, idx) => (
                <div
                  key={w.id}
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx); }}
                  onDrop={() => { if (dragIndex !== null) reorder(dragIndex, idx); }}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-grab active:cursor-grabbing transition-all ${
                    dragOverIndex === idx ? 'ring-2 ring-primary scale-105' : ''
                  } ${!w.visible ? 'opacity-50' : 'bg-card'}`}
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground" />
                  <span>{w.label}</span>
                  <Switch
                    checked={w.visible}
                    onCheckedChange={() => toggleWidget(w.id)}
                    className="scale-75"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards - documents */}
      {isWidgetVisible('kpi') && <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setCurrentView('documents')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDocs}</div>
            <p className="text-xs text-muted-foreground">
              {definitions.filter((d) => d.isActive).length} workflow(s) actif(s)
            </p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => setCurrentView('visa')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-status-pending" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-pending">{pendingDocs}</div>
            <p className="text-xs text-muted-foreground">
              {workflowStats.docsAwaitingReview} en attente de visa
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approuvés</CardTitle>
            <CheckCircle className="h-4 w-4 text-status-approved" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-approved">{approvedDocs}</div>
            <div className="mt-1 flex items-center gap-2">
              <Progress value={approvalRate} className="h-1.5" />
              <span className="text-xs text-muted-foreground">{approvalRate}%</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejetés</CardTitle>
            <XCircle className="h-4 w-4 text-status-rejected" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-status-rejected">{rejectedDocs}</div>
            <p className="text-xs text-muted-foreground">
              {documents.filter((d) => d.currentStatus.id === 'vao_blocking').length} avec obs. bloquantes
            </p>
          </CardContent>
        </Card>
      </div>}

      {/* Workflow engine stats */}
      {isWidgetVisible('status-chart') && <><div className="grid gap-3 md:grid-cols-4">
        <MiniStat
          label="Workflows actifs"
          value={workflowStats.activeInstances}
          icon={<GitBranch className="h-3.5 w-3.5" />}
          color="text-blue-500"
        />
        <MiniStat
          label="Terminés"
          value={workflowStats.completedInstances}
          icon={<CheckCircle className="h-3.5 w-3.5" />}
          color="text-green-500"
        />
        <MiniStat
          label="Visas soumis"
          value={workflowStats.totalReviews}
          icon={<Users className="h-3.5 w-3.5" />}
          color="text-purple-500"
        />
        <MiniStat
          label="Événements"
          value={workflowStats.totalHistoryEntries}
          icon={<Zap className="h-3.5 w-3.5" />}
          color="text-amber-500"
          onClick={() => setCurrentView('history')}
        />
      </div>

      {/* Weekly activity bar chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Activité sur 7 jours
          </CardTitle>
          <CardDescription>Nombre d'événements workflow par jour</CardDescription>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={200}>
            <div className="flex items-end gap-1.5 h-24">
              {weeklyActivity.map((day) => (
                <Tooltip key={day.date}>
                  <TooltipTrigger asChild>
                    <div className="flex-1 flex flex-col items-center gap-1 cursor-default">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {day.count > 0 ? day.count : ''}
                      </span>
                      <div
                        className="w-full rounded-t-md bg-primary/80 transition-all hover:bg-primary min-h-[2px]"
                        style={{
                          height: `${Math.max(2, (day.count / maxWeeklyCount) * 70)}px`,
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">{day.label}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs p-0">
                    <div className="px-3 py-2">
                      <p className="text-xs font-semibold text-white mb-1">
                        {day.dateFormatted} — {day.count} événement{day.count !== 1 ? 's' : ''}
                      </p>
                      {day.events.length === 0 ? (
                        <p className="text-[11px] text-white/60">Aucune activité</p>
                      ) : (
                        <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                          {day.events.slice(0, 8).map((evt, i) => (
                            <li key={i} className="text-[11px] flex items-start gap-1.5 text-white">
                              <Zap className="h-3 w-3 shrink-0 text-amber-300 mt-0.5" />
                              <span>
                                <span className="font-medium">{evt.action}</span>
                                <span className="text-white/70"> — {evt.documentName}</span>
                              </span>
                            </li>
                          ))}
                          {day.events.length > 8 && (
                            <li className="text-[10px] text-white/60 pl-4">
                              + {day.events.length - 8} autre(s)...
                            </li>
                          )}
                        </ul>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status distribution — Donut Chart + Bars */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition par statut</CardTitle>
            <CardDescription>Distribution des documents par statut actuel</CardDescription>
          </CardHeader>
          <CardContent>
            {statusDistribution.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucun document
              </p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="flex items-start gap-6">
                  {/* Donut chart */}
                  <div className="relative shrink-0">
                    <DonutChart
                      segments={statusDistribution.map((s) => ({
                        value: s.count,
                        color: s.color,
                        label: s.name,
                        documentNames: s.documentNames,
                      }))}
                      size={120}
                      strokeWidth={20}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-2xl font-bold">{totalDocs}</span>
                      <span className="text-[10px] text-muted-foreground">documents</span>
                    </div>
                  </div>
                  {/* Legend + bars with tooltips */}
                  <div className="flex-1 space-y-2.5">
                    {statusDistribution.map((status) => (
                      <Tooltip key={status.id}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2 cursor-default rounded-md px-1 py-0.5 -mx-1 transition-colors hover:bg-muted/60">
                            <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: status.color }} />
                            <span className="text-xs flex-1 truncate">{status.name}</span>
                            <div className="w-20">
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    backgroundColor: status.color,
                                    width: `${totalDocs > 0 ? (status.count / totalDocs) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <span className="min-w-[28px] text-right text-xs font-semibold">
                              {status.count}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-[220px] p-0">
                          <div className="px-3 py-2">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: status.color }} />
                              <span className="text-xs font-semibold text-white">{status.name}</span>
                              <span className="text-[10px] text-white/60">
                                ({status.count} document{status.count !== 1 ? 's' : ''})
                              </span>
                            </div>
                            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                              {status.documentNames.slice(0, 10).map((name, i) => (
                                <li key={i} className="text-[11px] flex items-center gap-1.5 text-white">
                                  <FileText className="h-3 w-3 shrink-0 text-white/50" />
                                  <span className="truncate">{name}</span>
                                </li>
                              ))}
                              {status.documentNames.length > 10 && (
                                <li className="text-[10px] text-white/60 pl-4">
                                  + {status.documentNames.length - 10} autre(s)...
                                </li>
                              )}
                            </ul>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>

        {/* Recent documents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Documents récents</CardTitle>
                <CardDescription>Derniers documents déposés</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentView('documents')}
              >
                Voir tout
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentDocs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucun document récent
              </p>
            ) : (
              <div className="space-y-3">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{doc.fileName}</div>
                        <div className="text-xs text-muted-foreground">
                          par {doc.uploadedByName}
                        </div>
                      </div>
                    </div>
                    <StatusBadge
                      name={doc.currentStatus.name}
                      color={doc.currentStatus.color}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div></>}

      {/* Upcoming deadlines */}
      {isWidgetVisible('deadlines') && (() => {
        const upcomingDeadlines = instances
          .filter((inst) => inst.deadline && !inst.completedAt)
          .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
          .slice(0, 5);

        if (upcomingDeadlines.length === 0) return null;

        return (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Prochaines échéances
                  </CardTitle>
                  <CardDescription>Workflows avec des délais à respecter</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setCurrentView('visa')}>
                  Voir tout
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {upcomingDeadlines.map((inst) => (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{inst.documentName}</div>
                        <div className="text-xs text-muted-foreground">
                          Échéance : {new Date(inst.deadline!).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                    <DeadlineIndicator deadline={inst.deadline!} completedAt={inst.completedAt} compact />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Calendar + Detailed Stats */}
      {isWidgetVisible('calendar-stats') && <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DeadlineCalendar />
        <div>
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Statistiques détaillées par workflow
          </h3>
          <WorkflowStats />
        </div>
      </div></>}

      {/* Recent workflow activity */}
      {isWidgetVisible('activity') && <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Activité récente du workflow
              </CardTitle>
              <CardDescription>Dernières transitions et actions du moteur</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('history')}
            >
              Voir tout
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucune activité récente
            </p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between rounded-lg border p-2.5 text-sm transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Zap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <span className="font-medium">{entry.action}</span>
                      <div className="text-xs text-muted-foreground truncate">
                        {entry.documentName} — {entry.userName}
                      </div>
                    </div>
                  </div>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    {formatDate(entry.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </>}
    </div>
  );
}

// ─── MINI STAT COMPONENT ────────────────────────────────────────────────────

function MiniStat({
  label,
  value,
  icon,
  color = 'text-muted-foreground',
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`p-3 ${onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={color}>{icon}</span>
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </Card>
  );
}

// ─── DONUT CHART (SVG) WITH HOVER TOOLTIPS ──────────────────────────────────

interface DonutSegment {
  value: number;
  color: string;
  label: string;
  documentNames?: string[];
}

function DonutChart({
  segments,
  size = 120,
  strokeWidth = 20,
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
}) {
  const total = segments.reduce((acc, s) => acc + s.value, 0);
  const [hovered, setHovered] = useState<{
    index: number;
    clientX: number;
    clientY: number;
  } | null>(null);

  const handleMouseEnter = useCallback(
    (index: number, e: React.MouseEvent<SVGCircleElement>) => {
      setHovered({ index, clientX: e.clientX, clientY: e.clientY });
    },
    []
  );

  const handleMouseMove = useCallback(
    (index: number, e: React.MouseEvent<SVGCircleElement>) => {
      setHovered({ index, clientX: e.clientX, clientY: e.clientY });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setHovered(null);
  }, []);

  if (total === 0) return null;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let currentOffset = 0;
  const hoveredSegment = hovered !== null ? segments[hovered.index] : null;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((segment, i) => {
          const pct = segment.value / total;
          const dashLength = pct * circumference;
          const dashOffset = -currentOffset;
          currentOffset += dashLength;
          const isHovered = hovered?.index === i;

          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${center} ${center})`}
              className="cursor-pointer transition-all duration-150"
              style={{ opacity: hovered !== null && !isHovered ? 0.5 : 1 }}
              onMouseEnter={(e) => handleMouseEnter(i, e)}
              onMouseMove={(e) => handleMouseMove(i, e)}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}
      </svg>

      {/* Fixed positioned tooltip - floats above everything */}
      {hoveredSegment && hovered && (
        <div
          className="fixed z-[9999] pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100"
          style={{
            left: hovered.clientX + 16,
            top: hovered.clientY - 10,
          }}
        >
          <div className="rounded-md bg-primary px-3 py-2 shadow-lg min-w-[140px] max-w-[220px]">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="h-2.5 w-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: hoveredSegment.color }}
              />
              <span className="text-xs font-semibold text-white">
                {hoveredSegment.label}
              </span>
            </div>
            <p className="text-[10px] text-white/60 mb-1">
              {hoveredSegment.value} document{hoveredSegment.value !== 1 ? 's' : ''} ({Math.round((hoveredSegment.value / total) * 100)}%)
            </p>
            {hoveredSegment.documentNames && hoveredSegment.documentNames.length > 0 && (
              <ul className="space-y-0.5 border-t border-white/20 pt-1 mt-1">
                {hoveredSegment.documentNames.slice(0, 6).map((name, i) => (
                  <li key={i} className="text-[11px] flex items-center gap-1.5 text-white">
                    <FileText className="h-2.5 w-2.5 shrink-0 text-white/50" />
                    <span className="truncate">{name}</span>
                  </li>
                ))}
                {hoveredSegment.documentNames.length > 6 && (
                  <li className="text-[10px] text-white/60 pl-4">
                    + {hoveredSegment.documentNames.length - 6} autre(s)...
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
