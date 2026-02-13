// ============================================================================
// DASHBOARD LAYOUT — Configurable widget order with drag-and-drop
// ============================================================================

import { create } from 'zustand';

export interface DashboardWidget {
  id: string;
  label: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: DashboardWidget[] = [
  { id: 'kpi', label: 'Indicateurs clés', visible: true },
  { id: 'status-chart', label: 'Répartition par statut', visible: true },
  { id: 'calendar-stats', label: 'Calendrier & Statistiques', visible: true },
  { id: 'deadlines', label: 'Prochaines échéances', visible: true },
  { id: 'activity', label: 'Activité récente', visible: true },
];

interface DashboardLayoutState {
  widgets: DashboardWidget[];
  isCustomizing: boolean;
  dragIndex: number | null;
  dragOverIndex: number | null;

  setCustomizing: (v: boolean) => void;
  toggleWidget: (id: string) => void;
  setDragIndex: (i: number | null) => void;
  setDragOverIndex: (i: number | null) => void;
  reorder: (fromIdx: number, toIdx: number) => void;
  resetLayout: () => void;
}

export const useDashboardLayout = create<DashboardLayoutState>((set) => ({
  widgets: DEFAULT_WIDGETS,
  isCustomizing: false,
  dragIndex: null,
  dragOverIndex: null,

  setCustomizing: (v) => set({ isCustomizing: v }),

  toggleWidget: (id) =>
    set((s) => ({
      widgets: s.widgets.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w)),
    })),

  setDragIndex: (i) => set({ dragIndex: i }),
  setDragOverIndex: (i) => set({ dragOverIndex: i }),

  reorder: (fromIdx, toIdx) =>
    set((s) => {
      const arr = [...s.widgets];
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return { widgets: arr, dragIndex: null, dragOverIndex: null };
    }),

  resetLayout: () => set({ widgets: DEFAULT_WIDGETS }),
}));
