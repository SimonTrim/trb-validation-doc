// ============================================================================
// EXPORT VISAS — Export CSV et génération de rapport PDF
// ============================================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { WorkflowInstance, WorkflowReview } from '@/models/workflow';
import type { ValidationDocument } from '@/models/document';

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface VisaExportRow {
  documentName: string;
  documentPath: string;
  uploadedBy: string;
  reviewerName: string;
  reviewerEmail: string;
  decision: string;
  decisionLabel: string;
  comment: string;
  observations: string;
  reviewedAt: string;
  requestedAt: string;
  status: string;
  workflowName: string;
  isCompleted: boolean;
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

const DECISION_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  vso: 'VSO',
  vao: 'VAO',
  approved_with_comments: 'Commenté',
  vao_blocking: 'VAO Bloquantes',
  rejected: 'Rejeté',
  refused: 'Refusé',
};

const DECISION_COLORS: Record<string, [number, number, number]> = {
  approved: [30, 138, 68],
  vso: [76, 175, 80],
  vao: [240, 192, 64],
  approved_with_comments: [228, 147, 37],
  vao_blocking: [212, 118, 10],
  rejected: [218, 33, 44],
  refused: [139, 0, 0],
  pending: [106, 110, 121],
};

function formatDateFR(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Collecte toutes les données de visas pour l'export */
export function collectVisaData(
  instances: WorkflowInstance[],
  documents: ValidationDocument[],
  workflowNames: Record<string, string>,
  filter?: 'all' | 'completed' | 'pending'
): VisaExportRow[] {
  const rows: VisaExportRow[] = [];

  for (const instance of instances) {
    const doc = documents.find((d) => d.id === instance.documentId);
    if (!doc) continue;

    for (const review of instance.reviews) {
      if (filter === 'completed' && !review.isCompleted) continue;
      if (filter === 'pending' && review.isCompleted) continue;

      rows.push({
        documentName: doc.fileName,
        documentPath: doc.filePath,
        uploadedBy: doc.uploadedByName,
        reviewerName: review.reviewerName,
        reviewerEmail: review.reviewerEmail,
        decision: review.decision,
        decisionLabel: DECISION_LABELS[review.decision] || review.decision,
        comment: review.comment || '',
        observations: review.observations?.join(' | ') || '',
        reviewedAt: review.reviewedAt || '',
        requestedAt: review.requestedAt,
        status: doc.currentStatus.name,
        workflowName: workflowNames[instance.workflowDefinitionId] || 'Workflow',
        isCompleted: review.isCompleted,
      });
    }
  }

  return rows.sort((a, b) =>
    new Date(b.reviewedAt || b.requestedAt).getTime() -
    new Date(a.reviewedAt || a.requestedAt).getTime()
  );
}

// ─── CSV EXPORT ─────────────────────────────────────────────────────────────

export function exportVisasCSV(rows: VisaExportRow[], filename?: string): void {
  const headers = [
    'Document',
    'Chemin',
    'Déposé par',
    'Réviseur',
    'Email réviseur',
    'Décision',
    'Commentaire',
    'Observations',
    'Date demande',
    'Date visa',
    'Statut document',
    'Workflow',
    'Complété',
  ];

  const csvRows = rows.map((r) => [
    r.documentName,
    r.documentPath,
    r.uploadedBy,
    r.reviewerName,
    r.reviewerEmail,
    r.decisionLabel,
    r.comment,
    r.observations,
    formatDateFR(r.requestedAt),
    r.reviewedAt ? formatDateFR(r.reviewedAt) : '-',
    r.status,
    r.workflowName,
    r.isCompleted ? 'Oui' : 'Non',
  ]);

  const csv = [
    headers.join(';'),
    ...csvRows.map((row) =>
      row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')
    ),
  ].join('\n');

  downloadFile(
    '\uFEFF' + csv,
    filename || `visas-export-${new Date().toISOString().split('T')[0]}.csv`,
    'text/csv;charset=utf-8'
  );
}

// ─── PDF REPORT ─────────────────────────────────────────────────────────────

export function exportVisasPDF(
  rows: VisaExportRow[],
  options?: {
    title?: string;
    projectName?: string;
    generatedBy?: string;
    filter?: string;
  }
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;

  // ── En-tête ──────────────────────────────────────────────────────────

  // Barre de titre
  doc.setFillColor(0, 63, 135); // Bleu Trimble
  doc.rect(0, 0, pageWidth, 22, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(options?.title || 'Rapport des Visas — Validation Documentaire', margin, 14);

  // Sous-titre
  doc.setFontSize(9);
  doc.setTextColor(200, 220, 255);
  const subtitle = [
    options?.projectName ? `Projet: ${options.projectName}` : null,
    `Généré le ${formatDateFR(new Date().toISOString())}`,
    options?.generatedBy ? `par ${options.generatedBy}` : null,
    options?.filter ? `| Filtre: ${options.filter}` : null,
  ].filter(Boolean).join(' — ');
  doc.text(subtitle, margin, 19.5);

  // ── Statistiques ─────────────────────────────────────────────────────

  const y = 28;
  const totalReviews = rows.length;
  const completed = rows.filter((r) => r.isCompleted).length;
  const approved = rows.filter((r) => ['approved', 'vso'].includes(r.decision)).length;
  const rejected = rows.filter((r) => ['rejected', 'refused', 'vao_blocking'].includes(r.decision)).length;
  const commented = rows.filter((r) => ['approved_with_comments', 'vao'].includes(r.decision)).length;

  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Total: ${totalReviews} visa(s)`, margin, y);
  doc.text(`Complétés: ${completed}`, margin + 40, y);

  doc.setTextColor(...DECISION_COLORS.approved);
  doc.text(`Approuvés: ${approved}`, margin + 80, y);
  doc.setTextColor(...DECISION_COLORS.rejected);
  doc.text(`Rejetés: ${rejected}`, margin + 120, y);
  doc.setTextColor(...DECISION_COLORS.vao);
  doc.text(`Commentés: ${commented}`, margin + 155, y);

  // ── Tableau des visas ────────────────────────────────────────────────

  const tableData = rows.map((r) => [
    r.documentName,
    r.reviewerName,
    r.decisionLabel,
    r.comment.length > 60 ? r.comment.substring(0, 57) + '...' : r.comment || '-',
    r.observations.length > 40 ? r.observations.substring(0, 37) + '...' : r.observations || '-',
    r.reviewedAt ? formatDateFR(r.reviewedAt) : 'En attente',
    r.status,
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [['Document', 'Réviseur', 'Décision', 'Commentaire', 'Observations', 'Date visa', 'Statut']],
    body: tableData,
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [0, 63, 135],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250],
    },
    columnStyles: {
      0: { cellWidth: 55 },   // Document
      1: { cellWidth: 35 },   // Réviseur
      2: { cellWidth: 25 },   // Décision
      3: { cellWidth: 65 },   // Commentaire
      4: { cellWidth: 45 },   // Observations
      5: { cellWidth: 30 },   // Date
      6: { cellWidth: 25 },   // Statut
    },
    didParseCell: (data: any) => {
      // Colorer la cellule "Décision"
      if (data.section === 'body' && data.column.index === 2) {
        const decision = rows[data.row.index]?.decision;
        if (decision && DECISION_COLORS[decision]) {
          data.cell.styles.textColor = DECISION_COLORS[decision];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  // ── Pied de page ─────────────────────────────────────────────────────

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i}/${totalPages} — Validation Documentaire — Trimble Connect Extension`,
      pageWidth / 2,
      pageHeight - 5,
      { align: 'center' }
    );
    // Ligne de séparation
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, pageHeight - 10, pageWidth - margin, pageHeight - 10);
  }

  // ── Téléchargement ───────────────────────────────────────────────────

  doc.save(
    `rapport-visas-${new Date().toISOString().split('T')[0]}.pdf`
  );
}

// ─── DOWNLOAD HELPER ────────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
