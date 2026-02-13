// ============================================================================
// HISTORY VIEW — Timeline globale de tous les événements workflow
// Affiche l'historique de toutes les instances, filtrable et triable
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  History, Clock, CheckCircle, XCircle, AlertCircle, ArrowRight,
  Play, Square, FileText, User, Filter, Search, ChevronDown,
  MessageSquare, Move, Bell, GitBranch, Zap, RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/documents/StatusBadge';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAppStore } from '@/stores/appStore';
import { formatDate, formatDateTime } from '@/lib/utils';
import type { WorkflowHistoryEntry, WorkflowInstance } from '@/models/workflow';

/** Entry enrichie pour l'affichage */
interface TimelineEntry {
  id: string;
  timestamp: string;
  type: 'start' | 'transition' | 'review' | 'decision' | 'action' | 'completed' | 'notification';
  title: string;
  description: string;
  user: string;
  documentName: string;
  documentId: string;
  instanceId: string;
  workflowName: string;
  statusId?: string;
  statusName?: string;
  statusColor?: string;
  icon: React.ReactNode;
  iconColor: string;
}

type FilterType = 'all' | 'start' | 'transition' | 'review' | 'decision' | 'action' | 'completed';

export function HistoryView() {
  const { instances, definitions } = useWorkflowStore();
  const { documents } = useDocumentStore();
  const { setCurrentView } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [instanceFilter, setInstanceFilter] = useState<string>('all');

  // Construire la timeline globale à partir de toutes les instances
  const timeline = useMemo(() => {
    const entries: TimelineEntry[] = [];

    for (const instance of instances) {
      const definition = definitions.find((d) => d.id === instance.workflowDefinitionId);
      const workflowName = definition?.name || 'Workflow inconnu';

      for (const histEntry of instance.history) {
        const entryType = classifyHistoryEntry(histEntry);
        const { icon, iconColor } = getEntryIcon(entryType, histEntry);

        // Trouver le statut pour l'affichage
        const status = definition?.statuses.find((s) => s.id === histEntry.toStatusId);

        entries.push({
          id: histEntry.id,
          timestamp: histEntry.timestamp,
          type: entryType,
          title: histEntry.action,
          description: histEntry.comment || '',
          user: histEntry.userName,
          documentName: instance.documentName,
          documentId: instance.documentId,
          instanceId: instance.id,
          workflowName,
          statusId: histEntry.toStatusId,
          statusName: status?.name,
          statusColor: status?.color,
          icon,
          iconColor,
        });
      }

      // Ajouter les reviews comme entrées séparées
      for (const review of instance.reviews) {
        if (!review.isCompleted) continue;

        const decisionLabel = getDecisionLabel(review.decision);
        entries.push({
          id: review.id,
          timestamp: review.reviewedAt || review.requestedAt,
          type: 'review',
          title: `Visa: ${decisionLabel}`,
          description: review.comment || '',
          user: review.reviewerName,
          documentName: instance.documentName,
          documentId: instance.documentId,
          instanceId: instance.id,
          workflowName,
          icon: <MessageSquare className="h-4 w-4" />,
          iconColor: getDecisionColor(review.decision),
        });
      }
    }

    // Trier par date décroissante
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return entries;
  }, [instances, definitions]);

  // Appliquer les filtres
  const filteredTimeline = useMemo(() => {
    let result = timeline;

    if (typeFilter !== 'all') {
      result = result.filter((e) => e.type === typeFilter);
    }

    if (instanceFilter !== 'all') {
      result = result.filter((e) => e.instanceId === instanceFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.documentName.toLowerCase().includes(q) ||
          e.user.toLowerCase().includes(q)
      );
    }

    return result;
  }, [timeline, typeFilter, instanceFilter, searchQuery]);

  // Stats rapides
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    return {
      total: timeline.length,
      today: timeline.filter((e) => e.timestamp >= todayStr).length,
      reviews: timeline.filter((e) => e.type === 'review').length,
      completions: timeline.filter((e) => e.type === 'completed').length,
    };
  }, [timeline]);

  // Grouper par date
  const groupedTimeline = useMemo(() => {
    const groups: { date: string; label: string; entries: TimelineEntry[] }[] = [];
    let currentDate = '';

    for (const entry of filteredTimeline) {
      const dateStr = entry.timestamp.split('T')[0];
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        groups.push({
          date: dateStr,
          label: getDateLabel(dateStr),
          entries: [],
        });
      }
      groups[groups.length - 1].entries.push(entry);
    }

    return groups;
  }, [filteredTimeline]);

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <History className="h-5 w-5" />
          Historique des validations
        </h2>
        <p className="text-sm text-muted-foreground">
          Timeline de tous les événements de workflow
        </p>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-4 gap-3">
        <MiniStat label="Total événements" value={stats.total} icon={<Zap className="h-3.5 w-3.5" />} />
        <MiniStat label="Aujourd'hui" value={stats.today} icon={<Clock className="h-3.5 w-3.5" />} />
        <MiniStat label="Visas soumis" value={stats.reviews} icon={<MessageSquare className="h-3.5 w-3.5" />} />
        <MiniStat label="Terminés" value={stats.completions} icon={<CheckCircle className="h-3.5 w-3.5" />} />
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher dans l'historique..."
              className="pl-9 text-sm"
            />
          </div>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as FilterType)}>
            <SelectTrigger className="w-[180px] text-sm">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="start">Démarrages</SelectItem>
              <SelectItem value="transition">Transitions</SelectItem>
              <SelectItem value="review">Visas</SelectItem>
              <SelectItem value="decision">Décisions</SelectItem>
              <SelectItem value="action">Actions</SelectItem>
              <SelectItem value="completed">Terminés</SelectItem>
            </SelectContent>
          </Select>

          <Select value={instanceFilter} onValueChange={setInstanceFilter}>
            <SelectTrigger className="w-[220px] text-sm">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les documents</SelectItem>
              {instances.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.documentName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(typeFilter !== 'all' || instanceFilter !== 'all' || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTypeFilter('all'); setInstanceFilter('all'); setSearchQuery(''); }}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              Réinitialiser
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      {filteredTimeline.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <History className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <CardTitle className="mb-2">Aucun événement</CardTitle>
          <CardDescription>
            {timeline.length === 0
              ? "Les événements de workflow apparaîtront ici au fur et à mesure."
              : "Aucun résultat pour les filtres sélectionnés."}
          </CardDescription>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedTimeline.map((group) => (
            <div key={group.date}>
              {/* Date separator */}
              <div className="sticky top-0 z-10 mb-3 flex items-center gap-3 bg-background/95 py-1 backdrop-blur">
                <Badge variant="outline" className="text-xs font-medium">
                  {group.label}
                </Badge>
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {group.entries.length} événement(s)
                </span>
              </div>

              {/* Events */}
              <div className="relative ml-4 space-y-0 border-l-2 border-muted pl-6">
                {group.entries.map((entry, idx) => (
                  <TimelineItem
                    key={entry.id}
                    entry={entry}
                    isLast={idx === group.entries.length - 1}
                    onDocumentClick={() => setCurrentView('documents')}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TIMELINE ITEM ──────────────────────────────────────────────────────────

function TimelineItem({
  entry,
  isLast,
  onDocumentClick,
}: {
  entry: TimelineEntry;
  isLast: boolean;
  onDocumentClick: () => void;
}) {
  return (
    <div className={`relative pb-5 ${isLast ? 'pb-0' : ''}`}>
      {/* Dot on the timeline */}
      <div
        className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-background"
        style={{ color: entry.iconColor }}
      >
        <div
          className="flex h-4 w-4 items-center justify-center rounded-full"
          style={{ backgroundColor: entry.iconColor + '20', color: entry.iconColor }}
        >
          {React.cloneElement(entry.icon as React.ReactElement, { className: 'h-2.5 w-2.5' })}
        </div>
      </div>

      {/* Content */}
      <div className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-tight">{entry.title}</p>
            {entry.description && (
              <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                {entry.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {entry.statusName && entry.statusColor && (
              <StatusBadge name={entry.statusName} color={entry.statusColor} />
            )}
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {formatTime(entry.timestamp)}
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {entry.user}
          </span>
          <span>•</span>
          <button
            className="flex items-center gap-1 hover:text-foreground hover:underline"
            onClick={onDocumentClick}
          >
            <FileText className="h-3 w-3" />
            {entry.documentName}
          </button>
          <span>•</span>
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {entry.workflowName}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── MINI STAT ──────────────────────────────────────────────────────────────

function MiniStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </Card>
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function classifyHistoryEntry(entry: WorkflowHistoryEntry): TimelineEntry['type'] {
  const action = entry.action.toLowerCase();
  if (action.includes('démarré') || action.includes('started')) return 'start';
  if (action.includes('terminé') || action.includes('completed') || action.includes('fin')) return 'completed';
  if (action.includes('visa') || action.includes('review')) return 'review';
  if (action.includes('décision') || action.includes('decision')) return 'decision';
  if (action.includes('déplacer') || action.includes('notifier') || action.includes('action')) return 'action';
  return 'transition';
}

function getEntryIcon(type: TimelineEntry['type'], entry: WorkflowHistoryEntry) {
  switch (type) {
    case 'start':
      return { icon: <Play className="h-4 w-4" />, iconColor: '#0ea5e9' };
    case 'completed':
      return { icon: <Square className="h-4 w-4" />, iconColor: '#22c55e' };
    case 'review':
      return { icon: <MessageSquare className="h-4 w-4" />, iconColor: '#8b5cf6' };
    case 'decision':
      return { icon: <GitBranch className="h-4 w-4" />, iconColor: '#f59e0b' };
    case 'action':
      return { icon: <Zap className="h-4 w-4" />, iconColor: '#06b6d4' };
    default:
      return { icon: <ArrowRight className="h-4 w-4" />, iconColor: '#6b7280' };
  }
}

function getDecisionLabel(decision: string): string {
  const labels: Record<string, string> = {
    approved: 'Approuvé',
    vso: 'VSO',
    vao: 'VAO',
    approved_with_comments: 'Commenté',
    vao_blocking: 'VAO Bloquantes',
    rejected: 'Rejeté',
    refused: 'Refusé',
    pending: 'En attente',
  };
  return labels[decision] || decision;
}

function getDecisionColor(decision: string): string {
  const colors: Record<string, string> = {
    approved: '#1e8a44',
    vso: '#4caf50',
    vao: '#f0c040',
    approved_with_comments: '#e49325',
    vao_blocking: '#d4760a',
    rejected: '#da212c',
    refused: '#8b0000',
    pending: '#6a6e79',
  };
  return colors[decision] || '#6b7280';
}

function getDateLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date >= today) return "Aujourd'hui";
  if (date >= yesterday) return 'Hier';

  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
