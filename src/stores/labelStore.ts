// ============================================================================
// LABEL STORE — Gestion des labels (prédéfinis + personnalisés)
// Labels custom persistés dans Turso via API
// ============================================================================

import { create } from 'zustand';
import { DEFAULT_LABELS, type DocumentLabel } from '@/models/document';
import {
  createCustomLabel as apiCreateLabel,
  updateCustomLabelApi as apiUpdateLabel,
  deleteCustomLabel as apiDeleteLabel,
} from '@/api/documentApiService';
import { useAuthStore } from '@/stores/authStore';

interface LabelState {
  customLabels: DocumentLabel[];

  /** Set custom labels (used by dataLoader at startup) */
  setCustomLabels: (labels: DocumentLabel[]) => void;

  getAllLabels: () => DocumentLabel[];
  addCustomLabel: (label: DocumentLabel) => void;
  removeCustomLabel: (id: string) => void;
  updateCustomLabel: (id: string, updates: Partial<DocumentLabel>) => void;
}

export const useLabelStore = create<LabelState>((set, get) => ({
  customLabels: [],

  setCustomLabels: (labels) => set({ customLabels: labels }),

  getAllLabels: () => {
    return [...DEFAULT_LABELS, ...get().customLabels];
  },

  addCustomLabel: (label) => {
    set((s) => ({ customLabels: [...s.customLabels, label] }));
    const projectId = useAuthStore.getState().project?.id || '';
    apiCreateLabel({ ...label, projectId }).catch((err) => {
      console.warn('[LabelStore] Failed to persist new label:', err);
    });
  },

  removeCustomLabel: (id) => {
    set((s) => ({ customLabels: s.customLabels.filter((l) => l.id !== id) }));
    apiDeleteLabel(id).catch((err) => {
      console.warn('[LabelStore] Failed to persist label deletion:', err);
    });
  },

  updateCustomLabel: (id, updates) => {
    set((s) => ({
      customLabels: s.customLabels.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    }));
    apiUpdateLabel(id, updates).catch((err) => {
      console.warn('[LabelStore] Failed to persist label update:', err);
    });
  },
}));
