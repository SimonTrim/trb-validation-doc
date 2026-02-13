// ============================================================================
// DOCUMENT PRINT VIEW — Fiche document imprimable (PDF ou impression)
// ============================================================================

import React, { useState, useRef, useCallback } from 'react';
import {
  Printer, Download, FileText, User, Calendar, FolderOpen,
  Tag, MessageSquare, UserCheck, Loader2, X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useWorkflowStore } from '@/stores/workflowStore';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/utils';
import type { ValidationDocument } from '@/models/document';

interface DocumentPrintViewProps {
  document: ValidationDocument;
  trigger?: React.ReactNode;
}

export function DocumentPrintView({ document: doc, trigger }: DocumentPrintViewProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { instances } = useWorkflowStore();

  const docInstances = instances.filter((i) => i.documentId === doc.id);

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Fiche Document — ${doc.fileName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.5; padding: 20mm 15mm; }
          .header { background: #005fa3; color: white; padding: 16px 20px; margin: -20mm -15mm 20px -15mm; }
          .header h1 { font-size: 18px; font-weight: 600; }
          .header p { font-size: 10px; opacity: 0.85; margin-top: 4px; }
          .section { margin-bottom: 16px; }
          .section-title { font-size: 12px; font-weight: 600; color: #005fa3; border-bottom: 2px solid #005fa3; padding-bottom: 4px; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 5px 8px; border: 1px solid #ddd; text-align: left; font-size: 10px; }
          th { background: #f5f5f5; font-weight: 600; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
          .meta-item { display: flex; gap: 6px; }
          .meta-label { font-weight: 600; color: #555; min-width: 110px; }
          .status-badge { padding: 2px 10px; border-radius: 12px; font-weight: 600; font-size: 10px; display: inline-block; }
          .footer { margin-top: 20px; border-top: 1px solid #ddd; padding-top: 8px; text-align: center; font-size: 8px; color: #999; }
          .comment { border-left: 3px solid #ddd; padding: 4px 8px; margin-bottom: 6px; }
          .comment .author { font-weight: 600; font-size: 10px; }
          .comment .date { font-size: 9px; color: #999; }
          .label-tag { display: inline-block; padding: 1px 8px; border-radius: 6px; font-size: 9px; margin-right: 4px; border: 1px solid; }
          @media print {
            body { padding: 10mm; }
            .header { margin: -10mm -10mm 15px -10mm; }
          }
        </style>
      </head>
      <body>
        ${printRef.current.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }, [doc.fileName]);

  const handleExportPDF = useCallback(async () => {
    setIsExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const m = 15;
      let y = m;

      // Header
      pdf.setFillColor(0, 95, 163);
      pdf.rect(0, 0, 210, 30, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Fiche Document', m, 13);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(doc.fileName, m, 20);
      pdf.setFontSize(8);
      pdf.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, m, 26);
      y = 38;

      // Properties
      pdf.setTextColor(0, 0, 0);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Informations générales', m, y);
      y += 5;

      autoTable(pdf, {
        startY: y,
        margin: { left: m, right: m },
        head: [['Propriété', 'Valeur']],
        body: [
          ['Nom du fichier', doc.fileName],
          ['Extension', doc.fileExtension.toUpperCase()],
          ['Taille', formatFileSize(doc.fileSize)],
          ['Chemin', doc.filePath],
          ['Version', `v${doc.versionNumber}`],
          ['Statut actuel', doc.currentStatus.name],
          ['Déposé par', `${doc.uploadedByName} (${doc.uploadedByEmail})`],
          ['Date de dépôt', formatDateTime(doc.uploadedAt)],
          ['Dernière modification', formatDateTime(doc.lastModified)],
          ['Labels', (doc.labels || []).map((l) => l.name).join(', ') || '—'],
        ],
        theme: 'grid',
        headStyles: { fillColor: [0, 95, 163], fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
      });
      y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      // Metadata
      const metaEntries = Object.entries(doc.metadata || {});
      if (metaEntries.length > 0) {
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Métadonnées', m, y);
        y += 5;
        autoTable(pdf, {
          startY: y,
          margin: { left: m, right: m },
          head: [['Clé', 'Valeur']],
          body: metaEntries.map(([k, v]) => [k, v]),
          theme: 'grid',
          headStyles: { fillColor: [0, 95, 163], fontSize: 8 },
          bodyStyles: { fontSize: 8 },
        });
        y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      }

      // Reviews
      for (const inst of docInstances) {
        if (inst.reviews.length > 0) {
          pdf.setFontSize(11);
          pdf.setFont('helvetica', 'bold');
          pdf.text('Visas', m, y);
          y += 5;

          const decisionLabels: Record<string, string> = {
            approved: 'Approuvé', rejected: 'Rejeté', vao: 'VAO',
            vao_blocking: 'VAO Bloquantes', vso: 'VSO', refused: 'Refusé',
            approved_with_comments: 'Commenté', pending: 'En attente',
          };

          autoTable(pdf, {
            startY: y,
            margin: { left: m, right: m },
            head: [['Viseur', 'Décision', 'Commentaire', 'Date']],
            body: inst.reviews.map((r) => [
              r.reviewerName,
              decisionLabels[r.decision] || r.decision,
              r.comment || '—',
              r.reviewedAt ? formatDateTime(r.reviewedAt) : 'En attente',
            ]),
            theme: 'striped',
            headStyles: { fillColor: [0, 95, 163], fontSize: 8 },
            bodyStyles: { fontSize: 7 },
          });
          y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
        }
      }

      // Comments
      if (doc.comments && doc.comments.length > 0) {
        if (y > 250) { pdf.addPage(); y = m; }
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Commentaires', m, y);
        y += 5;

        autoTable(pdf, {
          startY: y,
          margin: { left: m, right: m },
          head: [['Auteur', 'Contenu', 'Date']],
          body: doc.comments.map((c) => [
            c.authorName,
            c.content.length > 100 ? c.content.slice(0, 100) + '…' : c.content,
            formatDateTime(c.createdAt),
          ]),
          theme: 'striped',
          headStyles: { fillColor: [0, 95, 163], fontSize: 8 },
          bodyStyles: { fontSize: 7 },
        });
      }

      // Footer on all pages
      const pageCount = pdf.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(128, 128, 128);
        pdf.text(`Page ${i}/${pageCount} — Fiche ${doc.fileName} — Confidentiel`, m, 290);
      }

      pdf.save(`fiche-${doc.fileName.replace(/\.[^.]+$/, '')}-${new Date().toISOString().split('T')[0]}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }, [doc, docInstances]);

  const decisionLabels: Record<string, string> = {
    approved: 'Approuvé', rejected: 'Rejeté', vao: 'VAO',
    vao_blocking: 'VAO Bloquantes', vso: 'VSO', refused: 'Refusé',
    approved_with_comments: 'Commenté', pending: 'En attente',
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Printer className="h-3.5 w-3.5" />
            Imprimer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Fiche Document — {doc.fileName}
          </DialogTitle>
          <DialogDescription>
            Aperçu avant impression de la fiche complète du document
          </DialogDescription>
        </DialogHeader>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-1.5 text-xs" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5" />
            Imprimer
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExportPDF} disabled={isExporting}>
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export PDF
          </Button>
        </div>

        <Separator />

        {/* Printable content preview */}
        <div className="flex-1 overflow-auto border rounded-lg bg-white text-black">
          <div ref={printRef} className="p-6 text-sm">
            {/* Header */}
            <div className="header" style={{ background: '#005fa3', color: 'white', padding: '12px 16px', marginBottom: 16, borderRadius: 6 }}>
              <h1 style={{ fontSize: 18, fontWeight: 600 }}>Fiche Document</h1>
              <p style={{ fontSize: 11, opacity: 0.85 }}>{doc.fileName} — Généré le {new Date().toLocaleDateString('fr-FR')}</p>
            </div>

            {/* General info */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: '#005fa3', borderBottom: '2px solid #005fa3', paddingBottom: 3, marginBottom: 8 }}>
                Informations générales
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <tbody>
                  {[
                    ['Nom du fichier', doc.fileName],
                    ['Statut', doc.currentStatus.name],
                    ['Version', `v${doc.versionNumber}`],
                    ['Taille', formatFileSize(doc.fileSize)],
                    ['Chemin', doc.filePath],
                    ['Déposé par', `${doc.uploadedByName} (${doc.uploadedByEmail})`],
                    ['Date de dépôt', formatDateTime(doc.uploadedAt)],
                    ['Dernière modification', formatDateTime(doc.lastModified)],
                  ].map(([label, value]) => (
                    <tr key={label}>
                      <td style={{ padding: '4px 8px', border: '1px solid #ddd', fontWeight: 600, width: 160, background: '#f8f8f8' }}>{label}</td>
                      <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Labels */}
            {doc.labels && doc.labels.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: '#005fa3', borderBottom: '2px solid #005fa3', paddingBottom: 3, marginBottom: 8 }}>
                  Labels
                </h2>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {doc.labels.map((l) => (
                    <span key={l.id} style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 6,
                      fontSize: 10, border: `1px solid ${l.color}`, color: l.color,
                      background: `${l.color}1a`,
                    }}>
                      {l.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            {Object.keys(doc.metadata || {}).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: '#005fa3', borderBottom: '2px solid #005fa3', paddingBottom: 3, marginBottom: 8 }}>
                  Métadonnées
                </h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    {Object.entries(doc.metadata).map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ padding: '3px 8px', border: '1px solid #ddd', fontWeight: 600, width: 160, background: '#f8f8f8' }}>{k}</td>
                        <td style={{ padding: '3px 8px', border: '1px solid #ddd' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Reviews */}
            {docInstances.some((i) => i.reviews.length > 0) && (
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: '#005fa3', borderBottom: '2px solid #005fa3', paddingBottom: 3, marginBottom: 8 }}>
                  Visas
                </h2>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <thead>
                    <tr style={{ background: '#005fa3', color: 'white' }}>
                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Viseur</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Décision</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Commentaire</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docInstances.flatMap((inst) =>
                      inst.reviews.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '3px 8px', border: '1px solid #ddd' }}>{r.reviewerName}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #ddd' }}>
                            {decisionLabels[r.decision] || r.decision}
                          </td>
                          <td style={{ padding: '3px 8px', border: '1px solid #ddd' }}>{r.comment || '—'}</td>
                          <td style={{ padding: '3px 8px', border: '1px solid #ddd' }}>
                            {r.reviewedAt ? formatDateTime(r.reviewedAt) : 'En attente'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Comments */}
            {doc.comments && doc.comments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, color: '#005fa3', borderBottom: '2px solid #005fa3', paddingBottom: 3, marginBottom: 8 }}>
                  Commentaires ({doc.comments.length})
                </h2>
                {doc.comments.map((c) => (
                  <div key={c.id} style={{ borderLeft: '3px solid #ddd', padding: '4px 8px', marginBottom: 6 }}>
                    <p style={{ fontWeight: 600, fontSize: 10 }}>{c.authorName}</p>
                    <p style={{ fontSize: 10 }}>{c.content}</p>
                    <p style={{ fontSize: 9, color: '#999' }}>{formatDateTime(c.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="footer" style={{ marginTop: 20, borderTop: '1px solid #ddd', paddingTop: 8, textAlign: 'center', fontSize: 9, color: '#999' }}>
              Document confidentiel — Fiche générée automatiquement — {new Date().toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
