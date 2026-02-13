import { create } from 'zustand';
import type { ValidationDocument, DocumentFilters, DocumentStats } from '@/models/document';

interface DocumentState {
  documents: ValidationDocument[];
  selectedDocument: ValidationDocument | null;
  filters: DocumentFilters;
  stats: DocumentStats | null;
  isLoading: boolean;
  isDetailOpen: boolean;
  error: string | null;
  favoriteIds: string[];

  // Actions
  setDocuments: (docs: ValidationDocument[]) => void;
  addDocument: (doc: ValidationDocument) => void;
  updateDocument: (id: string, updates: Partial<ValidationDocument>) => void;
  removeDocument: (id: string) => void;
  removeDocuments: (ids: string[]) => void;
  bulkUpdateDocuments: (ids: string[], updates: Partial<ValidationDocument>) => void;
  setSelectedDocument: (doc: ValidationDocument | null) => void;
  setFilters: (filters: Partial<DocumentFilters>) => void;
  resetFilters: () => void;
  setStats: (stats: DocumentStats) => void;
  setLoading: (loading: boolean) => void;
  setDetailOpen: (open: boolean) => void;
  setError: (error: string | null) => void;
  toggleFavorite: (docId: string) => void;
  isFavorite: (docId: string) => boolean;
}

const defaultFilters: DocumentFilters = {
  search: '',
  statusIds: [],
  reviewerIds: [],
  fileTypes: [],
};

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  selectedDocument: null,
  filters: defaultFilters,
  stats: null,
  isLoading: false,
  isDetailOpen: false,
  error: null,
  favoriteIds: [],

  setDocuments: (docs) => set({ documents: docs }),
  addDocument: (doc) => set((s) => ({ documents: [doc, ...s.documents] })),
  updateDocument: (id, updates) =>
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      selectedDocument:
        s.selectedDocument?.id === id
          ? { ...s.selectedDocument, ...updates } as ValidationDocument
          : s.selectedDocument,
    })),
  removeDocument: (id) =>
    set((s) => ({
      documents: s.documents.filter((d) => d.id !== id),
      selectedDocument: s.selectedDocument?.id === id ? null : s.selectedDocument,
    })),
  removeDocuments: (ids) =>
    set((s) => ({
      documents: s.documents.filter((d) => !ids.includes(d.id)),
      selectedDocument: s.selectedDocument && ids.includes(s.selectedDocument.id) ? null : s.selectedDocument,
    })),
  bulkUpdateDocuments: (ids, updates) =>
    set((s) => ({
      documents: s.documents.map((d) => ids.includes(d.id) ? { ...d, ...updates } : d),
      selectedDocument:
        s.selectedDocument && ids.includes(s.selectedDocument.id)
          ? { ...s.selectedDocument, ...updates } as ValidationDocument
          : s.selectedDocument,
    })),
  setSelectedDocument: (doc) => set({ selectedDocument: doc, isDetailOpen: doc !== null }),
  setFilters: (filters) =>
    set((s) => ({ filters: { ...s.filters, ...filters } })),
  resetFilters: () => set({ filters: defaultFilters }),
  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ isLoading: loading }),
  setDetailOpen: (open) =>
    set({ isDetailOpen: open, selectedDocument: open ? undefined : null } as any),
  setError: (error) => set({ error }),
  toggleFavorite: (docId) =>
    set((s) => ({
      favoriteIds: s.favoriteIds.includes(docId)
        ? s.favoriteIds.filter((id) => id !== docId)
        : [...s.favoriteIds, docId],
    })),
  isFavorite: (docId) => get().favoriteIds.includes(docId),
}));
