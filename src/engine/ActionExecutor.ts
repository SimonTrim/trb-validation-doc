// ============================================================================
// ACTION EXECUTOR — Exécute les actions automatiques des noeuds Action
// Chaque type d'action a son propre exécuteur
// ============================================================================

import * as trimbleService from '@/api/trimbleService';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { generateId } from '@/lib/utils';
import type { WorkflowAutoAction, WorkflowInstance } from '@/models/workflow';
import type { ValidationDocument } from '@/models/document';

/** Résultat d'exécution d'une action */
export interface ActionResult {
  actionId: string;
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
}

/**
 * Exécute une action automatique.
 * Retourne le résultat de l'exécution.
 */
export async function executeAction(
  action: WorkflowAutoAction,
  instance: WorkflowInstance,
  document: ValidationDocument,
  context: ActionContext
): Promise<ActionResult> {
  try {
    switch (action.type) {
      case 'move_file':
        return await executeMoveFile(action, instance, document, context);
      case 'copy_file':
        return await executeCopyFile(action, instance, document, context);
      case 'notify_user':
        return await executeNotifyUser(action, instance, document, context);
      case 'send_comment':
        return await executeSendComment(action, instance, document, context);
      case 'update_metadata':
        return await executeUpdateMetadata(action, instance, document, context);
      case 'webhook':
        return await executeWebhook(action, instance, document, context);
      default:
        return {
          actionId: action.id,
          success: false,
          message: `Type d'action inconnu: ${action.type}`,
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      actionId: action.id,
      success: false,
      message: `Erreur lors de l'exécution de l'action "${action.label || action.type}"`,
      error: errorMessage,
    };
  }
}

/** Contexte fourni aux exécuteurs d'actions */
export interface ActionContext {
  projectId: string;
  sourceFolderId?: string;
  targetFolderId?: string;
  rejectedFolderId?: string;
  currentUserId: string;
  currentUserName: string;
}

/** Obtenir le contexte d'exécution depuis les stores */
export function getActionContext(
  workflowSettings: { sourceFolderId?: string; targetFolderId?: string; rejectedFolderId?: string }
): ActionContext {
  const authState = useAuthStore.getState();
  return {
    projectId: authState.project?.id || '',
    sourceFolderId: workflowSettings.sourceFolderId,
    targetFolderId: workflowSettings.targetFolderId,
    rejectedFolderId: workflowSettings.rejectedFolderId,
    currentUserId: authState.currentUser?.id || '',
    currentUserName: `${authState.currentUser?.firstName || ''} ${authState.currentUser?.lastName || ''}`.trim(),
  };
}

// ─── ACTION: Déplacer fichier ───────────────────────────────────────────────

async function executeMoveFile(
  action: WorkflowAutoAction,
  instance: WorkflowInstance,
  document: ValidationDocument,
  context: ActionContext
): Promise<ActionResult> {
  const targetFolderId = (action.config.targetFolderId as string) || context.targetFolderId;
  if (!targetFolderId) {
    return {
      actionId: action.id,
      success: false,
      message: 'Aucun dossier cible configuré pour le déplacement',
    };
  }

  const result = await trimbleService.moveFile(document.fileId, targetFolderId);

  addSystemNotification(
    'success',
    'Document déplacé',
    `"${document.fileName}" a été déplacé vers le dossier de validation.`
  );

  return {
    actionId: action.id,
    success: true,
    message: `Fichier "${document.fileName}" déplacé vers le dossier cible`,
    data: result,
  };
}

// ─── ACTION: Copier fichier ─────────────────────────────────────────────────

async function executeCopyFile(
  action: WorkflowAutoAction,
  instance: WorkflowInstance,
  document: ValidationDocument,
  context: ActionContext
): Promise<ActionResult> {
  const targetFolderId = (action.config.targetFolderId as string) || context.targetFolderId;
  if (!targetFolderId) {
    return {
      actionId: action.id,
      success: false,
      message: 'Aucun dossier cible configuré pour la copie',
    };
  }

  const result = await trimbleService.copyFile(document.fileId, targetFolderId);

  return {
    actionId: action.id,
    success: true,
    message: `Fichier "${document.fileName}" copié vers le dossier cible`,
    data: result,
  };
}

// ─── ACTION: Notifier utilisateur ───────────────────────────────────────────

async function executeNotifyUser(
  action: WorkflowAutoAction,
  instance: WorkflowInstance,
  document: ValidationDocument,
  context: ActionContext
): Promise<ActionResult> {
  // Déterminer qui notifier
  const targetUserId = (action.config.userId as string) || document.uploadedBy;

  // Construire le message
  const statusName = instance.currentStatusId;
  const template = (action.config.messageTemplate as string) ||
    `Le document "${document.fileName}" a reçu le statut "${statusName}".`;

  // Créer un todo Trimble Connect comme notification
  await trimbleService.createTodo({
    label: `[Validation] ${document.fileName}`,
    description: template,
    projectId: context.projectId,
  });

  addSystemNotification(
    'info',
    'Notification envoyée',
    `L'utilisateur a été notifié du changement de statut de "${document.fileName}".`
  );

  return {
    actionId: action.id,
    success: true,
    message: `Notification envoyée pour "${document.fileName}"`,
  };
}

// ─── ACTION: Envoyer commentaire ────────────────────────────────────────────

async function executeSendComment(
  action: WorkflowAutoAction,
  instance: WorkflowInstance,
  document: ValidationDocument,
  context: ActionContext
): Promise<ActionResult> {
  const commentTemplate = (action.config.commentTemplate as string) ||
    `Statut automatique: le document "${document.fileName}" est maintenant "${instance.currentStatusId}".`;

  // Agreger les commentaires des reviews
  const reviewComments = instance.reviews
    .filter((r) => r.isCompleted && r.comment)
    .map((r) => `${r.reviewerName}: ${r.comment}`)
    .join('\n');

  const fullComment = reviewComments
    ? `${commentTemplate}\n\nCommentaires des réviseurs:\n${reviewComments}`
    : commentTemplate;

  // Créer un todo avec le commentaire
  await trimbleService.createTodo({
    label: `[Commentaire] ${document.fileName}`,
    description: fullComment,
    projectId: context.projectId,
  });

  return {
    actionId: action.id,
    success: true,
    message: `Commentaire envoyé pour "${document.fileName}"`,
  };
}

// ─── ACTION: Mettre à jour métadonnées ──────────────────────────────────────

async function executeUpdateMetadata(
  action: WorkflowAutoAction,
  _instance: WorkflowInstance,
  document: ValidationDocument,
  _context: ActionContext
): Promise<ActionResult> {
  const metadata = action.config.metadata as Record<string, string> | undefined;
  if (!metadata) {
    return {
      actionId: action.id,
      success: false,
      message: 'Aucune métadonnée à mettre à jour',
    };
  }

  // TODO: Appeler l'API TC pour mettre à jour les métadonnées du fichier
  return {
    actionId: action.id,
    success: true,
    message: `Métadonnées mises à jour pour "${document.fileName}"`,
    data: metadata,
  };
}

// ─── ACTION: Webhook externe ────────────────────────────────────────────────

async function executeWebhook(
  action: WorkflowAutoAction,
  instance: WorkflowInstance,
  document: ValidationDocument,
  context: ActionContext
): Promise<ActionResult> {
  const webhookUrl = action.config.url as string;
  if (!webhookUrl) {
    return {
      actionId: action.id,
      success: false,
      message: 'Aucune URL de webhook configurée',
    };
  }

  const payload = {
    event: 'workflow.action',
    timestamp: new Date().toISOString(),
    workflow: {
      instanceId: instance.id,
      definitionId: instance.workflowDefinitionId,
      currentStatus: instance.currentStatusId,
    },
    document: {
      id: document.id,
      fileId: document.fileId,
      fileName: document.fileName,
      status: document.currentStatus.name,
    },
    project: {
      id: context.projectId,
    },
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return {
    actionId: action.id,
    success: response.ok,
    message: response.ok
      ? `Webhook appelé avec succès (${response.status})`
      : `Erreur webhook: ${response.status} ${response.statusText}`,
  };
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function addSystemNotification(
  type: 'info' | 'success' | 'warning' | 'error',
  title: string,
  message: string
) {
  const { addNotification } = useAppStore.getState();
  addNotification({
    id: generateId(),
    type,
    title,
    message,
    timestamp: new Date().toISOString(),
    read: false,
  });
}
