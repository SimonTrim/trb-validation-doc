import React, { useState, useMemo } from 'react';
import {
  UserCheck, Clock, CheckCircle, XCircle, AlertCircle,
  MessageSquare, Send, FileText, Loader2, AlertTriangle,
  ChevronDown, ChevronUp, History, Download, FileDown,
  Box, Eye, Pen,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { StatusBadge } from '@/components/documents/StatusBadge';
import { DocumentLabels } from '@/components/documents/DocumentLabelBadge';
import { DeadlineIndicator } from '@/components/workflow/DeadlineIndicator';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowEngine } from '@/hooks/useWorkflowEngine';
import { collectVisaData, exportVisasCSV, exportVisasPDF } from '@/lib/exportVisas';
import { openInViewer, openForAnnotation, canOpenInViewer, getViewerType } from '@/lib/viewerIntegration';
import { formatDate } from '@/lib/utils';
import type { ReviewDecision } from '@/models/workflow';

const decisionOptions: { value: ReviewDecision; label: string; color: string; icon: React.ReactNode }[] = [
  { value: 'approved', label: 'Approuvé', color: '#1e8a44', icon: <CheckCircle className="h-4 w-4" /> },
  { value: 'vso', label: 'VSO - Sans observation', color: '#4caf50', icon: <CheckCircle className="h-4 w-4" /> },
  { value: 'vao', label: 'VAO - Avec observations', color: '#f0c040', icon: <AlertCircle className="h-4 w-4" /> },
  { value: 'approved_with_comments', label: 'Commenté', color: '#e49325', icon: <MessageSquare className="h-4 w-4" /> },
  { value: 'vao_blocking', label: 'VAO Bloquantes', color: '#d4760a', icon: <AlertCircle className="h-4 w-4" /> },
  { value: 'rejected', label: 'Rejeté', color: '#da212c', icon: <XCircle className="h-4 w-4" /> },
  { value: 'refused', label: 'Refusé', color: '#8b0000', icon: <XCircle className="h-4 w-4" /> },
];

export function VisaPanel() {
  const { documents } = useDocumentStore();
  const { instances, definitions } = useWorkflowStore();
  const { submitVisa, isProcessing, lastError, getDocumentWorkflowInfo } = useWorkflowEngine();
  const [selectedDecisions, setSelectedDecisions] = useState<Record<string, ReviewDecision>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [observationsMap, setObservationsMap] = useState<Record<string, string>>({});
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [submittedDocs, setSubmittedDocs] = useState<Set<string>>(new Set());

  const currentUser = useAuthStore((s) => s.currentUser);
  const currentUserEmail = (currentUser?.email || '').toLowerCase();
  const currentUserId = currentUser?.id || '';

  // Documents pending review BY THE CURRENT USER
  const pendingReviews = documents.filter(
    (doc) =>
      doc.reviewers.some(
        (r) =>
          !r.decision &&
          (r.userId === currentUserId ||
           (r.userEmail && r.userEmail.toLowerCase() === currentUserEmail))
      ) && !submittedDocs.has(doc.id)
  );

  // Debug: log matching info on mount / change
  React.useEffect(() => {
    if (currentUserEmail) {
      const docsWithReviewers = documents.filter((d) => d.reviewers.length > 0);
      console.log(`[VisaPanel] Current user: id=${currentUserId}, email=${currentUserEmail}`);
      console.log(`[VisaPanel] Documents with reviewers: ${docsWithReviewers.length}, pending for me: ${pendingReviews.length}`);
      docsWithReviewers.forEach((d) => {
        d.reviewers.forEach((r) => {
          console.log(`[VisaPanel]   doc=${d.fileName} reviewer=${r.userEmail} userId=${r.userId} decision=${r.decision || 'none'}`);
        });
      });
    }
  }, [documents, currentUserEmail, currentUserId, pendingReviews.length]);

  const handleSubmitVisa = async (docId: string) => {
    const decision = selectedDecisions[docId];
    if (!decision) return;

    const comment = comments[docId] || '';
    const obs = observationsMap[docId] || '';
    const observationsList = obs ? obs.split('\n').filter((o) => o.trim()) : undefined;

    try {
      await submitVisa(docId, decision, comment || undefined, observationsList);

      // Marquer comme soumis avec feedback visuel
      setSubmittedDocs((prev) => new Set(prev).add(docId));

      // Nettoyer le formulaire
      setSelectedDecisions((prev) => { const n = { ...prev }; delete n[docId]; return n; });
      setComments((prev) => { const n = { ...prev }; delete n[docId]; return n; });
      setObservationsMap((prev) => { const n = { ...prev }; delete n[docId]; return n; });
    } catch (error) {
      // L'erreur est gérée dans le hook (lastError)
    }
  };

  const getDecision = (docId: string) => selectedDecisions[docId] || '';
  const getComment = (docId: string) => comments[docId] || '';
  const getObservations = (docId: string) => observationsMap[docId] || '';

  // Workflow names pour l'export
  const workflowNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of definitions) map[d.id] = d.name;
    return map;
  }, [definitions]);

  // Export CSV des visas
  const handleExportCSV = (filter: 'all' | 'completed' | 'pending') => {
    const rows = collectVisaData(instances, documents, workflowNames, filter);
    const label = filter === 'all' ? 'tous' : filter === 'completed' ? 'termines' : 'en-attente';
    exportVisasCSV(rows, `visas-${label}-${new Date().toISOString().split('T')[0]}.csv`);
  };

  // Export PDF des visas
  const handleExportPDF = (filter: 'all' | 'completed' | 'pending') => {
    const rows = collectVisaData(instances, documents, workflowNames, filter);
    const filterLabel = filter === 'all' ? 'Tous' : filter === 'completed' ? 'Terminés' : 'En attente';
    exportVisasPDF(rows, {
      title: `Rapport des Visas — ${filterLabel}`,
      projectName: 'Projet BIM',
      filter: filterLabel,
    });
  };

  // Ouvrir un fichier dans la visionneuse TC
  const handleOpenViewer = async (doc: typeof documents[0]) => {
    await openInViewer(doc.fileId, doc.fileName, doc.projectId);
  };

  // Ouvrir pour annotation (statuts bloquants)
  const handleOpenForAnnotation = async (doc: typeof documents[0]) => {
    const decision = getDecision(doc.id);
    await openForAnnotation(doc.fileId, doc.fileName, doc.projectId, {
      documentStatus: doc.currentStatus.name,
      comment: getComment(doc.id),
    });
  };

  // Vérifier si le statut est bloquant (nécessite annotations)
  const isBlockingStatus = (statusId: string) => {
    return ['rejected', 'refused', 'vao_blocking', 'commented', 'vao', 'approved_with_comments'].includes(statusId);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Visas en attente</h2>
          <p className="text-sm text-muted-foreground">
            {pendingReviews.length} document(s) en attente de votre visa
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <Badge variant="outline" className="animate-pulse gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Traitement...
            </Badge>
          )}
          {/* Export buttons */}
          <Select onValueChange={(v) => {
            const [type, filter] = v.split(':') as [string, 'all' | 'completed' | 'pending'];
            if (type === 'csv') handleExportCSV(filter);
            else handleExportPDF(filter);
          }}>
            <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" />
              Exporter
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="csv:all">CSV — Tous les visas</SelectItem>
              <SelectItem value="csv:completed">CSV — Visas terminés</SelectItem>
              <SelectItem value="csv:pending">CSV — Visas en attente</SelectItem>
              <SelectItem value="pdf:all">PDF — Tous les visas</SelectItem>
              <SelectItem value="pdf:completed">PDF — Visas terminés</SelectItem>
              <SelectItem value="pdf:pending">PDF — Visas en attente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error banner */}
      {lastError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">{lastError}</span>
          </CardContent>
        </Card>
      )}

      {pendingReviews.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <UserCheck className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <CardTitle className="mb-2">Aucun visa en attente</CardTitle>
          <CardDescription>
            Tous les documents qui vous sont assignés ont été visés.
          </CardDescription>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingReviews.map((doc) => {
            const decision = getDecision(doc.id);
            const comment = getComment(doc.id);
            const obs = getObservations(doc.id);
            const workflowInfo = getDocumentWorkflowInfo(doc.id);
            const isExpanded = expandedDoc === doc.id;

            return (
              <Card key={doc.id} className="overflow-hidden transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{doc.fileName}</CardTitle>
                        <CardDescription>
                          Déposé par {doc.uploadedByName} le {formatDate(doc.uploadedAt)}
                        </CardDescription>
                      </div>
                    </div>
                    <StatusBadge
                      name={doc.currentStatus.name}
                      color={doc.currentStatus.color}
                    />
                  </div>

                  {/* Deadline indicator */}
                  {(() => {
                    const inst = instances.find((i) => i.documentId === doc.id);
                    return inst?.deadline ? (
                      <div className="mt-2">
                        <DeadlineIndicator deadline={inst.deadline} completedAt={inst.completedAt} />
                      </div>
                    ) : null;
                  })()}

                  {/* Workflow progress bar */}
                  {workflowInfo && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Noeud: {(workflowInfo.currentNode?.data.label as string) || 'N/A'}
                        </span>
                        <span>{workflowInfo.progress}%</span>
                      </div>
                      <Progress value={workflowInfo.progress} className="h-1.5" />
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Reviewers status */}
                  <div className="flex flex-wrap items-center gap-2">
                    {doc.reviewers.map((reviewer) => (
                      <Badge
                        key={reviewer.userId}
                        variant={reviewer.decision ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {reviewer.decision ? (
                          <CheckCircle className="mr-1 h-3 w-3" />
                        ) : (
                          <Clock className="mr-1 h-3 w-3" />
                        )}
                        {reviewer.userName}
                        {reviewer.decision && (
                          <span className="ml-1 opacity-70">
                            ({decisionOptions.find((d) => d.value === reviewer.decision)?.label || reviewer.decision})
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>

                  {/* Labels */}
                  {doc.labels && doc.labels.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <DocumentLabels labels={doc.labels} size="sm" max={5} />
                    </div>
                  )}

                  {/* Viewer / Annotation buttons for blocking statuses */}
                  {isBlockingStatus(doc.currentStatus.id) && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950/30">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      <span className="flex-1 text-xs text-amber-800 dark:text-amber-300">
                        Ce document nécessite des annotations. Ouvrez-le dans la visionneuse pour indiquer les problèmes.
                      </span>
                      <div className="flex items-center gap-1.5">
                        {canOpenInViewer(doc.fileExtension) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs border-amber-300 bg-white dark:bg-amber-950"
                            onClick={() => handleOpenViewer(doc)}
                          >
                            {getViewerType(doc.fileExtension) === '3d' ? (
                              <Box className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                            Voir
                          </Button>
                        )}
                        <Button
                          variant="default"
                          size="sm"
                          className="h-7 gap-1 text-xs bg-amber-600 hover:bg-amber-700"
                          onClick={() => handleOpenForAnnotation(doc)}
                        >
                          <Pen className="h-3.5 w-3.5" />
                          Annoter
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Workflow history toggle */}
                  {workflowInfo && workflowInfo.instance.history.length > 0 && (
                    <div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between text-xs"
                        onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                      >
                        <span className="flex items-center gap-1.5">
                          <History className="h-3 w-3" />
                          Historique ({workflowInfo.instance.history.length} étapes)
                        </span>
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                      {isExpanded && (
                        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                          {workflowInfo.instance.history.map((entry) => (
                            <div key={entry.id} className="flex items-start gap-2 text-xs">
                              <span className="shrink-0 text-muted-foreground">
                                {formatDate(entry.timestamp)}
                              </span>
                              <span>{entry.action}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <Separator />

                  {/* Visa form */}
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Votre décision
                      </label>
                      <Select
                        value={decision}
                        onValueChange={(v) =>
                          setSelectedDecisions((prev) => ({ ...prev, [doc.id]: v as ReviewDecision }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une décision..." />
                        </SelectTrigger>
                        <SelectContent>
                          {decisionOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              <div className="flex items-center gap-2">
                                <span style={{ color: option.color }}>{option.icon}</span>
                                {option.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Observations (for VAO) */}
                    {(decision === 'vao' ||
                      decision === 'vao_blocking' ||
                      decision === 'approved_with_comments') && (
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                          Observations (une par ligne)
                        </label>
                        <Textarea
                          value={obs}
                          onChange={(e) =>
                            setObservationsMap((prev) => ({ ...prev, [doc.id]: e.target.value }))
                          }
                          placeholder="Détaillez vos observations..."
                          rows={3}
                        />
                      </div>
                    )}

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                        Commentaire {decision === 'rejected' || decision === 'refused' ? '(obligatoire)' : '(optionnel)'}
                      </label>
                      <Textarea
                        value={comment}
                        onChange={(e) =>
                          setComments((prev) => ({ ...prev, [doc.id]: e.target.value }))
                        }
                        placeholder="Commentaire pour le déposant..."
                        rows={2}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      {canOpenInViewer(doc.fileExtension) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleOpenViewer(doc)}
                        >
                          {getViewerType(doc.fileExtension) === '3d' ? (
                            <Box className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          Ouvrir
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleSubmitVisa(doc.id)}
                        disabled={
                          isProcessing ||
                          !decision ||
                          ((['rejected', 'refused'].includes(decision)) && !comment.trim())
                        }
                      >
                        {isProcessing ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-1.5 h-4 w-4" />
                        )}
                        Valider le visa
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
