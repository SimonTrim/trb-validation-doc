// ============================================================================
// USE WORKFLOW NOTIFICATIONS — Hook pour les notifications toast
// Écoute les événements du WorkflowEngine et affiche des toasts Sonner
// ============================================================================

import { useEffect } from 'react';
import { toast } from 'sonner';
import { WorkflowEngine } from '@/engine';
import type { EngineEvent } from '@/engine/WorkflowEngine';

const DECISION_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  vso: 'VSO',
  vao: 'VAO',
  approved_with_comments: 'Commenté',
  vao_blocking: 'VAO Bloquantes',
  rejected: 'Rejeté',
  refused: 'Refusé',
};

export function useWorkflowNotifications() {
  useEffect(() => {
    const unsubscribe = WorkflowEngine.onEvent((event: EngineEvent) => {
      switch (event.type) {
        case 'started':
          toast.info('Workflow démarré', {
            description: `Instance "${event.instanceId || ''}" a démarré.`,
          });
          break;

        case 'completed':
          toast.success('Workflow terminé', {
            description: `L'instance de workflow est terminée avec succès.`,
          });
          break;

        case 'review_submitted': {
          const data = event.data as Record<string, any> | undefined;
          const decision = data?.decision;
          const label = DECISION_LABELS[decision] || decision || '';
          const isPositive = ['approved', 'vso'].includes(decision);
          const isNegative = ['rejected', 'refused', 'vao_blocking'].includes(decision);

          if (isPositive) {
            toast.success(`Visa : ${label}`, {
              description: `Le document a été validé.`,
            });
          } else if (isNegative) {
            toast.error(`Visa : ${label}`, {
              description: `Le document a été rejeté. Annotations requises.`,
            });
          } else if (decision) {
            toast.warning(`Visa : ${label}`, {
              description: `Le document a des observations.`,
            });
          }
          break;
        }

        case 'action_executed': {
          const data = event.data as Record<string, any> | undefined;
          toast.info('Action exécutée', {
            description: data?.message || 'Action automatique terminée.',
            duration: 3000,
          });
          break;
        }

        case 'advanced': {
          // Subtle — only show for significant transitions
          break;
        }

        case 'error': {
          const data = event.data as Record<string, any> | undefined;
          toast.error('Erreur workflow', {
            description: data?.message || 'Une erreur est survenue dans le moteur.',
          });
          break;
        }
      }
    });

    return unsubscribe;
  }, []);
}
