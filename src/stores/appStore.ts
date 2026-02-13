import { create } from 'zustand';

export type AppView =
  | 'dashboard'
  | 'documents'
  | 'workflow-list'
  | 'workflow-designer'
  | 'visa'
  | 'history'
  | 'settings';

type Theme = 'light' | 'dark' | 'system';

interface AppState {
  currentView: AppView;
  sidebarCollapsed: boolean;
  notifications: AppNotification[];
  theme: Theme;

  // Actions
  setCurrentView: (view: AppView) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  addNotification: (notification: AppNotification) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  setTheme: (theme: Theme) => void;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  documentId?: string;
  workflowInstanceId?: string;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  sidebarCollapsed: false,
  notifications: [],
  theme: 'light',

  setCurrentView: (view) => {
    // Safety: TC may pass non-string values — coerce to string
    const safeView = (typeof view === 'string' ? view : 'dashboard') as AppView;
    set({ currentView: safeView });
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  addNotification: (notification) =>
    set((s) => ({ notifications: [notification, ...s.notifications] })),
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
  markAsRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  markAllAsRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),
  clearNotifications: () => set({ notifications: [] }),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
