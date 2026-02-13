// ============================================================================
// AUDIT TRAIL — Historique complet et exportable d'un document
// Traçabilité, conformité, export PDF/CSV
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  FileText, Download, Clock, User, GitCommit, MessageSquare,
  UserCheck, Shield, Tag, ArrowRight, Loader2, History,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkflowStore } from '@/stores/workflowStore';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/utils';
import type { ValidationDocument } from '@/models/document';

interface AuditEntry {
  id: string;
  timestamp: string;
  type: 'workflow' | 'review' | 'comment' | 'version' | 'label' | 'status';
  icon: React.ReactNode;
  title: string;
  description: string;
  user: string;
  color: string;
}

interface AuditTrailProps {
  document: ValidationDocument;
  trigger?: React.ReactNode;
}

export function AuditTrail({ document: doc, trigger }: AuditTrailProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [expandAll, setExpandAll] = useState(true);
  const { instances } = useWorkflowStore();

  const auditEntries = useMemo<AuditEntry[]>(() => {
    const entries: AuditEntry[] = [];

    // Document creation
    entries.push({
      id: 'created',
      timestamp: doc.uploadedAt,
      type: 'version',
      icon: <FileText className="h-3.5 w-3.5" />,
      title: 'Document déposé',
      description: `${doc.fileName} (${formatFileSize(doc.fileSize)}) déposé dans ${doc.filePath}`,
      user: doc.uploadedByName,
      color: 'text-blue-500',
    });

    // Version history
    if (doc.versionHistory) {
      for (const ver of doc.versionHistory) {
        if (ver.versionNumber > 1) {
          entries.push({
            id: `ver-${ver.versionNumber}`,
            timestamp: ver.uploadedAt,
            type: 'version',
            icon: <GitCommit className="h-3.5 w-3.5" />,
            title: `Nouvelle version v${ver.versionNumber}`,
            description: `${ver.fileName} (${formatFileSize(ver.fileSize)})${ver.comment ? ` — "${ver.comment}"` : ''}`,
            user: ver.uploadedByName,
            color: 'text-purple-500',
          });
        }
      }
    }

    // Workflow instances history
    const docInstances = instances.filter((i) => i.documentId === doc.id);
    for (const inst of docInstances) {
      for (const h of inst.history) {
        entries.push({
          id: `wf-${h.id}`,
          timestamp: h.timestamp,
          type: 'workflow',
          icon: <ArrowRight className="h-3.5 w-3.5" />,
          title: h.action,
          description: h.comment || '',
          user: h.userName,
          color: 'text-amber-500',
        });
      }

      // Reviews
      for (const r of inst.reviews) {
        if (r.isCompleted && r.reviewedAt) {
          const decisionLabels: Record<string, string> = {
            approved: 'Approuvé', rejected: 'Rejeté', vao: 'VAO',
            vao_blocking: 'VAO Bloquantes', vso: 'VSO', refused: 'Refusé',
            approved_with_comments: 'Commenté', pending: 'En attente',
          };
          entries.push({
            id: `rev-${r.id}`,
            timestamp: r.reviewedAt,
            type: 'review',
            icon: <UserCheck className="h-3.5 w-3.5" />,
            title: `Visa : ${decisionLabels[r.decision] || r.decision}`,
            description: [r.comment, ...(r.observations || [])].filter(Boolean).join(' | '),
            user: r.reviewerName,
            color: ['approved', 'vso'].includes(r.decision) ? 'text-green-500' :
              ['rejected', 'refused'].includes(r.decision) ? 'text-red-500' : 'text-amber-500',
          });
        }
      }
    }

    // Comments
    for (const c of doc.comments || []) {
      entries.push({
        id: `cmt-${c.id}`,
        timestamp: c.createdAt,
        type: 'comment',
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        title: 'Commentaire',
        description: c.content.length > 120 ? c.content.slice(0, 120) + '…' : c.content,
        user: c.authorName,
        color: 'text-sky-500',
      });
    }

    // Sort by timestamp
    return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [doc, instances]);

  // ── Export CSV ──────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Action', 'Détails', 'Utilisateur'];
    const rows = auditEntries.map((e) => [
      formatDateTime(e.timestamp),
      e.type,
      e.title,
      e.description.replace(/"/g, '""'),
      e.user,
    ]);
    const csv = [headers.join(';'), ...rows.map((r) => r.map((c) => `"${c}"`).join(';'))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${doc.fileName.replace(/\.[^.]+$/, '')}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Export PDF ─────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      let y = margin;

      // Header
      pdf.setFillColor(0, 95, 163);
      pdf.rect(0, 0, 210, 28, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Audit Trail — Historique complet', margin, 12);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Document : ${doc.fileName}`, margin, 19);
      pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, margin, 24);
      y = 36;

      // Document summary
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Informations du document', margin, y);
      y += 6;

      autoTable(pdf, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Propriété', 'Valeur']],
        body: [
          ['Nom du fichier', doc.fileName],
          ['Statut actuel', doc.currentStatus.name],
          ['Version', `v${doc.versionNumber}`],
          ['Taille', formatFileSize(doc.fileSize)],
          ['Déposé par', doc.uploadedByName],
          ['Date de dépôt', formatDateTime(doc.uploadedAt)],
          ['Chemin', doc.filePath],
          ['Labels', (doc.labels || []).map((l) => l.name).join(', ') || '—'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [0, 95, 163], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
      });

      y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

      // Timeline
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Historique (${auditEntries.length} événements)`, margin, y);
      y += 6;

      autoTable(pdf, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Date', 'Type', 'Action', 'Détails', 'Utilisateur']],
        body: auditEntries.map((e) => [
          formatDateTime(e.timestamp),
          e.type === 'workflow' ? 'Workflow' : e.type === 'review' ? 'Visa' :
            e.type === 'comment' ? 'Commentaire' : e.type === 'version' ? 'Version' : e.type,
          e.title,
          e.description.length > 80 ? e.description.slice(0, 80) + '…' : e.description,
          e.user,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [0, 95, 163], fontSize: 7 },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 20 },
          2: { cellWidth: 35 },
          4: { cellWidth: 25 },
        },
      });

      // Footer
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(128, 128, 128);
        pdf.text(
          `Page ${i}/${pageCount} — Audit Trail ${doc.fileName} — Confidentiel`,
          margin,
          290
        );
      }

      pdf.save(`audit-${doc.fileName.replace(/\.[^.]+$/, '')}-${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      setIsExporting(false);
    }
  };

  const typeLabels: Record<string, string> = {
    workflow: 'Workflow', review: 'Visa', comment: 'Commentaire',
    version: 'Version', label: 'Label', status: 'Statut',
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Shield className="h-3.5 w-3.5" />
            Audit trail
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit Trail — {doc.fileName}
          </DialogTitle>
          <DialogDescription>
            Historique complet de toutes les actions sur ce document ({auditEntries.length} événements)
          </DialogDescription>
        </DialogHeader>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportCSV}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportPDF} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export PDF
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={() => setExpandAll(!expandAll)}
          >
            {expandAll ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expandAll ? 'Réduire' : 'Développer'}
          </Button>
        </div>

        <Separator />

        {/* Timeline */}
        <ScrollArea className="flex-1 max-h-[500px]">
          <div className="space-y-0 pr-4">
            {auditEntries.map((entry, idx) => (
              <div key={entry.id} className="relative flex gap-3 group">
                {/* Timeline connector */}
                <div className="flex flex-col items-center">
                  <div className={`h-7 w-7 rounded-full border-2 flex items-center justify-center shrink-0 z-10 bg-card ${entry.color} border-current`}>
                    {entry.icon}
                  </div>
                  {idx < auditEntries.length - 1 && (
                    <div className="w-0.5 flex-1 bg-border min-h-[8px]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pb-4 min-w-0">
                  <div className="rounded-lg border p-2.5 bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{entry.title}</p>
                        {expandAll && entry.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 break-words">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {typeLabels[entry.type] || entry.type}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {entry.user}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(entry.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
