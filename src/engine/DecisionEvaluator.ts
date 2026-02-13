// ============================================================================
// DECISION EVALUATOR — Évalue les conditions aux noeuds Décision
// Détermine quelle transition suivre en fonction des reviews reçues
// ============================================================================

import type {
  WorkflowNode,
  WorkflowEdge,
  WorkflowInstance,
  WorkflowCondition,
  WorkflowReview,
  ReviewDecision,
} from '@/models/workflow';

/** Résultat de l'évaluation d'une décision */
export interface DecisionResult {
  /** ID de l'edge à suivre */
  edgeId: string;
  /** ID du noeud cible */
  targetNodeId: string;
  /** Label de la transition (ex: "Approuvé") */
  label?: string;
  /** Raison de la décision */
  reason: string;
}

/** Groupes de décisions pour le routage */
const APPROVAL_DECISIONS: ReviewDecision[] = ['approved', 'vso'];
const COMMENT_DECISIONS: ReviewDecision[] = ['approved_with_comments', 'vao'];
const REJECTION_DECISIONS: ReviewDecision[] = ['rejected', 'refused', 'vao_blocking'];

/**
 * Évalue un noeud Décision et retourne la transition à suivre.
 *
 * Logique par défaut (si pas de conditions explicites sur les edges) :
 * 1. Si toutes les reviews requises sont "approved" ou "vso" → transition "Approuvé"
 * 2. Si au moins un "rejected" / "refused" / "vao_blocking" → transition "Rejeté"
 * 3. Si au moins un "commented" / "vao" sans rejet → transition "Commenté"
 * 4. Sinon → première transition disponible (fallback)
 */
export function evaluateDecision(
  decisionNode: WorkflowNode,
  outgoingEdges: WorkflowEdge[],
  instance: WorkflowInstance,
  allNodes: WorkflowNode[]
): DecisionResult | null {
  if (outgoingEdges.length === 0) {
    return null; // Dead end
  }

  const reviews = instance.reviews.filter((r) => r.isCompleted);

  // Vérifier si des edges ont des conditions explicites
  const edgesWithConditions = outgoingEdges.filter((e) => e.condition);
  if (edgesWithConditions.length > 0) {
    return evaluateWithExplicitConditions(edgesWithConditions, outgoingEdges, reviews, allNodes);
  }

  // Logique par défaut basée sur les labels des edges
  return evaluateByEdgeLabels(outgoingEdges, reviews, allNodes);
}

/** Évalue avec des conditions explicites sur les edges */
function evaluateWithExplicitConditions(
  edgesWithConditions: WorkflowEdge[],
  allEdges: WorkflowEdge[],
  reviews: WorkflowReview[],
  allNodes: WorkflowNode[]
): DecisionResult | null {
  for (const edge of edgesWithConditions) {
    if (edge.condition && evaluateCondition(edge.condition, reviews)) {
      return {
        edgeId: edge.id,
        targetNodeId: edge.target,
        label: edge.label,
        reason: `Condition "${edge.condition.label || edge.condition.field}" satisfaite`,
      };
    }
  }

  // Fallback: premier edge sans condition
  const fallbackEdge = allEdges.find((e) => !e.condition);
  if (fallbackEdge) {
    return {
      edgeId: fallbackEdge.id,
      targetNodeId: fallbackEdge.target,
      label: fallbackEdge.label,
      reason: 'Aucune condition satisfaite, fallback',
    };
  }

  return null;
}

/** Évalue par labels des transitions (approuvé/commenté/rejeté) */
function evaluateByEdgeLabels(
  edges: WorkflowEdge[],
  reviews: WorkflowReview[],
  allNodes: WorkflowNode[]
): DecisionResult | null {
  if (reviews.length === 0) {
    // Pas encore de reviews, ne pas avancer
    return null;
  }

  const decisions = reviews.map((r) => r.decision);

  // Calculer le résultat agrégé
  const hasRejection = decisions.some((d) => REJECTION_DECISIONS.includes(d));
  const hasComment = decisions.some((d) => COMMENT_DECISIONS.includes(d));
  const allApproved = decisions.every((d) => APPROVAL_DECISIONS.includes(d));

  // Chercher l'edge correspondant par label ou par noeud cible
  let targetEdge: WorkflowEdge | undefined;
  let reason: string;

  if (hasRejection) {
    targetEdge = findEdgeByIntent(edges, allNodes, 'rejected');
    reason = `Rejeté: ${decisions.filter((d) => REJECTION_DECISIONS.includes(d)).join(', ')}`;
  } else if (allApproved) {
    targetEdge = findEdgeByIntent(edges, allNodes, 'approved');
    reason = 'Toutes les reviews sont approuvées';
  } else if (hasComment) {
    targetEdge = findEdgeByIntent(edges, allNodes, 'commented');
    reason = `Commenté: ${decisions.filter((d) => COMMENT_DECISIONS.includes(d)).join(', ')}`;
  } else {
    // Fallback: premier edge
    targetEdge = edges[0];
    reason = 'Résultat par défaut';
  }

  if (!targetEdge) {
    targetEdge = edges[0]; // Ultimate fallback
    reason = 'Aucune transition correspondante trouvée, fallback';
  }

  return {
    edgeId: targetEdge.id,
    targetNodeId: targetEdge.target,
    label: targetEdge.label,
    reason,
  };
}

/**
 * Trouve un edge par "intention" en regardant :
 * 1. Le label de l'edge (ex: "Approuvé", "Rejeté")
 * 2. Le statusId du noeud cible
 * 3. Le nom du noeud cible
 */
function findEdgeByIntent(
  edges: WorkflowEdge[],
  allNodes: WorkflowNode[],
  intent: 'approved' | 'commented' | 'rejected'
): WorkflowEdge | undefined {
  const labelPatterns: Record<string, RegExp> = {
    approved: /approu|valid|accept|vso|visa\s*sans/i,
    commented: /comment|observ|vao(?!\s*bloq)|revoir/i,
    rejected: /rejet|refus|bloq|denied/i,
  };

  const statusPatterns: Record<string, string[]> = {
    approved: ['approved', 'vso'],
    commented: ['commented', 'vao'],
    rejected: ['rejected', 'refused', 'vao_blocking'],
  };

  const pattern = labelPatterns[intent];
  const statuses = statusPatterns[intent];

  // 1. Chercher par label de l'edge
  const byLabel = edges.find((e) => e.label && pattern.test(e.label));
  if (byLabel) return byLabel;

  // 2. Chercher par statusId du noeud cible
  const byStatus = edges.find((e) => {
    const targetNode = allNodes.find((n) => n.id === e.target);
    return targetNode?.data.statusId && statuses.includes(targetNode.data.statusId as string);
  });
  if (byStatus) return byStatus;

  // 3. Chercher par nom du noeud cible
  const byName = edges.find((e) => {
    const targetNode = allNodes.find((n) => n.id === e.target);
    return targetNode?.data.label && pattern.test(targetNode.data.label as string);
  });
  if (byName) return byName;

  return undefined;
}

/** Évalue une condition individuelle */
function evaluateCondition(
  condition: WorkflowCondition,
  reviews: WorkflowReview[]
): boolean {
  const { field, operator, value } = condition;

  let fieldValue: unknown;

  switch (field) {
    case 'approvalCount':
      fieldValue = reviews.filter((r) =>
        APPROVAL_DECISIONS.includes(r.decision)
      ).length;
      break;
    case 'rejectionCount':
      fieldValue = reviews.filter((r) =>
        REJECTION_DECISIONS.includes(r.decision)
      ).length;
      break;
    case 'reviewCount':
      fieldValue = reviews.length;
      break;
    case 'lastDecision':
      fieldValue = reviews[reviews.length - 1]?.decision;
      break;
    case 'hasObservations':
      fieldValue = reviews.some((r) =>
        r.observations && r.observations.length > 0
      );
      break;
    default:
      fieldValue = undefined;
  }

  switch (operator) {
    case 'equals':
      return fieldValue === value;
    case 'not_equals':
      return fieldValue !== value;
    case 'greater_than':
      return typeof fieldValue === 'number' && fieldValue > (value as number);
    case 'less_than':
      return typeof fieldValue === 'number' && fieldValue < (value as number);
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(value as string);
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue as string);
    default:
      return false;
  }
}
