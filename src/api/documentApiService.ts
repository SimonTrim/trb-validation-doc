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
