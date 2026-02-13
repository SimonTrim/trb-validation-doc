// ============================================================================
// Workspace API Adapter
// Gère la connexion à Trimble Connect via le Workspace API
// ============================================================================

import { useAuthStore } from '@/stores/authStore';
import { getRegionCode } from '@/models/trimble';

declare const TrimbleConnectWorkspace: any;

let workspaceApi: any = null;

/** Vérifie si on est dans l'iframe Trimble Connect */
export function isInTrimbleConnect(): boolean {
  try {
    return window.parent !== window && typeof TrimbleConnectWorkspace !== 'undefined';
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

    workspaceApi = await TrimbleConnectWorkspace.connect(
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

      // Setup menu
      setupMenu();

      return true;
    } else if (token === 'denied') {
      store.setError('Permission refusée par l\'utilisateur');
      return false;
    }

    // Token is pending, will be received via event
    return true;
  } catch (error) {
    console.error('[WorkspaceAPI] Connection failed:', error);
    store.setError('Impossible de se connecter au Workspace API');
    return false;
  }
}

/** Configure le menu latéral de l'extension */
function setupMenu() {
  if (!workspaceApi) return;

  workspaceApi.ui.setMenu({
    title: 'Validation Documentaire',
    icon: 'https://your-domain.com/icons/icon-48.png',
    command: 'dashboard',
    subMenus: [
      { title: 'Tableau de bord', command: 'dashboard', icon: '' },
      { title: 'Documents', command: 'documents', icon: '' },
      { title: 'Visas', command: 'visa', icon: '' },
      { title: 'Workflows', command: 'workflow-list', icon: '' },
      { title: 'Historique', command: 'history', icon: '' },
      { title: 'Paramètres', command: 'settings', icon: '' },
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
      }
      break;

    case 'extension.command':
      // Menu navigation from Trimble Connect
      const { useAppStore } = require('@/stores/appStore');
      const appStore = useAppStore.getState();
      appStore.setCurrentView(data);
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
