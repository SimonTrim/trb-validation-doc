// ============================================================================
// DOCUMENT — Types pour les fichiers Trimble Connect en validation
// ============================================================================

/** Label / étiquette pour catégoriser un document */
export interface DocumentLabel {
  id: string;
  name: string;
  color: string;      // Couleur de la bordure et du texte
  description?: string;
}

/** Labels prédéfinis (similaires aux labels Trimble Connect) */
export const DEFAULT_LABELS: DocumentLabel[] = [
  { id: 'archi', name: 'Architecture', color: '#2563eb' },
  { id: 'structure', name: 'Structure', color: '#dc2626' },
  { id: 'cvc', name: 'CVC', color: '#16a34a' },
  { id: 'elec', name: 'Électricité', color: '#ca8a04' },
  { id: 'plomb', name: 'Plomberie', color: '#0891b2' },
  { id: 'synthese', name: 'Synthèse', color: '#9333ea' },
  { id: 'geotechnique', name: 'Géotechnique', color: '#c2410c' },
  { id: 'securite', name: 'Sécurité', color: '#be123c' },
  { id: 'environnement', name: 'Environnement', color: '#15803d' },
  { id: 'cctp', name: 'CCTP', color: '#4f46e5' },
  { id: 'plan', name: 'Plan', color: '#0369a1' },
  { id: 'rapport', name: 'Rapport', color: '#7c3aed' },
  { id: 'maquette', name: 'Maquette 3D', color: '#e11d48' },
  { id: 'urgent', name: 'Urgent', color: '#dc2626', description: 'Document prioritaire' },
];

/** Entrée dans l'historique de versions d'un document */
export interface DocumentVersion {
  versionNumber: number;
  versionId: string;
  fileName: string;
  fileSize: number;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  comment?: string;              // Commentaire de re-soumission
  statusAtSubmission?: string;   // Statut au moment de la soumission
  workflowInstanceId?: string;   // Instance workflow associée à cette version
}

/** Document en cours de validation */
export interface ValidationDocument {
  id: string;
  fileId: string;                // ID fichier Trimble Connect
  fileName: string;
  fileExtension: string;
  fileSize: number;
  filePath: string;              // Chemin dans Trimble Connect
  uploadedBy: string;
  uploadedByName: string;
  uploadedByEmail: string;
  uploadedAt: string;
  lastModified: string;
  versionId?: string;
  versionNumber: number;
  projectId: string;
  workflowInstanceId?: string;   // Instance de workflow associée
  currentStatus: DocumentStatus;
  reviewers: DocumentReviewer[];
  comments: DocumentComment[];
  labels: DocumentLabel[];       // Labels / étiquettes
  versionHistory: DocumentVersion[]; // Historique des versions
  metadata: Record<string, string>;
}

/** Statut courant d'un document */
export interface DocumentStatus {
  id: string;
  name: string;
  color: string;
  changedAt: string;
  changedBy: string;
}

/** Reviewer assigné à un document */
export interface DocumentReviewer {
  userId: string;
  userName: string;
  userEmail: string;
  role: 'reviewer' | 'approver' | 'validator';
  decision?: string;
  decidedAt?: string;
  isRequired: boolean;
}

/** Pièce jointe à un commentaire */
export interface CommentAttachment {
  id: string;
  type: 'file' | 'image' | 'url';
  name: string;
  url: string;                  // URL locale (blob) ou externe
  mimeType?: string;
  size?: number;                // En octets
  thumbnailUrl?: string;        // Pour les images
}

/** Réaction emoji à un commentaire */
export interface CommentReaction {
  emoji: string;                // Ex: "👍", "❤️", "🎉"
  users: { userId: string; userName: string }[];
}

/** Commentaire sur un document */
export interface DocumentComment {
  id: string;
  documentId: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  parentId?: string;            // Pour les réponses
  isSystemMessage: boolean;     // Message automatique du workflow
  attachments: CommentAttachment[];
  reactions: CommentReaction[];
}

/** Filtres pour la liste de documents */
export interface DocumentFilters {
  search?: string;
  statusIds?: string[];
  reviewerIds?: string[];
  labelIds?: string[];
  uploadedBy?: string;
  dateFrom?: string;
  dateTo?: string;
  fileTypes?: string[];
  workflowId?: string;
}

/** Statistiques de documents */
export interface DocumentStats {
  total: number;
  byStatus: { statusId: string; statusName: string; color: string; count: number }[];
  avgReviewTime: number;        // En heures
  overdueCount: number;
  completedThisWeek: number;
  completedThisMonth: number;
}
