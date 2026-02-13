// ============================================================================
// WORKFLOW ENGINE — Moteur d'exécution principal
// Gère le cycle de vie complet d'un workflow :
// démarrage → avancement → décision → actions → fin
// ============================================================================

import { evaluateDecision } from './DecisionEvaluator';
import { executeAction, getActionContext, type ActionResult } from './ActionExecutor';
import * as workflowApi from '@/api/workflowApiService';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAppStore } from '@/stores/appStore';
import { generateId } from '@/lib/utils';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowNode,
  WorkflowEdge,
  WorkflowReview,
  WorkflowHistoryEntry,
  WorkflowNodeData,
  ReviewDecision,
} from '@/models/workflow';
import type { ValidationDocument } from '@/models/document';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface EngineEvent {
  type: 'started' | 'advanced' | 'review_submitted' | 'action_executed' | 'completed' | 'error';
  instanceId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type EngineEventListener = (event: EngineEvent) => void;

// ─── ENGINE CLASS ───────────────────────────────────────────────────────────

class WorkflowEngineClass {
  private listeners: EngineEventListener[] = [];

  // ── Démarrer un workflow pour un document ──────────────────────────────

  /**
   * Démarre un nouveau workflow pour un document.
   * Crée une instance et place le document sur le premier noeud.
   */
  async startWorkflow(
    definition: WorkflowDefinition,
    document: ValidationDocument
  ): Promise<WorkflowInstance> {
    // Trouver le noeud de départ
    const startNode = definition.nodes.find((n) => n.type === 'start');
    if (!startNode) {
      throw new Error(`Aucun noeud de départ dans le workflow "${definition.name}"`);
    }

    // Trouver le statut par défaut
    const defaultStatus = definition.statuses.find((s) => s.isDefault)
      || definition.statuses[0];

    if (!defaultStatus) {
      throw new Error(`Aucun statut défini dans le workflow "${definition.name}"`);
    }

    // Créer l'instance
    const instance: WorkflowInstance = {
      id: generateId(),
      workflowDefinitionId: definition.id,
      projectId: document.projectId,
      documentId: document.id,
      documentName: document.fileName,
      currentNodeId: startNode.id,
      currentStatusId: defaultStatus.id,
      startedBy: document.uploadedBy,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      history: [
        {
          id: generateId(),
          timestamp: new Date().toISOString(),
          fromNodeId: '',
          toNodeId: startNode.id,
          fromStatusId: '',
          toStatusId: defaultStatus.id,
          userId: document.uploadedBy,
          userName: document.uploadedByName,
          action: 'Workflow démarré',
        },
      ],
      reviews: [],
    };

    // Sauvegarder l'instance
    const saved = await workflowApi.createWorkflowInstance(instance);

    // Mettre à jour les stores
    useWorkflowStore.getState().addInstance(saved);
    useDocumentStore.getState().updateDocument(document.id, {
      workflowInstanceId: saved.id,
      currentStatus: {
        id: defaultStatus.id,
        name: defaultStatus.name,
        color: defaultStatus.color,
        changedAt: new Date().toISOString(),
        changedBy: 'Système',
      },
    });

    this.emit({
      type: 'started',
      instanceId: saved.id,
      data: { documentName: document.fileName, workflowName: definition.name },
      timestamp: new Date().toISOString(),
    });

    // Avancer automatiquement depuis le noeud Start
    await this.advanceFromNode(saved, definition, startNode);

    return saved;
  }

  // ── Soumettre un visa / review ─────────────────────────────────────────

  /**
   * Soumet un visa pour un document dans un workflow.
   * Après la soumission, vérifie si le noeud actuel est terminé
   * et avance le workflow si nécessaire.
   */
  async submitReview(
    instanceId: string,
    review: {
      reviewerId: string;
      reviewerName: string;
      reviewerEmail: string;
      decision: ReviewDecision;
      comment?: string;
      observations?: string[];
    }
  ): Promise<WorkflowInstance> {
    const store = useWorkflowStore.getState();
    const instance = store.instances.find((i) => i.id === instanceId);
    if (!instance) {
      throw new Error(`Instance de workflow "${instanceId}" introuvable`);
    }

    const definition = store.definitions.find(
      (d) => d.id === instance.workflowDefinitionId
    );
    if (!definition) {
      throw new Error(`Définition de workflow introuvable`);
    }

    // Créer la review
    const workflowReview: WorkflowReview = {
      id: generateId(),
      instanceId,
      reviewerId: review.reviewerId,
      reviewerName: review.reviewerName,
      reviewerEmail: review.reviewerEmail,
      statusId: review.decision,
      decision: review.decision,
      comment: review.comment,
      observations: review.observations,
      reviewedAt: new Date().toISOString(),
      requestedAt: instance.startedAt,
      isCompleted: true,
    };

    // Enregistrer la review
    const updated = await workflowApi.submitReview(instanceId, workflowReview);

    // Mettre à jour le store
    store.updateInstance(instanceId, {
      reviews: [...instance.reviews, workflowReview],
      updatedAt: new Date().toISOString(),
    });

    // Mettre à jour le statut du document avec la décision
    const statusFromDecision = this.mapDecisionToStatus(review.decision, definition);
    if (statusFromDecision) {
      useDocumentStore.getState().updateDocument(instance.documentId, {
        currentStatus: {
          id: statusFromDecision.id,
          name: statusFromDecision.name,
          color: statusFromDecision.color,
          changedAt: new Date().toISOString(),
          changedBy: review.reviewerName,
        },
      });
    }

    this.emit({
      type: 'review_submitted',
      instanceId,
      data: {
        reviewer: review.reviewerName,
        decision: review.decision,
        documentName: instance.documentName,
      },
      timestamp: new Date().toISOString(),
    });

    // Vérifier si on peut avancer le workflow
    const currentNode = definition.nodes.find((n) => n.id === instance.currentNodeId);
    if (currentNode) {
      await this.tryAdvanceAfterReview(
        { ...instance, reviews: [...instance.reviews, workflowReview] },
        definition,
        currentNode
      );
    }

    return updated;
  }

  // ── Logique d'avancement ───────────────────────────────────────────────

  /**
   * Avance automatiquement depuis un noeud.
   * Suit les transitions sortantes et traite le noeud suivant.
   */
  private async advanceFromNode(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    currentNode: WorkflowNode
  ): Promise<void> {
    const outgoingEdges = definition.edges.filter(
      (e) => e.source === currentNode.id
    );

    if (outgoingEdges.length === 0) {
      // Noeud terminal (end) ou dead end
      if (currentNode.type === 'end') {
        await this.completeWorkflow(instance, definition, currentNode);
      }
      return;
    }

    // Pour les noeuds non-décisionnels, suivre la première (seule) transition
    if (outgoingEdges.length === 1 || currentNode.type !== 'decision') {
      const nextEdge = outgoingEdges[0];
      const nextNode = definition.nodes.find((n) => n.id === nextEdge.target);
      if (nextNode) {
        await this.moveToNode(instance, definition, currentNode, nextNode, nextEdge);
      }
      return;
    }

    // Pour les noeuds décision avec plusieurs sorties :
    // L'évaluation se fera quand les reviews seront soumises
    // (voir tryAdvanceAfterReview)
  }

  /**
   * Après une review, vérifie si le noeud review est "complet"
   * (assez de visas reçus) et avance le workflow.
   */
  private async tryAdvanceAfterReview(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    currentNode: WorkflowNode
  ): Promise<void> {
    const nodeData = currentNode.data as WorkflowNodeData;

    if (currentNode.type === 'review') {
      // Vérifier si on a assez de reviews
      const completedReviews = instance.reviews.filter((r) => r.isCompleted);
      const requiredApprovals = (nodeData.requiredApprovals as number) || 1;

      if (completedReviews.length < requiredApprovals) {
        return; // Pas encore assez de reviews
      }

      // Assez de reviews, avancer vers le prochain noeud
      const outgoingEdges = definition.edges.filter(
        (e) => e.source === currentNode.id
      );

      if (outgoingEdges.length === 0) return;

      const nextEdge = outgoingEdges[0];
      const nextNode = definition.nodes.find((n) => n.id === nextEdge.target);
      if (nextNode) {
        await this.moveToNode(instance, definition, currentNode, nextNode, nextEdge);
      }
    }
  }

  /**
   * Déplace l'instance vers un noeud cible.
   * Traite le noeud selon son type.
   */
  private async moveToNode(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    fromNode: WorkflowNode,
    toNode: WorkflowNode,
    edge: WorkflowEdge
  ): Promise<void> {
    const fromData = fromNode.data as WorkflowNodeData;
    const toData = toNode.data as WorkflowNodeData;

    // Déterminer le nouveau statut
    let newStatusId = instance.currentStatusId;
    if (toNode.type === 'status' && toData.statusId) {
      newStatusId = toData.statusId as string;
    }

    // Créer l'entrée d'historique
    const historyEntry: WorkflowHistoryEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      fromStatusId: instance.currentStatusId,
      toStatusId: newStatusId,
      userId: 'system',
      userName: 'Système',
      action: `Transition: ${fromData.label || fromNode.type} → ${toData.label || toNode.type}`,
    };

    // Mettre à jour l'instance
    const updatedInstance: Partial<WorkflowInstance> = {
      currentNodeId: toNode.id,
      currentStatusId: newStatusId,
      updatedAt: new Date().toISOString(),
      history: [...instance.history, historyEntry],
    };

    await workflowApi.updateWorkflowInstance(instance.id, updatedInstance);
    useWorkflowStore.getState().updateInstance(instance.id, updatedInstance);

    // Mettre à jour le statut du document si c'est un noeud status
    if (toNode.type === 'status' && toData.statusId) {
      const status = definition.statuses.find((s) => s.id === toData.statusId);
      if (status) {
        useDocumentStore.getState().updateDocument(instance.documentId, {
          currentStatus: {
            id: status.id,
            name: status.name,
            color: status.color,
            changedAt: new Date().toISOString(),
            changedBy: 'Système',
          },
        });
      }
    }

    this.emit({
      type: 'advanced',
      instanceId: instance.id,
      data: {
        fromNode: fromData.label,
        toNode: toData.label,
        newStatus: newStatusId,
      },
      timestamp: new Date().toISOString(),
    });

    // Traiter le nouveau noeud selon son type
    const updatedInst = {
      ...instance,
      ...updatedInstance,
      history: updatedInstance.history || instance.history,
    } as WorkflowInstance;

    await this.processNode(updatedInst, definition, toNode);
  }

  /**
   * Traite un noeud selon son type.
   */
  private async processNode(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    node: WorkflowNode
  ): Promise<void> {
    const nodeData = node.data as WorkflowNodeData;

    switch (node.type) {
      case 'start':
        // Auto-advance depuis start
        await this.advanceFromNode(instance, definition, node);
        break;

      case 'status':
        // Notifier si configuré
        if (definition.settings.notifyOnStatusChange) {
          useAppStore.getState().addNotification({
            id: generateId(),
            type: 'info',
            title: 'Changement de statut',
            message: `"${instance.documentName}" est maintenant "${nodeData.label}"`,
            timestamp: new Date().toISOString(),
            read: false,
            documentId: instance.documentId,
            workflowInstanceId: instance.id,
          });
        }
        // Le workflow attend ici — l'avancement suivant se fera manuellement
        // ou via un noeud review
        await this.advanceFromNode(instance, definition, node);
        break;

      case 'review':
        // Le workflow s'arrête ici en attendant les visas
        // Les visas arrivent via submitReview()
        break;

      case 'decision':
        // Évaluer la décision et suivre la bonne transition
        await this.processDecisionNode(instance, definition, node);
        break;

      case 'action':
        // Exécuter les actions automatiques
        await this.processActionNode(instance, definition, node);
        break;

      case 'end':
        await this.completeWorkflow(instance, definition, node);
        break;

      case 'timer':
        // TODO: Implémenter les timers (setTimeout côté backend)
        break;
    }
  }

  /**
   * Traite un noeud Décision : évalue les conditions et suit la bonne transition.
   */
  private async processDecisionNode(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    node: WorkflowNode
  ): Promise<void> {
    const outgoingEdges = definition.edges.filter((e) => e.source === node.id);
    const result = evaluateDecision(node, outgoingEdges, instance, definition.nodes);

    if (!result) {
      console.warn(`[WorkflowEngine] Aucune transition trouvée pour le noeud décision "${node.id}"`);
      return;
    }

    const targetNode = definition.nodes.find((n) => n.id === result.targetNodeId);
    const edge = definition.edges.find((e) => e.id === result.edgeId);

    if (targetNode && edge) {
      // Ajouter la raison de la décision dans l'historique
      const historyEntry: WorkflowHistoryEntry = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        fromNodeId: node.id,
        toNodeId: targetNode.id,
        fromStatusId: instance.currentStatusId,
        toStatusId: instance.currentStatusId,
        userId: 'system',
        userName: 'Système',
        action: `Décision: ${result.label || 'auto'} — ${result.reason}`,
      };

      instance.history = [...instance.history, historyEntry];

      await this.moveToNode(instance, definition, node, targetNode, edge);
    }
  }

  /**
   * Traite un noeud Action : exécute les actions automatiques puis avance.
   */
  private async processActionNode(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    node: WorkflowNode
  ): Promise<void> {
    const nodeData = node.data as WorkflowNodeData;
    const actions = (nodeData.autoActions as any[]) || [];

    // Récupérer le document
    const document = useDocumentStore.getState().documents.find(
      (d) => d.id === instance.documentId
    );

    if (!document) {
      console.error(`[WorkflowEngine] Document "${instance.documentId}" introuvable`);
      return;
    }

    // Exécuter chaque action
    const context = getActionContext(definition.settings);
    const results: ActionResult[] = [];

    for (const action of actions) {
      const result = await executeAction(action, instance, document, context);
      results.push(result);

      this.emit({
        type: 'action_executed',
        instanceId: instance.id,
        data: {
          actionType: action.type,
          success: result.success,
          message: result.message,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Avancer vers le prochain noeud
    await this.advanceFromNode(instance, definition, node);
  }

  /**
   * Termine un workflow.
   */
  private async completeWorkflow(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    endNode: WorkflowNode
  ): Promise<void> {
    const nodeData = endNode.data as WorkflowNodeData;

    const updates: Partial<WorkflowInstance> = {
      currentNodeId: endNode.id,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await workflowApi.updateWorkflowInstance(instance.id, updates);
    useWorkflowStore.getState().updateInstance(instance.id, updates);

    useAppStore.getState().addNotification({
      id: generateId(),
      type: 'success',
      title: 'Workflow terminé',
      message: `Le workflow pour "${instance.documentName}" est terminé (${nodeData.label || 'Fin'}).`,
      timestamp: new Date().toISOString(),
      read: false,
      documentId: instance.documentId,
      workflowInstanceId: instance.id,
    });

    this.emit({
      type: 'completed',
      instanceId: instance.id,
      data: {
        documentName: instance.documentName,
        finalStatus: instance.currentStatusId,
        endNode: nodeData.label,
      },
      timestamp: new Date().toISOString(),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /**
   * Mappe une décision de review vers un statut du workflow.
   */
  private mapDecisionToStatus(decision: ReviewDecision, definition: WorkflowDefinition) {
    const mapping: Record<string, string[]> = {
      approved: ['approved'],
      vso: ['vso'],
      vao: ['vao'],
      approved_with_comments: ['commented'],
      vao_blocking: ['vao_blocking'],
      rejected: ['rejected'],
      refused: ['refused'],
      pending: ['pending'],
    };

    const possibleIds = mapping[decision] || [];
    return definition.statuses.find((s) => possibleIds.includes(s.id));
  }

  // ── Event system ───────────────────────────────────────────────────────

  onEvent(listener: EngineEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: EngineEvent) {
    console.log(`[WorkflowEngine] ${event.type}:`, event.data);
    this.listeners.forEach((l) => l(event));
  }
}

// Singleton export
export const WorkflowEngine = new WorkflowEngineClass();
