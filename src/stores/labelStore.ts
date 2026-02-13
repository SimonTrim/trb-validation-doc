// ============================================================================
// LABEL STORE — Gestion des labels (prédéfinis + personnalisés)
// Les labels custom créés par l'utilisateur persistent dans ce store
// et sont disponibles dans le LabelSelector pour tous les documents
// ============================================================================

import { create } from 'zustand';
import { DEFAULT_LABELS, type DocumentLabel } from '@/models/document';

interface LabelState {
  /** Labels personnalisés créés par l'utilisateur */
  customLabels: DocumentLabel[];

  /** Retourne la liste complète : prédéfinis + custom */
  getAllLabels: () => DocumentLabel[];

  /** Ajouter un label personnalisé */
  addCustomLabel: (label: DocumentLabel) => void;

  /** Supprimer un label personnalisé */
  removeCustomLabel: (id: string) => void;

  /** Mettre à jour un label personnalisé */
  updateCustomLabel: (id: string, updates: Partial<DocumentLabel>) => void;
}

export const useLabelStore = create<LabelState>((set, get) => ({
  customLabels: [],

  getAllLabels: () => {
    return [...DEFAULT_LABELS, ...get().customLabels];
  },

  addCustomLabel: (label) => {
    set((s) => ({
      customLabels: [...s.customLabels, label],
    }));
  },

  removeCustomLabel: (id) => {
    set((s) => ({
      customLabels: s.customLabels.filter((l) => l.id !== id),
    }));
  },

  updateCustomLabel: (id, updates) => {
    set((s) => ({
      customLabels: s.customLabels.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    }));
  },
}));
