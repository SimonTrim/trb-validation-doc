// ============================================================================
// Workspace API Adapter
// Gère la connexion à Trimble Connect via le Workspace API
// ============================================================================

import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { getRegionCode } from '@/models/trimble';

declare const TrimbleConnectWorkspace: any;

const EXTENSION_BASE_URL = import.meta.env.VITE_BACKEND_URL
  ? new URL(import.meta.env.VITE_BACKEND_URL as string).origin
  : 'https://trb-validation-doc.vercel.app';

let workspaceApi: any = null;

/** Vérifie si on est dans l'iframe Trimble Connect */
export function isInTrimbleConnect(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}

/** Initialise la connexion au Workspace API */
export async function initWorkspaceApi(): Promise<boolean> {
  const store = useAuthStore.getState();

  if (!isInTrimbleConnect()) {
    console.log('[WorkspaceAPI] Not in Trimble Connect iframe, running standalone');
    store.setConnected(false);
    return false;
  }

  try {
    store.setLoading(true);

    // Dynamically access TrimbleConnectWorkspace (loaded via script tag)
    const wsAPI = (window as any).TrimbleConnectWorkspace;
    if (!wsAPI) {
      console.warn('[WorkspaceAPI] TrimbleConnectWorkspace not available on window');
      store.setConnected(false);
      return false;
    }

    workspaceApi = await wsAPI.connect(
      window.parent,
      handleEvent,
      30000
    );

    // Get project info
    const project = await workspaceApi.project.getCurrentProject();
    store.setProject({
      id: project.id,
      name: project.name,
      location: project.location,
      rootId: project.rootId,
    });
    store.setRegion(getRegionCode(project.location));

    // Request access token
    const token = await workspaceApi.extension.requestPermission('accesstoken');
    if (token !== 'pending' && token !== 'denied') {
      store.setAccessToken(token);
      store.setConnected(true);

      // Setup menu (with try/catch to not crash if menu API is not available)
      try {
        setupMenu();
      } catch (menuErr) {
        console.warn('[WorkspaceAPI] Menu setup failed (non-blocking):', menuErr);
      }

      return true;
    } else if (token === 'denied') {
      store.setError('Permission refusée par l\'utilisateur');
      return false;
    }

    // Token is pending, will be received via event
    return true;
  } catch (error) {
    console.error('[WorkspaceAPI] Connection failed:', error);
    // Don't set error — let the app fall back to demo mode gracefully
    store.setConnected(false);
    return false;
  }
}

/** Configure le menu latéral de l'extension */
function setupMenu() {
  if (!workspaceApi?.ui?.setMenu) return;

  const iconBase = `${EXTENSION_BASE_URL}/icon_workflow_white.png`;

  workspaceApi.ui.setMenu({
    title: 'Validation',
    icon: iconBase,
    command: 'dashboard',
    subMenus: [
      { title: 'Tableau de bord', command: 'dashboard', icon: iconBase },
      { title: 'Documents', command: 'documents', icon: iconBase },
      { title: 'Visas', command: 'visa', icon: iconBase },
      { title: 'Workflows', command: 'workflow-list', icon: iconBase },
      { title: 'Historique', command: 'history', icon: iconBase },
    ],
  });
}

/** Gestionnaire d'événements Workspace API */
function handleEvent(event: string, data: any) {
  const store = useAuthStore.getState();

  switch (event) {
    case 'extension.accessToken':
      store.setAccessToken(data);
      if (!store.isConnected) {
        store.setConnected(true);
        // Setup menu once connected
        try { setupMenu(); } catch { /* ignore */ }
      }
      break;

    case 'extension.command':
      // Menu navigation from Trimble Connect — use static import (no require())
      useAppStore.getState().setCurrentView(data);
      break;

    case 'extension.userSettingsChanged':
      console.log('[WorkspaceAPI] User settings changed');
      break;

    default:
      console.log('[WorkspaceAPI] Event:', event, data);
  }
}

/** Obtient le Workspace API (ou null si non connecté) */
export function getWorkspaceApi() {
  return workspaceApi;
}
