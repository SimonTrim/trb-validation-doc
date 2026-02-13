// ============================================================================
// KEYBOARD SHORTCUTS — Navigation rapide entre les vues
// ============================================================================

import { useEffect, useCallback } from 'react';
import { useAppStore, type AppView } from '@/stores/appStore';

/** Définition d'un raccourci clavier */
interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

/** Liste des raccourcis avec leurs descriptions (pour affichage dans l'aide) */
export const KEYBOARD_SHORTCUTS: {
  key: string;
  label: string;
  description: string;
  modifier?: string;
}[] = [
  { key: 'D', label: 'Alt+D', description: 'Tableau de bord', modifier: 'Alt' },
  { key: 'F', label: 'Alt+F', description: 'Documents', modifier: 'Alt' },
  { key: 'W', label: 'Alt+W', description: 'Workflows', modifier: 'Alt' },
  { key: 'V', label: 'Alt+V', description: 'Visas', modifier: 'Alt' },
  { key: 'H', label: 'Alt+H', description: 'Historique', modifier: 'Alt' },
  { key: 'S', label: 'Alt+S', description: 'Paramètres', modifier: 'Alt' },
  { key: '?', label: 'Alt+?', description: 'Aide raccourcis', modifier: 'Alt' },
];

export function useKeyboardShortcuts() {
  const { setCurrentView, currentView } = useAppStore();

  const navigateTo = useCallback(
    (view: AppView) => {
      // Don't navigate if we're in the workflow designer (might lose unsaved work)
      if (currentView === 'workflow-designer') return;
      setCurrentView(view);
    },
    [setCurrentView, currentView]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only respond to Alt+Key shortcuts
      if (!e.altKey) return;
      // Ignore if focus is in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();

      switch (key) {
        case 'd':
          e.preventDefault();
          navigateTo('dashboard');
          break;
        case 'f':
          e.preventDefault();
          navigateTo('documents');
          break;
        case 'w':
          e.preventDefault();
          navigateTo('workflow-list');
          break;
        case 'v':
          e.preventDefault();
          navigateTo('visa');
          break;
        case 'h':
          e.preventDefault();
          navigateTo('history');
          break;
        case 's':
          e.preventDefault();
          navigateTo('settings');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateTo]);
}
