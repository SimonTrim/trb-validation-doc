// ============================================================================
// HOOK: useWorkflowEngine — Expose le moteur de workflow aux composants React
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { WorkflowEngine, FolderWatcher } from '@/engine';
import type { EngineEvent } from '@/engine';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAuthStore } from '@/stores/authStore';
import type { WorkflowDefinition, ReviewDecision } from '@/models/workflow';
import type { ValidationDocument } from '@/models/document';

/**
 * Hook principal pour interagir avec le Workflow Engine.
 * Fournit des fonctions simples pour :
 * - Démarrer un workflow
 * - Soumettre un visa
 * - Écouter les événements du moteur
 */
export function useWorkflowEngine() {
  const { definitions, instances } = useWorkflowStore();
  const { documents } = useDocumentStore();
  const { currentUser, project } = useAuthStore();
  const [events, setEvents] = useState<EngineEvent[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Écouter les événements du moteur
  useEffect(() => {
    const unsubEngine = WorkflowEngine.onEvent((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 50)); // Garder les 50 derniers
    });
    const unsubWatcher = FolderWatcher.onEvent((event) => {
      if (event.type === 'error') {
        setLastError(event.data.error as string);
      }
    });
    return () => {
      unsubEngine();
      unsubWatcher();
    };
  }, []);

  // ── Démarrer un workflow pour un document ──────────────────────────────

  const startWorkflow = useCallback(
    async (documentId: string, definitionId?: string) => {
      setIsProcessing(true);
      setLastError(null);

      try {
        const document = documents.find((d) => d.id === documentId);
        if (!document) throw new Error(`Document "${documentId}" introuvable`);

        // Utiliser la définition spécifiée ou la première active
        const definition = definitionId
          ? definitions.find((d) => d.id === definitionId)
          : definitions.find((d) => d.isActive);

        if (!definition) throw new Error('Aucun workflow actif disponible');

        const instance = await WorkflowEngine.startWorkflow(definition, document);
        return instance;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setLastError(msg);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [documents, definitions]
  );

  // ── Soumettre un visa ─────────────────────────────────────────────────

  const submitVisa = useCallback(
    async (
      documentId: string,
      decision: ReviewDecision,
      comment?: string,
      observations?: string[]
    ) => {
      setIsProcessing(true);
      setLastError(null);

      try {
        // Trouver le document et son instance de workflow
        const document = documents.find((d) => d.id === documentId);
        if (!document) throw new Error(`Document "${documentId}" introuvable`);

        const instanceId = document.workflowInstanceId;
        if (!instanceId) throw new Error('Ce document n\'a pas de workflow actif');

        const instance = instances.find((i) => i.id === instanceId);
        if (!instance) throw new Error(`Instance de workflow "${instanceId}" introuvable`);

        // Construire la review
        const result = await WorkflowEngine.submitReview(instanceId, {
          reviewerId: currentUser?.id || 'current-user',
          reviewerName: `${currentUser?.firstName || 'Utilisateur'} ${currentUser?.lastName || ''}`.trim(),
          reviewerEmail: currentUser?.email || '',
          decision,
          comment,
          observations,
        });

        // Mettre à jour le reviewer dans le document
        useDocumentStore.getState().updateDocument(documentId, {
          reviewers: document.reviewers.map((r) =>
            r.userId === (currentUser?.id || 'current-user')
              ? { ...r, decision, decidedAt: new Date().toISOString() }
              : r
          ),
          comments: comment
            ? [
                ...document.comments,
                {
                  id: `comment-${Date.now()}`,
                  documentId,
                  authorId: currentUser?.id || 'current-user',
                  authorName: `${currentUser?.firstName || 'Utilisateur'} ${currentUser?.lastName || ''}`.trim(),
                  authorEmail: currentUser?.email || '',
                  content: comment,
                  createdAt: new Date().toISOString(),
                  isSystemMessage: false,
                  attachments: [],
                  reactions: [],
                },
              ]
            : document.comments,
        });

        return result;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        setLastError(msg);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [documents, instances, currentUser]
  );

  // ── Démarrer la surveillance des dossiers ─────────────────────────────

  const startFolderWatching = useCallback(() => {
    FolderWatcher.startForActiveWorkflows();
  }, []);

  const stopFolderWatching = useCallback(() => {
    FolderWatcher.stopAll();
  }, []);

  // ── Informations sur l'état courant ───────────────────────────────────

  const getDocumentWorkflowInfo = useCallback(
    (documentId: string) => {
      const document = documents.find((d) => d.id === documentId);
      if (!document?.workflowInstanceId) return null;

      const instance = instances.find((i) => i.id === document.workflowInstanceId);
      if (!instance) return null;

      const definition = definitions.find(
        (d) => d.id === instance.workflowDefinitionId
      );
      if (!definition) return null;

      const currentNode = definition.nodes.find(
        (n) => n.id === instance.currentNodeId
      );
      const currentStatus = definition.statuses.find(
        (s) => s.id === instance.currentStatusId
      );

      const isReviewNode = currentNode?.type === 'review';
      const pendingReviews = instance.reviews.filter((r) => !r.isCompleted);
      const completedReviews = instance.reviews.filter((r) => r.isCompleted);
      const isCompleted = !!instance.completedAt;

      return {
        instance,
        definition,
        currentNode,
        currentStatus,
        isReviewNode,
        pendingReviews,
        completedReviews,
        isCompleted,
        progress: calculateProgress(instance, definition),
      };
    },
    [documents, instances, definitions]
  );

  return {
    // Actions
    startWorkflow,
    submitVisa,
    startFolderWatching,
    stopFolderWatching,
    getDocumentWorkflowInfo,

    // State
    events,
    isProcessing,
    lastError,
    activeWatchers: FolderWatcher.getActiveWatchers(),
  };
}

/** Calcule la progression d'un workflow (0-100) */
function calculateProgress(
  instance: { currentNodeId: string; completedAt?: string },
  definition: WorkflowDefinition
): number {
  if (instance.completedAt) return 100;

  const totalNodes = definition.nodes.length;
  if (totalNodes === 0) return 0;

  // Trouver l'index du noeud courant dans l'ordre topologique
  const currentIndex = definition.nodes.findIndex(
    (n) => n.id === instance.currentNodeId
  );

  if (currentIndex === -1) return 0;
  return Math.round(((currentIndex + 1) / totalNodes) * 100);
}
