// ============================================================================
// WORKFLOW API SERVICE — CRUD pour les workflows et instances (backend)
// ============================================================================

import { apiRequest, withRetry } from './apiClient';
import type { WorkflowDefinition, WorkflowInstance, WorkflowReview } from '@/models/workflow';

// ─── DEFINITIONS ────────────────────────────────────────────────────────────

/** Lister les workflows d'un projet */
export async function getWorkflowDefinitions(projectId: string): Promise<WorkflowDefinition[]> {
  return withRetry(() =>
    apiRequest<WorkflowDefinition[]>(`/workflows?projectId=${projectId}`)
  );
}

/** Obtenir un workflow par ID */
export async function getWorkflowDefinition(id: string): Promise<WorkflowDefinition> {
  return withRetry(() => apiRequest<WorkflowDefinition>(`/workflows/${id}`));
}

/** Créer un workflow */
export async function createWorkflowDefinition(
  definition: WorkflowDefinition
): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>('/workflows', {
    method: 'POST',
    body: definition,
  });
}

/** Mettre à jour un workflow */
export async function updateWorkflowDefinition(
  id: string,
  updates: Partial<WorkflowDefinition>
): Promise<WorkflowDefinition> {
  return apiRequest<WorkflowDefinition>(`/workflows/${id}`, {
    method: 'PUT',
    body: updates,
  });
}

/** Supprimer un workflow */
export async function deleteWorkflowDefinition(id: string): Promise<void> {
  return apiRequest<void>(`/workflows/${id}`, { method: 'DELETE' });
}

// ─── INSTANCES ──────────────────────────────────────────────────────────────

/** Lister les instances d'un projet */
export async function getWorkflowInstances(projectId: string): Promise<WorkflowInstance[]> {
  return withRetry(() =>
    apiRequest<WorkflowInstance[]>(`/workflow-instances?projectId=${projectId}`)
  );
}

/** Obtenir une instance par ID */
export async function getWorkflowInstance(id: string): Promise<WorkflowInstance> {
  return withRetry(() => apiRequest<WorkflowInstance>(`/workflow-instances/${id}`));
}

/** Créer une instance (démarrer un workflow) */
export async function createWorkflowInstance(
  instance: WorkflowInstance
): Promise<WorkflowInstance> {
  return apiRequest<WorkflowInstance>('/workflow-instances', {
    method: 'POST',
    body: instance,
  });
}

/** Mettre à jour une instance */
export async function updateWorkflowInstance(
  id: string,
  updates: Partial<WorkflowInstance>
): Promise<WorkflowInstance> {
  return apiRequest<WorkflowInstance>(`/workflow-instances/${id}`, {
    method: 'PUT',
    body: updates,
  });
}

/** Soumettre un visa/review */
export async function submitReview(
  instanceId: string,
  review: WorkflowReview
): Promise<WorkflowInstance> {
  return apiRequest<WorkflowInstance>(`/workflow-instances/${instanceId}/reviews`, {
    method: 'POST',
    body: review,
  });
}
