import React, { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/stores/authStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { initWorkspaceApi, isInTrimbleConnect } from '@/api/workspaceApi';
import { initializeStores } from '@/api/dataLoader';
import { handleOAuthCallback, isOAuthCallback, startOAuthFlow, setupTokenRefresh } from '@/api/standaloneAuth';
import { FolderWatcher } from '@/engine';
import { DOCUMENT_VALIDATION_STATUSES } from '@/models/workflow';
import type { ValidationDocument } from '@/models/document';
import { DEFAULT_LABELS } from '@/models/document';
import type { WorkflowDefinition, WorkflowInstance } from '@/models/workflow';

/** Mode applicatif : 'production' quand dans TC, 'demo' sinon (ou forcé par env) */
const APP_MODE = (import.meta.env.VITE_APP_MODE as string) || 'demo';

// ============================================================================
// DEMO DATA — Pour le développement et la démonstration
// En production, ces données viennent de l'API backend + Trimble Connect
// ============================================================================

const DEMO_DOCUMENTS: ValidationDocument[] = [
  {
    id: 'doc-1',
    fileId: 'tc-file-001',
    fileName: 'Plan_Architecture_Niveau_0.ifc',
    fileExtension: 'ifc',
    fileSize: 15400000,
    filePath: '/Projet BIM/Plans/Architecture/',
    uploadedBy: 'user-1',
    uploadedByName: 'Marie Dupont',
    uploadedByEmail: 'marie.dupont@example.com',
    uploadedAt: '2026-02-10T09:30:00Z',
    lastModified: '2026-02-10T09:30:00Z',
    versionNumber: 1,
    projectId: 'proj-1',
    workflowInstanceId: 'wf-inst-1',
    currentStatus: { id: 'pending', name: 'En attente', color: '#6a6e79', changedAt: '2026-02-10T09:30:00Z', changedBy: 'Système' },
    reviewers: [
      { userId: 'user-2', userName: 'Pierre Martin', userEmail: 'pierre.martin@example.com', role: 'reviewer', isRequired: true },
      { userId: 'user-3', userName: 'Sophie Laurent', userEmail: 'sophie.laurent@example.com', role: 'approver', isRequired: true },
    ],
    comments: [],
    labels: [DEFAULT_LABELS[0], DEFAULT_LABELS[12], DEFAULT_LABELS[10]],
    versionHistory: [
      { versionNumber: 1, versionId: 'v-1-plan-archi', fileName: 'Plan_Architecture_Niveau_0.ifc', fileSize: 4500000, uploadedBy: 'user-1', uploadedByName: 'Marie Dupont', uploadedAt: '2026-02-10T09:30:00Z' },
    ],
    metadata: { discipline: 'Architecture', lot: 'Gros oeuvre' },
  },
  {
    id: 'doc-2',
    fileId: 'tc-file-002',
    fileName: 'Note_Calcul_Structure.pdf',
    fileExtension: 'pdf',
    fileSize: 2300000,
    filePath: '/Projet BIM/Documents/Structure/',
    uploadedBy: 'user-4',
    uploadedByName: 'Jean Leroy',
    uploadedByEmail: 'jean.leroy@example.com',
    uploadedAt: '2026-02-09T14:15:00Z',
    lastModified: '2026-02-09T14:15:00Z',
    versionNumber: 2,
    projectId: 'proj-1',
    workflowInstanceId: 'wf-inst-2',
    currentStatus: { id: 'approved', name: 'Approuvé', color: '#1e8a44', changedAt: '2026-02-11T11:00:00Z', changedBy: 'Pierre Martin' },
    reviewers: [
      { userId: 'user-2', userName: 'Pierre Martin', userEmail: 'pierre.martin@example.com', role: 'reviewer', decision: 'approved', decidedAt: '2026-02-11T11:00:00Z', isRequired: true },
    ],
    comments: [
      { id: 'c1', documentId: 'doc-2', authorId: 'user-2', authorName: 'Pierre Martin', authorEmail: 'pierre.martin@example.com', content: 'Document conforme, validé.', createdAt: '2026-02-11T11:00:00Z', isSystemMessage: false, attachments: [], reactions: [{ emoji: '👍', users: [{ userId: 'user-1', userName: 'Marie Dupont' }] }] },
    ],
    labels: [DEFAULT_LABELS[1], DEFAULT_LABELS[11]],
    versionHistory: [
      { versionNumber: 1, versionId: 'v-1-note-calc', fileName: 'Note_Calcul_Structure.pdf', fileSize: 1200000, uploadedBy: 'user-2', uploadedByName: 'Pierre Martin', uploadedAt: '2026-02-08T10:00:00Z' },
      { versionNumber: 2, versionId: 'v-2-note-calc', fileName: 'Note_Calcul_Structure.pdf', fileSize: 1250000, uploadedBy: 'user-2', uploadedByName: 'Pierre Martin', uploadedAt: '2026-02-09T14:15:00Z', comment: 'Correction des charges et ajout annexe sismique' },
    ],
    metadata: { discipline: 'Structure' },
  },
  {
    id: 'doc-3',
    fileId: 'tc-file-003',
    fileName: 'CCTP_Lot_CVC.docx',
    fileExtension: 'docx',
    fileSize: 890000,
    filePath: '/Projet BIM/Documents/CVC/',
    uploadedBy: 'user-5',
    uploadedByName: 'Camille Bernard',
    uploadedByEmail: 'camille.bernard@example.com',
    uploadedAt: '2026-02-08T16:45:00Z',
    lastModified: '2026-02-08T16:45:00Z',
    versionNumber: 1,
    projectId: 'proj-1',
    workflowInstanceId: 'wf-inst-3',
    currentStatus: { id: 'vao_blocking', name: 'VAO Bloquantes', color: '#d4760a', changedAt: '2026-02-10T09:00:00Z', changedBy: 'Sophie Laurent' },
    reviewers: [
      { userId: 'user-3', userName: 'Sophie Laurent', userEmail: 'sophie.laurent@example.com', role: 'reviewer', decision: 'vao_blocking', decidedAt: '2026-02-10T09:00:00Z', isRequired: true },
    ],
    comments: [
      { id: 'c2', documentId: 'doc-3', authorId: 'system', authorName: 'Système', authorEmail: '', content: 'Le document a reçu un visa avec observations bloquantes.', createdAt: '2026-02-10T09:00:00Z', isSystemMessage: true, attachments: [], reactions: [] },
      { id: 'c3', documentId: 'doc-3', authorId: 'user-3', authorName: 'Sophie Laurent', authorEmail: 'sophie.laurent@example.com', content: 'Les débits d\'air ne correspondent pas aux dernières normes. Merci de corriger les tableaux en annexe B.', createdAt: '2026-02-10T09:01:00Z', isSystemMessage: false, attachments: [{ id: 'att-1', type: 'url', name: 'Normes débits d\'air', url: 'https://example.com/normes-cvc' }], reactions: [{ emoji: '👀', users: [{ userId: 'user-5', userName: 'Camille Bernard' }] }, { emoji: '👍', users: [{ userId: 'user-2', userName: 'Pierre Martin' }] }] },
    ],
    labels: [DEFAULT_LABELS[2], DEFAULT_LABELS[9]],
    versionHistory: [
      { versionNumber: 1, versionId: 'v-1-cctp-cvc', fileName: 'CCTP_Lot_CVC.docx', fileSize: 850000, uploadedBy: 'user-1', uploadedByName: 'Marie Dupont', uploadedAt: '2026-02-08T16:45:00Z' },
    ],
    metadata: { discipline: 'CVC', lot: 'Lot technique' },
  },
  {
    id: 'doc-4',
    fileId: 'tc-file-004',
    fileName: 'Plan_Electricite_R+1.dwg',
    fileExtension: 'dwg',
    fileSize: 5600000,
    filePath: '/Projet BIM/Plans/Electricité/',
    uploadedBy: 'user-1',
    uploadedByName: 'Marie Dupont',
    uploadedByEmail: 'marie.dupont@example.com',
    uploadedAt: '2026-02-11T08:00:00Z',
    lastModified: '2026-02-11T08:00:00Z',
    versionNumber: 3,
    projectId: 'proj-1',
    workflowInstanceId: 'wf-inst-4',
    currentStatus: { id: 'vso', name: 'VSO', color: '#4caf50', changedAt: '2026-02-12T10:30:00Z', changedBy: 'Pierre Martin' },
    reviewers: [
      { userId: 'user-2', userName: 'Pierre Martin', userEmail: 'pierre.martin@example.com', role: 'reviewer', decision: 'vso', decidedAt: '2026-02-12T10:30:00Z', isRequired: true },
    ],
    comments: [],
    labels: [DEFAULT_LABELS[3], DEFAULT_LABELS[10]],
    versionHistory: [
      { versionNumber: 1, versionId: 'v-1-plan-elec', fileName: 'Plan_Electricite_RDC.dwg', fileSize: 3200000, uploadedBy: 'user-3', uploadedByName: 'Sophie Laurent', uploadedAt: '2026-02-05T09:00:00Z' },
      { versionNumber: 2, versionId: 'v-2-plan-elec', fileName: 'Plan_Electricite_RDC.dwg', fileSize: 3300000, uploadedBy: 'user-3', uploadedByName: 'Sophie Laurent', uploadedAt: '2026-02-08T14:00:00Z', comment: 'Mise à jour des circuits' },
      { versionNumber: 3, versionId: 'v-3-plan-elec', fileName: 'Plan_Electricite_RDC.dwg', fileSize: 3400000, uploadedBy: 'user-3', uploadedByName: 'Sophie Laurent', uploadedAt: '2026-02-11T08:00:00Z', comment: 'Corrections finales suite au visa' },
    ],
    metadata: { discipline: 'Electricité' },
  },
  {
    id: 'doc-5',
    fileId: 'tc-file-005',
    fileName: 'Rapport_Geotechnique.pdf',
    fileExtension: 'pdf',
    fileSize: 12000000,
    filePath: '/Projet BIM/Documents/Géotechnique/',
    uploadedBy: 'user-4',
    uploadedByName: 'Jean Leroy',
    uploadedByEmail: 'jean.leroy@example.com',
    uploadedAt: '2026-02-07T10:00:00Z',
    lastModified: '2026-02-07T10:00:00Z',
    versionNumber: 1,
    projectId: 'proj-1',
    currentStatus: { id: 'rejected', name: 'Rejeté', color: '#da212c', changedAt: '2026-02-09T16:00:00Z', changedBy: 'Sophie Laurent' },
    reviewers: [
      { userId: 'user-3', userName: 'Sophie Laurent', userEmail: 'sophie.laurent@example.com', role: 'approver', decision: 'rejected', decidedAt: '2026-02-09T16:00:00Z', isRequired: true },
    ],
    comments: [
      { id: 'c4', documentId: 'doc-5', authorId: 'user-3', authorName: 'Sophie Laurent', authorEmail: 'sophie.laurent@example.com', content: 'Le rapport ne contient pas les résultats des sondages complémentaires demandés. Merci de compléter et re-soumettre.', createdAt: '2026-02-09T16:00:00Z', isSystemMessage: false, attachments: [{ id: 'att-2', type: 'image', name: 'capture_erreur.png', url: '', mimeType: 'image/png', size: 245000 }], reactions: [{ emoji: '😟', users: [{ userId: 'user-4', userName: 'Jean Leroy' }] }] },
    ],
    labels: [DEFAULT_LABELS[6], DEFAULT_LABELS[11], DEFAULT_LABELS[13]],
    versionHistory: [
      { versionNumber: 1, versionId: 'v-1-rapport-geo', fileName: 'Rapport_Geotechnique.pdf', fileSize: 5600000, uploadedBy: 'user-1', uploadedByName: 'Marie Dupont', uploadedAt: '2026-02-07T10:00:00Z' },
    ],
    metadata: { discipline: 'Géotechnique' },
  },
  {
    id: 'doc-6',
    fileId: 'tc-file-006',
    fileName: 'Maquette_MEP_Synthese.ifc',
    fileExtension: 'ifc',
    fileSize: 45000000,
    filePath: '/Projet BIM/Maquettes/Synthèse/',
    uploadedBy: 'user-5',
    uploadedByName: 'Camille Bernard',
    uploadedByEmail: 'camille.bernard@example.com',
    uploadedAt: '2026-02-12T07:30:00Z',
    lastModified: '2026-02-12T07:30:00Z',
    versionNumber: 1,
    projectId: 'proj-1',
    currentStatus: { id: 'commented', name: 'Commenté', color: '#e49325', changedAt: '2026-02-12T11:00:00Z', changedBy: 'Marie Dupont' },
    reviewers: [
      { userId: 'user-1', userName: 'Marie Dupont', userEmail: 'marie.dupont@example.com', role: 'reviewer', decision: 'approved_with_comments', decidedAt: '2026-02-12T11:00:00Z', isRequired: true },
      { userId: 'user-2', userName: 'Pierre Martin', userEmail: 'pierre.martin@example.com', role: 'approver', isRequired: true },
    ],
    comments: [
      { id: 'c5', documentId: 'doc-6', authorId: 'user-1', authorName: 'Marie Dupont', authorEmail: 'marie.dupont@example.com', content: 'Quelques clashs détectés entre gaines CVC et structure au niveau R+2. Voir BCF topic #45.', createdAt: '2026-02-12T11:00:00Z', isSystemMessage: false, attachments: [], reactions: [{ emoji: '🔧', users: [{ userId: 'user-5', userName: 'Camille Bernard' }] }, { emoji: '👍', users: [{ userId: 'user-2', userName: 'Pierre Martin' }, { userId: 'user-3', userName: 'Sophie Laurent' }] }] },
    ],
    labels: [DEFAULT_LABELS[5], DEFAULT_LABELS[12]],
    versionHistory: [
      { versionNumber: 1, versionId: 'v-1-maquette-synth', fileName: 'Maquette_Synthese_Bat_A.rvt', fileSize: 15000000, uploadedBy: 'user-2', uploadedByName: 'Pierre Martin', uploadedAt: '2026-02-12T07:30:00Z' },
    ],
    metadata: { discipline: 'Synthèse', lot: 'Tous lots' },
  },
];

// ============================================================================
// DEMO WORKFLOW INSTANCES — Instances de workflow pour les documents de démo
// Permettent de tester le moteur d'exécution sans backend réel
// ============================================================================

const DEMO_INSTANCES: WorkflowInstance[] = [
  {
    id: 'wf-inst-1',
    workflowDefinitionId: 'wf-def-1',
    projectId: 'proj-1',
    documentId: 'doc-1',
    documentName: 'Plan_Architecture_Niveau_0.ifc',
    currentNodeId: 'n-review',
    currentStatusId: 'pending',
    startedBy: 'user-1',
    startedAt: '2026-02-10T09:30:00Z',
    updatedAt: '2026-02-10T09:35:00Z',
    deadline: '2026-02-14T18:00:00Z',
    priority: 'high',
    history: [
      { id: 'h1', timestamp: '2026-02-10T09:30:00Z', fromNodeId: '', toNodeId: 'n-start', fromStatusId: '', toStatusId: 'pending', userId: 'user-1', userName: 'Marie Dupont', action: 'Workflow démarré' },
      { id: 'h2', timestamp: '2026-02-10T09:31:00Z', fromNodeId: 'n-start', toNodeId: 'n-pending', fromStatusId: 'pending', toStatusId: 'pending', userId: 'system', userName: 'Système', action: 'Transition: Dépôt document → En attente' },
      { id: 'h3', timestamp: '2026-02-10T09:35:00Z', fromNodeId: 'n-pending', toNodeId: 'n-review', fromStatusId: 'pending', toStatusId: 'pending', userId: 'system', userName: 'Système', action: 'Transition: En attente → Vérification conception' },
    ],
    reviews: [],
  },
  {
    id: 'wf-inst-2',
    workflowDefinitionId: 'wf-def-1',
    projectId: 'proj-1',
    documentId: 'doc-2',
    documentName: 'Note_Calcul_Structure.pdf',
    currentNodeId: 'n-end-ok',
    currentStatusId: 'approved',
    startedBy: 'user-4',
    startedAt: '2026-02-09T14:15:00Z',
    updatedAt: '2026-02-11T11:05:00Z',
    completedAt: '2026-02-11T11:05:00Z',
    deadline: '2026-02-15T18:00:00Z',
    priority: 'normal',
    history: [
      { id: 'h4', timestamp: '2026-02-09T14:15:00Z', fromNodeId: '', toNodeId: 'n-start', fromStatusId: '', toStatusId: 'pending', userId: 'user-4', userName: 'Jean Leroy', action: 'Workflow démarré' },
      { id: 'h5', timestamp: '2026-02-11T11:00:00Z', fromNodeId: 'n-review', toNodeId: 'n-decision', fromStatusId: 'pending', toStatusId: 'pending', userId: 'system', userName: 'Système', action: 'Review complétée → Décision' },
      { id: 'h6', timestamp: '2026-02-11T11:01:00Z', fromNodeId: 'n-decision', toNodeId: 'n-approved', fromStatusId: 'pending', toStatusId: 'approved', userId: 'system', userName: 'Système', action: 'Décision: Approuvé — Toutes les reviews sont approuvées' },
      { id: 'h7', timestamp: '2026-02-11T11:05:00Z', fromNodeId: 'n-move', toNodeId: 'n-end-ok', fromStatusId: 'approved', toStatusId: 'approved', userId: 'system', userName: 'Système', action: 'Workflow terminé (validé)' },
    ],
    reviews: [
      { id: 'r1', instanceId: 'wf-inst-2', reviewerId: 'user-2', reviewerName: 'Pierre Martin', reviewerEmail: 'pierre.martin@example.com', statusId: 'approved', decision: 'approved', comment: 'Document conforme, validé.', reviewedAt: '2026-02-11T11:00:00Z', requestedAt: '2026-02-09T14:15:00Z', isCompleted: true },
    ],
  },
  {
    id: 'wf-inst-3',
    workflowDefinitionId: 'wf-def-1',
    projectId: 'proj-1',
    documentId: 'doc-3',
    documentName: 'CCTP_Lot_CVC.docx',
    currentNodeId: 'n-commented',
    currentStatusId: 'vao_blocking',
    startedBy: 'user-5',
    startedAt: '2026-02-08T16:45:00Z',
    updatedAt: '2026-02-10T09:00:00Z',
    deadline: '2026-02-12T18:00:00Z',
    priority: 'urgent',
    history: [
      { id: 'h8', timestamp: '2026-02-08T16:45:00Z', fromNodeId: '', toNodeId: 'n-start', fromStatusId: '', toStatusId: 'pending', userId: 'user-5', userName: 'Camille Bernard', action: 'Workflow démarré' },
      { id: 'h9', timestamp: '2026-02-10T09:00:00Z', fromNodeId: 'n-decision', toNodeId: 'n-commented', fromStatusId: 'pending', toStatusId: 'vao_blocking', userId: 'system', userName: 'Système', action: 'Décision: Commenté — VAO Bloquantes' },
    ],
    reviews: [
      { id: 'r2', instanceId: 'wf-inst-3', reviewerId: 'user-3', reviewerName: 'Sophie Laurent', reviewerEmail: 'sophie.laurent@example.com', statusId: 'vao_blocking', decision: 'vao_blocking', comment: 'Les débits d\'air ne correspondent pas aux dernières normes.', observations: ['Tableau annexe B incorrect', 'Normes 2025 non appliquées'], reviewedAt: '2026-02-10T09:00:00Z', requestedAt: '2026-02-08T16:45:00Z', isCompleted: true },
    ],
  },
  {
    id: 'wf-inst-4',
    workflowDefinitionId: 'wf-def-1',
    projectId: 'proj-1',
    documentId: 'doc-4',
    documentName: 'Plan_Electricite_R+1.dwg',
    currentNodeId: 'n-end-ok',
    currentStatusId: 'vso',
    startedBy: 'user-1',
    startedAt: '2026-02-11T08:00:00Z',
    updatedAt: '2026-02-12T10:35:00Z',
    completedAt: '2026-02-12T10:35:00Z',
    history: [
      { id: 'h10', timestamp: '2026-02-11T08:00:00Z', fromNodeId: '', toNodeId: 'n-start', fromStatusId: '', toStatusId: 'pending', userId: 'user-1', userName: 'Marie Dupont', action: 'Workflow démarré' },
      { id: 'h11', timestamp: '2026-02-12T10:30:00Z', fromNodeId: 'n-decision', toNodeId: 'n-approved', fromStatusId: 'pending', toStatusId: 'vso', userId: 'system', userName: 'Système', action: 'Décision: Approuvé — VSO' },
      { id: 'h12', timestamp: '2026-02-12T10:35:00Z', fromNodeId: 'n-move', toNodeId: 'n-end-ok', fromStatusId: 'vso', toStatusId: 'vso', userId: 'system', userName: 'Système', action: 'Workflow terminé (validé)' },
    ],
    reviews: [
      { id: 'r3', instanceId: 'wf-inst-4', reviewerId: 'user-2', reviewerName: 'Pierre Martin', reviewerEmail: 'pierre.martin@example.com', statusId: 'vso', decision: 'vso', reviewedAt: '2026-02-12T10:30:00Z', requestedAt: '2026-02-11T08:00:00Z', isCompleted: true },
    ],
  },
  {
    id: 'wf-inst-6',
    workflowDefinitionId: 'wf-def-1',
    projectId: 'proj-1',
    documentId: 'doc-6',
    documentName: 'Maquette_MEP_Synthese.ifc',
    currentNodeId: 'n-review',
    currentStatusId: 'commented',
    startedBy: 'user-5',
    startedAt: '2026-02-12T07:30:00Z',
    updatedAt: '2026-02-12T11:00:00Z',
    history: [
      { id: 'h13', timestamp: '2026-02-12T07:30:00Z', fromNodeId: '', toNodeId: 'n-start', fromStatusId: '', toStatusId: 'pending', userId: 'user-5', userName: 'Camille Bernard', action: 'Workflow démarré' },
      { id: 'h14', timestamp: '2026-02-12T11:00:00Z', fromNodeId: 'n-review', toNodeId: 'n-review', fromStatusId: 'pending', toStatusId: 'commented', userId: 'user-1', userName: 'Marie Dupont', action: 'Review partielle — En attente de Pierre Martin' },
    ],
    reviews: [
      { id: 'r4', instanceId: 'wf-inst-6', reviewerId: 'user-1', reviewerName: 'Marie Dupont', reviewerEmail: 'marie.dupont@example.com', statusId: 'commented', decision: 'approved_with_comments', comment: 'Quelques clashs détectés.', reviewedAt: '2026-02-12T11:00:00Z', requestedAt: '2026-02-12T07:30:00Z', isCompleted: true },
    ],
  },
];

const DEMO_WORKFLOW: WorkflowDefinition = {
  id: 'wf-def-1',
  name: 'Validation documentaire BIM',
  description: 'Workflow standard de validation des documents et maquettes BIM',
  version: 1,
  type: 'document_validation',
  projectId: 'proj-1',
  createdBy: 'user-1',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-02-01T14:00:00Z',
  isActive: true,
  statuses: DOCUMENT_VALIDATION_STATUSES,
  nodes: [
    { id: 'n-start', type: 'start', position: { x: 50, y: 250 }, data: { label: 'Dépôt document' } },
    { id: 'n-pending', type: 'status', position: { x: 250, y: 250 }, data: { label: 'En attente', statusId: 'pending', color: '#6a6e79' } },
    { id: 'n-review', type: 'review', position: { x: 470, y: 250 }, data: { label: 'Vérification conception', requiredApprovals: 1, assignees: ['user-2', 'user-3'] } },
    { id: 'n-decision', type: 'decision', position: { x: 700, y: 250 }, data: { label: 'Décision' } },
    { id: 'n-approved', type: 'status', position: { x: 900, y: 100 }, data: { label: 'Approuvé', statusId: 'approved', color: '#1e8a44' } },
    { id: 'n-commented', type: 'status', position: { x: 900, y: 250 }, data: { label: 'Commenté', statusId: 'commented', color: '#e49325' } },
    { id: 'n-rejected', type: 'status', position: { x: 900, y: 400 }, data: { label: 'Rejeté', statusId: 'rejected', color: '#da212c' } },
    { id: 'n-move', type: 'action', position: { x: 1120, y: 100 }, data: { label: 'Déplacer vers dossier validé', autoActions: [{ id: 'a1', type: 'move_file', config: {}, label: 'Déplacer' }] } },
    { id: 'n-notify', type: 'action', position: { x: 1120, y: 400 }, data: { label: 'Notifier déposant', autoActions: [{ id: 'a2', type: 'notify_user', config: {}, label: 'Notifier' }] } },
    { id: 'n-end-ok', type: 'end', position: { x: 1340, y: 100 }, data: { label: 'Fin (validé)' } },
    { id: 'n-end-ko', type: 'end', position: { x: 1340, y: 400 }, data: { label: 'Fin (rejeté)' } },
  ],
  edges: [
    { id: 'e-1', source: 'n-start', target: 'n-pending' },
    { id: 'e-2', source: 'n-pending', target: 'n-review' },
    { id: 'e-3', source: 'n-review', target: 'n-decision' },
    { id: 'e-4', source: 'n-decision', target: 'n-approved', sourceHandle: 'top', label: 'Approuvé' },
    { id: 'e-5', source: 'n-decision', target: 'n-commented', sourceHandle: 'right', label: 'Commenté' },
    { id: 'e-6', source: 'n-decision', target: 'n-rejected', sourceHandle: 'bottom', label: 'Rejeté' },
    { id: 'e-7', source: 'n-approved', target: 'n-move' },
    { id: 'e-8', source: 'n-rejected', target: 'n-notify' },
    { id: 'e-9', source: 'n-move', target: 'n-end-ok' },
    { id: 'e-10', source: 'n-notify', target: 'n-end-ko' },
    { id: 'e-11', source: 'n-commented', target: 'n-review', label: 'Retour', animated: true },
  ],
  settings: {
    sourceFolderId: 'folder-source',
    targetFolderId: 'folder-validated',
    autoStartOnUpload: true,
    notifyOnStatusChange: true,
    allowResubmission: true,
    parallelReview: false,
  },
};

export function App() {
  const { isLoading, isConnected, error } = useAuthStore();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function init() {
      const inTC = isInTrimbleConnect();
      const mode = inTC && APP_MODE === 'production' ? 'production' : 'demo';

      console.log(`[App] Initializing in ${mode} mode (inTC=${inTC}, APP_MODE=${APP_MODE})`);

      // Step 0: Handle OAuth callback if returning from Trimble Identity
      if (!inTC && isOAuthCallback()) {
        const success = await handleOAuthCallback();
        if (success) {
          setupTokenRefresh();
          console.log('[App] OAuth callback handled successfully');
        }
      }

      // Step 1: Connect to Workspace API if in Trimble Connect
      if (inTC) {
        const connected = await initWorkspaceApi();
        if (!connected && mode === 'production') {
          console.warn('[App] Workspace API connection failed, falling back to demo');
        }
      }

      // Step 2: Load data based on mode
      if (mode === 'production') {
        try {
          await initializeStores('production');
          console.log('[App] Production data loaded successfully');
        } catch (err) {
          console.warn('[App] Production load failed, loading demo data:', err);
          loadDemoData();
        }
      } else {
        loadDemoData();
      }

      // Step 3: Start FolderWatcher only in production mode with active connection
      if (mode === 'production' && useAuthStore.getState().isConnected) {
        FolderWatcher.startForActiveWorkflows();
      }

      setInitialized(true);
      useAuthStore.getState().setLoading(false);
    }

    function loadDemoData() {
      useDocumentStore.getState().setDocuments(DEMO_DOCUMENTS);
      useWorkflowStore.getState().setDefinitions([DEMO_WORKFLOW]);
      useWorkflowStore.getState().setInstances(DEMO_INSTANCES);
      console.log('[App] Demo data loaded');
    }

    init();

    // Cleanup: arrêter les watchers au démontage
    return () => {
      FolderWatcher.stopAll();
    };
  }, []);

  // Loading state
  if (!initialized || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Chargement de l'extension...</p>
        </div>
      </div>
    );
  }

  // Error state — with standalone login option
  if (error && !initialized) {
    const showLogin = !isInTrimbleConnect() && APP_MODE === 'production';
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <span className="text-xl">!</span>
          </div>
          <h2 className="mb-2 text-lg font-semibold">Erreur de connexion</h2>
          <p className="mb-4 text-sm text-muted-foreground">{error}</p>
          {showLogin && (
            <button
              onClick={() => startOAuthFlow()}
              className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Se connecter avec Trimble Identity
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <AppLayout />
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{
          duration: 4000,
          className: 'text-sm',
        }}
      />
    </>
  );
}
