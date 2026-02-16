// ============================================================================
// DOCUMENT API SERVICE — CRUD pour les documents en validation (backend Turso)
// ============================================================================

import { apiRequest, withRetry } from './apiClient';
import type { ValidationDocument, DocumentComment, DocumentLabel } from '@/models/document';

// ─── VALIDATION DOCUMENTS ───────────────────────────────────────────────────

/** Lister les documents en validation pour un projet */
export async function getValidationDocuments(projectId: string): Promise<ValidationDocument[]> {
  return withRetry(() =>
    apiRequest<ValidationDocument[]>(`/documents?projectId=${projectId}`)
  );
}

/** Obtenir un document par ID */
export async function getValidationDocument(id: string): Promise<ValidationDocument> {
  return withRetry(() => apiRequest<ValidationDocument>(`/documents/${id}`));
}

/** Enregistrer un nouveau document pour validation */
export async function createValidationDocument(
  doc: Partial<ValidationDocument>
): Promise<ValidationDocument> {
  return apiRequest<ValidationDocument>('/documents', {
    method: 'POST',
    body: doc,
  });
}

/** Mettre à jour un document (statut, metadata, etc.) */
export async function updateValidationDocument(
  id: string,
  updates: Partial<ValidationDocument>
): Promise<ValidationDocument> {
  return apiRequest<ValidationDocument>(`/documents/${id}`, {
    method: 'PUT',
    body: updates,
  });
}

/** Supprimer un document de la validation */
export async function deleteValidationDocument(id: string): Promise<void> {
  return apiRequest<void>(`/documents/${id}`, { method: 'DELETE' });
}

// ─── COMMENTS ───────────────────────────────────────────────────────────────

/** Lister les commentaires d'un document */
export async function getDocumentComments(documentId: string): Promise<DocumentComment[]> {
  return withRetry(() =>
    apiRequest<DocumentComment[]>(`/documents/${documentId}/comments`)
  );
}

/** Ajouter un commentaire à un document */
export async function createDocumentComment(
  documentId: string,
  comment: Partial<DocumentComment>
): Promise<DocumentComment> {
  return apiRequest<DocumentComment>(`/documents/${documentId}/comments`, {
    method: 'POST',
    body: comment,
  });
}

/** Mettre a jour un commentaire (reactions, contenu) */
export async function updateDocumentComment(
  documentId: string,
  commentId: string,
  data: { reactions?: unknown[]; content?: string }
): Promise<void> {
  return apiRequest<void>(`/documents/${documentId}/comments/${commentId}`, {
    method: 'PUT',
    body: data,
  });
}

/** Supprimer un commentaire */
export async function deleteDocumentComment(documentId: string, commentId: string): Promise<void> {
  return apiRequest<void>(`/documents/${documentId}/comments/${commentId}`, { method: 'DELETE' });
}

// ─── LABELS ─────────────────────────────────────────────────────────────────

/** Mettre à jour les labels d'un document */
export async function updateDocumentLabels(
  documentId: string,
  labels: DocumentLabel[]
): Promise<{ labels: DocumentLabel[] }> {
  return apiRequest<{ labels: DocumentLabel[] }>(`/documents/${documentId}/labels`, {
    method: 'PUT',
    body: { labels },
  });
}

// ─── CUSTOM LABELS (CATALOG) ────────────────────────────────────────────────

/** Charger les labels personnalises du projet */
export async function getCustomLabels(projectId: string): Promise<DocumentLabel[]> {
  return apiRequest<DocumentLabel[]>(`/labels?projectId=${projectId}`);
}

/** Creer un label personnalise */
export async function createCustomLabel(label: DocumentLabel & { projectId: string }): Promise<DocumentLabel> {
  return apiRequest<DocumentLabel>('/labels', { method: 'POST', body: label });
}

/** Mettre a jour un label personnalise */
export async function updateCustomLabelApi(id: string, data: Partial<DocumentLabel>): Promise<void> {
  return apiRequest<void>(`/labels/${id}`, { method: 'PUT', body: data });
}

/** Supprimer un label personnalise */
export async function deleteCustomLabel(id: string): Promise<void> {
  return apiRequest<void>(`/labels/${id}`, { method: 'DELETE' });
}

// ─── USER PREFERENCES ───────────────────────────────────────────────────────

/** Charger les preferences utilisateur */
export async function getUserPreferences(userId: string, projectId: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>(`/preferences?userId=${userId}&projectId=${projectId}`);
}

/** Sauvegarder les preferences utilisateur */
export async function setUserPreferences(userId: string, projectId: string, prefs: Record<string, unknown>): Promise<void> {
  return apiRequest<void>('/preferences', { method: 'PUT', body: { userId, projectId, ...prefs } });
}
