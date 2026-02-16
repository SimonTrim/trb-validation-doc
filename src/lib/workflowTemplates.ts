// ============================================================================
// WORKFLOW TEMPLATES — Modèles de workflow prédéfinis
// Prêts à l'emploi pour démarrer rapidement un processus de validation
// ============================================================================

import { DOCUMENT_VALIDATION_STATUSES } from '@/models/workflow';
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge, WorkflowStatus } from '@/models/workflow';
import { generateId } from '@/lib/utils';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;         // Lucide icon name
  category: 'validation' | 'review' | 'approval' | 'custom';
  complexity: 'simple' | 'standard' | 'advanced';
  estimatedSteps: number;
  preview: string;      // Short description of the flow
  build: (projectId: string, createdBy: string) => WorkflowDefinition;
}

// ─── HELPER ─────────────────────────────────────────────────────────────────

function makeDefinition(
  partial: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'isActive'>
): WorkflowDefinition {
  const now = new Date().toISOString();
  return {
    ...partial,
    id: `wf-${generateId()}`,
    version: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── 1. VALIDATION STANDARD ────────────────────────────────────────────────

const validationStandard: WorkflowTemplate = {
  id: 'tpl-validation-standard',
  name: 'Validation documentaire standard',
  description: 'Workflow classique : dépôt → vérification → décision → action. Inclut les statuts Approuvé, Commenté, Rejeté avec boucle de retour.',
  icon: 'FileCheck',
  category: 'validation',
  complexity: 'standard',
  estimatedSteps: 11,
  preview: 'Dépôt → En attente → Vérification → Décision → Approuvé/Commenté/Rejeté → Actions',
  build: (projectId, createdBy) => {
    const nodes: WorkflowNode[] = [
      { id: 'n-start', type: 'start', position: { x: 50, y: 250 }, data: { label: 'Dépôt document' } },
      { id: 'n-pending', type: 'status', position: { x: 250, y: 250 }, data: { label: 'En attente', statusId: 'pending', color: '#6a6e79' } },
      { id: 'n-review', type: 'review', position: { x: 470, y: 250 }, data: { label: 'Vérification', requiredApprovals: 1, assignees: [] } },
      { id: 'n-decision', type: 'decision', position: { x: 700, y: 250 }, data: { label: 'Décision' } },
      { id: 'n-approved', type: 'status', position: { x: 920, y: 100 }, data: { label: 'Approuvé', statusId: 'approved', color: '#1e8a44' } },
      { id: 'n-commented', type: 'status', position: { x: 920, y: 250 }, data: { label: 'Commenté', statusId: 'commented', color: '#e49325' } },
      { id: 'n-rejected', type: 'status', position: { x: 920, y: 400 }, data: { label: 'Rejeté', statusId: 'rejected', color: '#da212c' } },
      { id: 'n-move', type: 'action', position: { x: 1140, y: 100 }, data: { label: 'Déplacer vers validé', autoActions: [{ id: 'a1', type: 'move_file', config: {}, label: 'Déplacer fichier' }] } },
      { id: 'n-notify', type: 'action', position: { x: 1140, y: 400 }, data: { label: 'Déplacer vers rejeté', autoActions: [{ id: 'a2', type: 'move_file', config: { useRejectedFolder: true }, label: 'Déplacer vers rejeté' }, { id: 'a3', type: 'notify_user', config: {}, label: 'Notification rejet' }] } },
      { id: 'n-end-ok', type: 'end', position: { x: 1360, y: 100 }, data: { label: 'Fin (validé)' } },
      { id: 'n-end-ko', type: 'end', position: { x: 1360, y: 400 }, data: { label: 'Fin (rejeté)' } },
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e-1', source: 'n-start', target: 'n-pending' },
      { id: 'e-2', source: 'n-pending', target: 'n-review' },
      { id: 'e-3', source: 'n-review', target: 'n-decision' },
      { id: 'e-4', source: 'n-decision', target: 'n-approved', label: 'Approuvé' },
      { id: 'e-5', source: 'n-decision', target: 'n-commented', label: 'Commenté' },
      { id: 'e-6', source: 'n-decision', target: 'n-rejected', label: 'Rejeté' },
      { id: 'e-7', source: 'n-approved', target: 'n-move' },
      { id: 'e-8', source: 'n-rejected', target: 'n-notify' },
      { id: 'e-9', source: 'n-move', target: 'n-end-ok' },
      { id: 'e-10', source: 'n-notify', target: 'n-end-ko' },
      { id: 'e-11', source: 'n-commented', target: 'n-review', label: 'Retour', animated: true },
    ];

    return makeDefinition({
      name: 'Validation documentaire standard',
      description: 'Workflow classique de validation avec Approuvé/Commenté/Rejeté',
      type: 'document_validation',
      projectId,
      createdBy,
      statuses: DOCUMENT_VALIDATION_STATUSES,
      nodes,
      edges,
      settings: {
        autoStartOnUpload: true,
        notifyOnStatusChange: true,
        allowResubmission: true,
        parallelReview: false,
      },
    });
  },
};

// ─── 2. VISA BIM COMPLET ────────────────────────────────────────────────────

const visaBimComplet: WorkflowTemplate = {
  id: 'tpl-visa-bim',
  name: 'Visa BIM complet',
  description: 'Workflow de visa BIM avec tous les statuts : VSO, VAO, VAO Bloquantes. Inclut double vérification (conception + conformité) et actions automatiques.',
  icon: 'Building2',
  category: 'validation',
  complexity: 'advanced',
  estimatedSteps: 16,
  preview: 'Dépôt → Vérif. conception → Vérif. conformité → Décision (VSO/VAO/VAO Bloq./Rejeté) → Actions',
  build: (projectId, createdBy) => {
    const nodes: WorkflowNode[] = [
      { id: 'n-start', type: 'start', position: { x: 50, y: 300 }, data: { label: 'Dépôt maquette/document' } },
      { id: 'n-pending', type: 'status', position: { x: 250, y: 300 }, data: { label: 'En attente de visa', statusId: 'pending', color: '#6a6e79' } },
      { id: 'n-review1', type: 'review', position: { x: 470, y: 300 }, data: { label: 'Vérification conception', requiredApprovals: 1, assignees: [] } },
      { id: 'n-review2', type: 'review', position: { x: 690, y: 300 }, data: { label: 'Vérification conformité', requiredApprovals: 1, assignees: [] } },
      { id: 'n-decision', type: 'decision', position: { x: 920, y: 300 }, data: { label: 'Synthèse des visas' } },
      // Statuts de sortie
      { id: 'n-vso', type: 'status', position: { x: 1160, y: 60 }, data: { label: 'VSO', statusId: 'vso', color: '#4caf50' } },
      { id: 'n-vao', type: 'status', position: { x: 1160, y: 190 }, data: { label: 'VAO', statusId: 'vao', color: '#f0c040' } },
      { id: 'n-vao-bloq', type: 'status', position: { x: 1160, y: 340 }, data: { label: 'VAO Bloquantes', statusId: 'vao_blocking', color: '#d4760a' } },
      { id: 'n-rejected', type: 'status', position: { x: 1160, y: 490 }, data: { label: 'Rejeté', statusId: 'rejected', color: '#da212c' } },
      // Actions
      { id: 'n-move-ok', type: 'action', position: { x: 1400, y: 60 }, data: { label: 'Déplacer vers validé', autoActions: [{ id: 'a1', type: 'move_file', config: {}, label: 'Déplacer' }] } },
      { id: 'n-notify-vao', type: 'action', position: { x: 1400, y: 190 }, data: { label: 'Notifier observations', autoActions: [{ id: 'a2', type: 'notify_user', config: {}, label: 'Notifier VAO' }] } },
      { id: 'n-notify-bloq', type: 'action', position: { x: 1400, y: 340 }, data: { label: 'Alerter bloquant', autoActions: [{ id: 'a3', type: 'notify_user', config: { priority: 'high' }, label: 'Alerte bloquante' }] } },
      { id: 'n-notify-rej', type: 'action', position: { x: 1400, y: 490 }, data: { label: 'Déplacer et notifier rejet', autoActions: [{ id: 'a4', type: 'move_file', config: { useRejectedFolder: true }, label: 'Déplacer vers rejeté' }, { id: 'a5', type: 'notify_user', config: {}, label: 'Notifier rejet' }] } },
      // Fins
      { id: 'n-end-ok', type: 'end', position: { x: 1640, y: 60 }, data: { label: 'Fin (validé)' } },
      { id: 'n-end-vao', type: 'end', position: { x: 1640, y: 190 }, data: { label: 'Fin (avec observations)' } },
      { id: 'n-end-ko', type: 'end', position: { x: 1640, y: 440 }, data: { label: 'Fin (rejeté)' } },
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e-1', source: 'n-start', target: 'n-pending' },
      { id: 'e-2', source: 'n-pending', target: 'n-review1' },
      { id: 'e-3', source: 'n-review1', target: 'n-review2' },
      { id: 'e-4', source: 'n-review2', target: 'n-decision' },
      { id: 'e-5', source: 'n-decision', target: 'n-vso', label: 'VSO' },
      { id: 'e-6', source: 'n-decision', target: 'n-vao', label: 'VAO' },
      { id: 'e-7', source: 'n-decision', target: 'n-vao-bloq', label: 'VAO Bloquantes' },
      { id: 'e-8', source: 'n-decision', target: 'n-rejected', label: 'Rejeté' },
      { id: 'e-9', source: 'n-vso', target: 'n-move-ok' },
      { id: 'e-10', source: 'n-vao', target: 'n-notify-vao' },
      { id: 'e-11', source: 'n-vao-bloq', target: 'n-notify-bloq' },
      { id: 'e-12', source: 'n-rejected', target: 'n-notify-rej' },
      { id: 'e-13', source: 'n-move-ok', target: 'n-end-ok' },
      { id: 'e-14', source: 'n-notify-vao', target: 'n-end-vao' },
      { id: 'e-15', source: 'n-notify-bloq', target: 'n-review1', label: 'Correction requise', animated: true },
      { id: 'e-16', source: 'n-notify-rej', target: 'n-end-ko' },
    ];

    return makeDefinition({
      name: 'Visa BIM complet',
      description: 'Workflow de visa BIM avec VSO/VAO/VAO Bloquantes — double vérification',
      type: 'document_validation',
      projectId,
      createdBy,
      statuses: DOCUMENT_VALIDATION_STATUSES,
      nodes,
      edges,
      settings: {
        autoStartOnUpload: true,
        notifyOnStatusChange: true,
        allowResubmission: true,
        parallelReview: false,
      },
    });
  },
};

// ─── 3. APPROBATION RAPIDE ──────────────────────────────────────────────────

const approbationRapide: WorkflowTemplate = {
  id: 'tpl-approbation-rapide',
  name: 'Approbation rapide',
  description: 'Workflow simplifié : un seul réviseur approuve ou rejette. Idéal pour les documents simples ou les urgences.',
  icon: 'Zap',
  category: 'approval',
  complexity: 'simple',
  estimatedSteps: 6,
  preview: 'Dépôt → Approbation → Approuvé / Rejeté → Fin',
  build: (projectId, createdBy) => {
    const nodes: WorkflowNode[] = [
      { id: 'n-start', type: 'start', position: { x: 50, y: 200 }, data: { label: 'Dépôt' } },
      { id: 'n-review', type: 'review', position: { x: 280, y: 200 }, data: { label: 'Approbation', requiredApprovals: 1, assignees: [] } },
      { id: 'n-decision', type: 'decision', position: { x: 510, y: 200 }, data: { label: 'Résultat' } },
      { id: 'n-approved', type: 'status', position: { x: 730, y: 100 }, data: { label: 'Approuvé', statusId: 'approved', color: '#1e8a44' } },
      { id: 'n-rejected', type: 'status', position: { x: 730, y: 320 }, data: { label: 'Rejeté', statusId: 'rejected', color: '#da212c' } },
      { id: 'n-end', type: 'end', position: { x: 960, y: 200 }, data: { label: 'Fin' } },
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e-1', source: 'n-start', target: 'n-review' },
      { id: 'e-2', source: 'n-review', target: 'n-decision' },
      { id: 'e-3', source: 'n-decision', target: 'n-approved', label: 'Approuvé' },
      { id: 'e-4', source: 'n-decision', target: 'n-rejected', label: 'Rejeté' },
      { id: 'e-5', source: 'n-approved', target: 'n-end' },
      { id: 'e-6', source: 'n-rejected', target: 'n-end' },
    ];

    return makeDefinition({
      name: 'Approbation rapide',
      description: 'Approbation en une étape — Approuvé ou Rejeté',
      type: 'approval',
      projectId,
      createdBy,
      statuses: DOCUMENT_VALIDATION_STATUSES.filter(
        (s) => ['pending', 'approved', 'rejected'].includes(s.id)
      ),
      nodes,
      edges,
      settings: {
        autoStartOnUpload: false,
        notifyOnStatusChange: true,
        allowResubmission: true,
        parallelReview: false,
      },
    });
  },
};

// ─── 4. REVUE PARALLÈLE ────────────────────────────────────────────────────

const revueParallele: WorkflowTemplate = {
  id: 'tpl-revue-parallele',
  name: 'Revue multi-intervenants',
  description: 'Plusieurs réviseurs examinent le document en parallèle. Le workflow avance quand tous ont donné leur visa. Idéal pour la synthèse BIM.',
  icon: 'Users',
  category: 'review',
  complexity: 'standard',
  estimatedSteps: 9,
  preview: 'Dépôt → Revue parallèle (N réviseurs) → Synthèse → Décision → Actions',
  build: (projectId, createdBy) => {
    const nodes: WorkflowNode[] = [
      { id: 'n-start', type: 'start', position: { x: 50, y: 250 }, data: { label: 'Soumission' } },
      { id: 'n-pending', type: 'status', position: { x: 250, y: 250 }, data: { label: 'En revue', statusId: 'pending', color: '#6a6e79' } },
      { id: 'n-review', type: 'review', position: { x: 470, y: 250 }, data: { label: 'Revue parallèle', requiredApprovals: 3, assignees: [] } },
      { id: 'n-decision', type: 'decision', position: { x: 700, y: 250 }, data: { label: 'Consensus' } },
      { id: 'n-approved', type: 'status', position: { x: 930, y: 120 }, data: { label: 'Validé', statusId: 'approved', color: '#1e8a44' } },
      { id: 'n-vao', type: 'status', position: { x: 930, y: 250 }, data: { label: 'Avec observations', statusId: 'vao', color: '#f0c040' } },
      { id: 'n-rejected', type: 'status', position: { x: 930, y: 380 }, data: { label: 'Rejeté', statusId: 'rejected', color: '#da212c' } },
      { id: 'n-move', type: 'action', position: { x: 1160, y: 120 }, data: { label: 'Publier', autoActions: [{ id: 'a1', type: 'move_file', config: {}, label: 'Publier' }] } },
      { id: 'n-end', type: 'end', position: { x: 1380, y: 250 }, data: { label: 'Fin' } },
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e-1', source: 'n-start', target: 'n-pending' },
      { id: 'e-2', source: 'n-pending', target: 'n-review' },
      { id: 'e-3', source: 'n-review', target: 'n-decision' },
      { id: 'e-4', source: 'n-decision', target: 'n-approved', label: 'Unanime' },
      { id: 'e-5', source: 'n-decision', target: 'n-vao', label: 'Observations' },
      { id: 'e-6', source: 'n-decision', target: 'n-rejected', label: 'Refusé' },
      { id: 'e-7', source: 'n-approved', target: 'n-move' },
      { id: 'e-8', source: 'n-move', target: 'n-end' },
      { id: 'e-9', source: 'n-vao', target: 'n-end' },
      { id: 'e-10', source: 'n-rejected', target: 'n-end' },
    ];

    return makeDefinition({
      name: 'Revue multi-intervenants',
      description: 'Revue parallèle par plusieurs réviseurs — consensus requis',
      type: 'document_review',
      projectId,
      createdBy,
      statuses: DOCUMENT_VALIDATION_STATUSES,
      nodes,
      edges,
      settings: {
        autoStartOnUpload: false,
        notifyOnStatusChange: true,
        allowResubmission: true,
        parallelReview: true,
      },
    });
  },
};

// ─── 5. CYCLE COMPLET AVEC CORRECTION ───────────────────────────────────────

const cycleCorrection: WorkflowTemplate = {
  id: 'tpl-cycle-correction',
  name: 'Cycle avec correction',
  description: 'Workflow avec boucle de correction : si rejeté ou VAO bloquantes, le déposant corrige et re-soumet. Le cycle continue jusqu\'à approbation.',
  icon: 'RefreshCcw',
  category: 'validation',
  complexity: 'advanced',
  estimatedSteps: 13,
  preview: 'Dépôt → Vérification → Décision → (si problème) → Correction → Re-soumission → ...',
  build: (projectId, createdBy) => {
    const nodes: WorkflowNode[] = [
      { id: 'n-start', type: 'start', position: { x: 50, y: 250 }, data: { label: 'Soumission initiale' } },
      { id: 'n-pending', type: 'status', position: { x: 260, y: 250 }, data: { label: 'En attente de revue', statusId: 'pending', color: '#6a6e79' } },
      { id: 'n-review', type: 'review', position: { x: 490, y: 250 }, data: { label: 'Revue documentaire', requiredApprovals: 1, assignees: [] } },
      { id: 'n-decision', type: 'decision', position: { x: 720, y: 250 }, data: { label: 'Décision' } },
      { id: 'n-approved', type: 'status', position: { x: 960, y: 100 }, data: { label: 'Approuvé', statusId: 'approved', color: '#1e8a44' } },
      { id: 'n-vao-bloq', type: 'status', position: { x: 960, y: 250 }, data: { label: 'VAO Bloquantes', statusId: 'vao_blocking', color: '#d4760a' } },
      { id: 'n-rejected', type: 'status', position: { x: 960, y: 420 }, data: { label: 'Rejeté', statusId: 'rejected', color: '#da212c' } },
      { id: 'n-move', type: 'action', position: { x: 1200, y: 100 }, data: { label: 'Publier', autoActions: [{ id: 'a1', type: 'move_file', config: {}, label: 'Publier' }] } },
      { id: 'n-correction', type: 'action', position: { x: 1200, y: 330 }, data: { label: 'Demander correction', autoActions: [{ id: 'a2', type: 'notify_user', config: { template: 'correction_request' }, label: 'Demande correction' }, { id: 'a3', type: 'send_comment', config: { template: 'correction_needed' }, label: 'Commentaire correction' }] } },
      { id: 'n-end-ok', type: 'end', position: { x: 1440, y: 100 }, data: { label: 'Fin (validé)' } },
      // Retour vers pending pour boucle
    ];

    const edges: WorkflowEdge[] = [
      { id: 'e-1', source: 'n-start', target: 'n-pending' },
      { id: 'e-2', source: 'n-pending', target: 'n-review' },
      { id: 'e-3', source: 'n-review', target: 'n-decision' },
      { id: 'e-4', source: 'n-decision', target: 'n-approved', label: 'Approuvé' },
      { id: 'e-5', source: 'n-decision', target: 'n-vao-bloq', label: 'VAO Bloquantes' },
      { id: 'e-6', source: 'n-decision', target: 'n-rejected', label: 'Rejeté' },
      { id: 'e-7', source: 'n-approved', target: 'n-move' },
      { id: 'e-8', source: 'n-move', target: 'n-end-ok' },
      { id: 'e-9', source: 'n-vao-bloq', target: 'n-correction' },
      { id: 'e-10', source: 'n-rejected', target: 'n-correction' },
      { id: 'e-11', source: 'n-correction', target: 'n-pending', label: 'Re-soumission', animated: true },
    ];

    return makeDefinition({
      name: 'Cycle avec correction',
      description: 'Boucle de correction automatique — le document revient en revue après correction',
      type: 'document_validation',
      projectId,
      createdBy,
      statuses: DOCUMENT_VALIDATION_STATUSES,
      nodes,
      edges,
      settings: {
        autoStartOnUpload: false,
        notifyOnStatusChange: true,
        allowResubmission: true,
        parallelReview: false,
      },
    });
  },
};

// ─── EXPORT ─────────────────────────────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  validationStandard,
  visaBimComplet,
  approbationRapide,
  revueParallele,
  cycleCorrection,
];

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}
