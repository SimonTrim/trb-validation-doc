// ============================================================================
// WORKFLOW ENGINE — Types génériques réutilisables
// Ce module est conçu pour être utilisé avec n'importe quel type de workflow
// (validation documentaire, approbation, review, etc.)
// ============================================================================

/** Type de noeud dans le workflow */
export type WorkflowNodeType =
  | 'start'        // Point de départ
  | 'end'          // Point de fin
  | 'status'       // Noeud de statut (état du document)
  | 'decision'     // Point de décision (branchement conditionnel)
  | 'action'       // Action automatique (déplacer fichier, notifier, etc.)
  | 'review'       // Étape de review/visa
  | 'parallel'     // Exécution parallèle (visa multi-utilisateur)
  | 'timer';       // Délai / timer

/** Définition d'un statut de workflow */
export interface WorkflowStatus {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  isFinal: boolean;           // Statut terminal (fin de workflow)
  isDefault: boolean;         // Statut par défaut à l'entrée du workflow
  visibleInResolution: boolean; // Visible dans la résolution du résultat
  order: number;              // Ordre d'affichage
}

/** Statuts prédéfinis pour la validation documentaire */
export const DOCUMENT_VALIDATION_STATUSES: WorkflowStatus[] = [
  {
    id: 'pending',
    name: 'En attente',
    description: 'Document déposé, en attente de traitement',
    color: '#6a6e79',
    icon: 'clock',
    isFinal: false,
    isDefault: true,
    visibleInResolution: true,
    order: 0,
  },
  {
    id: 'approved',
    name: 'Approuvé',
    description: 'Document validé sans réserve',
    color: '#1e8a44',
    icon: 'check-circle',
    isFinal: true,
    isDefault: false,
    visibleInResolution: true,
    order: 1,
  },
  {
    id: 'commented',
    name: 'Commenté',
    description: 'Document commenté, modifications attendues',
    color: '#e49325',
    icon: 'message-circle',
    isFinal: false,
    isDefault: false,
    visibleInResolution: true,
    order: 2,
  },
  {
    id: 'rejected',
    name: 'Rejeté',
    description: 'Document rejeté',
    color: '#da212c',
    icon: 'x-circle',
    isFinal: true,
    isDefault: false,
    visibleInResolution: true,
    order: 3,
  },
  {
    id: 'vao',
    name: 'VAO',
    description: 'Validé avec observations',
    color: '#f0c040',
    icon: 'alert-circle',
    isFinal: true,
    isDefault: false,
    visibleInResolution: true,
    order: 4,
  },
  {
    id: 'vao_blocking',
    name: 'VAO Bloquantes',
    description: 'Visa avec observations bloquantes',
    color: '#d4760a',
    icon: 'alert-triangle',
    isFinal: false,
    isDefault: false,
    visibleInResolution: true,
    order: 5,
  },
  {
    id: 'vso',
    name: 'VSO',
    description: 'Visa sans observation',
    color: '#4caf50',
    icon: 'check',
    isFinal: true,
    isDefault: false,
    visibleInResolution: true,
    order: 6,
  },
  {
    id: 'refused',
    name: 'Refusé',
    description: 'Définitivement refusé',
    color: '#8b0000',
    icon: 'ban',
    isFinal: true,
    isDefault: false,
    visibleInResolution: true,
    order: 7,
  },
];

/** Position d'un noeud sur le canvas */
export interface NodePosition {
  x: number;
  y: number;
}

/** Données d'un noeud dans le workflow designer */
export interface WorkflowNodeData {
  [key: string]: unknown; // Allow indexing for React Flow compatibility
  label: string;
  description?: string;
  statusId?: string;           // Référence vers un WorkflowStatus (pour les noeuds status)
  color?: string;
  assignees?: string[];        // Utilisateurs assignés (pour les noeuds review)
  requiredApprovals?: number;  // Nombre d'approbations requises
  autoActions?: WorkflowAutoAction[]; // Actions automatiques
  conditions?: WorkflowCondition[];   // Conditions de transition (pour les noeuds decision)
  timerDuration?: number;      // Durée en heures (pour les noeuds timer)
  timerUnit?: 'hours' | 'days' | 'weeks';
}

/** Noeud dans le designer (compatible React Flow) */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: NodePosition;
  data: WorkflowNodeData;
}

/** Transition entre deux noeuds */
export interface WorkflowEdge {
  id: string;
  source: string;         // ID du noeud source
  target: string;         // ID du noeud cible
  sourceHandle?: string;  // Handle de sortie spécifique
  targetHandle?: string;  // Handle d'entrée spécifique
  label?: string;         // Label de la transition
  condition?: WorkflowCondition; // Condition optionnelle
  animated?: boolean;
}

/** Condition de transition */
export interface WorkflowCondition {
  id: string;
  field: string;          // Ex: 'status', 'approvalCount', 'fileType'
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in';
  value: string | number | string[];
  label?: string;
}

/** Action automatique exécutée par un noeud */
export interface WorkflowAutoAction {
  id: string;
  type: 'move_file' | 'copy_file' | 'notify_user' | 'send_comment' | 'update_metadata' | 'webhook';
  config: Record<string, unknown>;
  label?: string;
}

/** Définition complète d'un workflow (template réutilisable) */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  type: WorkflowType;
  projectId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  statuses: WorkflowStatus[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  metadataSchema?: MetadataFieldDefinition[];
}

/** Définition d'un champ de métadonnées personnalisé */
export interface MetadataFieldDefinition {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  required: boolean;
  options?: string[];          // Pour le type 'select'
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  [key: string]: unknown;
}

/** Type de workflow (extensible) */
export type WorkflowType =
  | 'document_validation'
  | 'document_review'
  | 'change_request'
  | 'approval'
  | 'custom';

/** Paramètres globaux d'un workflow */
export interface WorkflowSettings {
  sourceFolderId?: string;      // Dossier source (dépôt des documents)
  targetFolderId?: string;      // Dossier cible (documents validés)
  rejectedFolderId?: string;    // Dossier pour les documents rejetés
  autoStartOnUpload: boolean;   // Démarrer automatiquement quand un fichier est uploadé
  notifyOnStatusChange: boolean;
  allowResubmission: boolean;   // Autoriser la re-soumission après rejet
  maxReviewDays?: number;       // Délai max de review en jours
  parallelReview: boolean;      // Review en parallèle ou séquentiel
}

/** Instance d'un workflow en cours d'exécution */
export interface WorkflowInstance {
  id: string;
  workflowDefinitionId: string;
  projectId: string;
  documentId: string;           // Fichier Trimble Connect concerné
  documentName: string;
  currentNodeId: string;        // Noeud actuel dans le workflow
  currentStatusId: string;      // Statut actuel
  currentStepName?: string;     // Nom de l'étape actuelle
  status?: string;              // Statut global (active, completed, etc.)
  startedBy: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  deadline?: string;            // Date limite ISO pour compléter le workflow
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  history: WorkflowHistoryEntry[];
  reviews: WorkflowReview[];
}

/** Entrée dans l'historique d'une instance de workflow */
export interface WorkflowHistoryEntry {
  id: string;
  timestamp: string;
  fromNodeId: string;
  toNodeId: string;
  fromStatusId: string;
  toStatusId: string;
  userId: string;
  userName: string;
  action: string;
  comment?: string;
}

/** Review/Visa d'un utilisateur */
export interface WorkflowReview {
  id: string;
  instanceId: string;
  reviewerId: string;
  reviewerName: string;
  reviewerEmail: string;
  statusId: string;             // Statut donné par le reviewer
  decision: ReviewDecision;
  comment?: string;
  observations?: string[];
  attachments?: string[];       // IDs de fichiers joints
  reviewedAt?: string;
  requestedAt: string;
  dueDate?: string;
  isCompleted: boolean;
}

/** Décision de review */
export type ReviewDecision =
  | 'pending'
  | 'approved'
  | 'approved_with_comments'
  | 'rejected'
  | 'vao'
  | 'vao_blocking'
  | 'vso'
  | 'refused';
