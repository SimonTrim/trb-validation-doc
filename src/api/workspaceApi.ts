// ============================================================================
// Workspace API Adapter
// Gère la connexion à Trimble Connect via le Workspace API
// ============================================================================

import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { getRegionCode } from '@/models/trimble';

declare const TrimbleConnectWorkspace: any;

/** Base URL de l'extension — déduit du VITE_BACKEND_URL ou fallback */
const EXTENSION_BASE_URL = (() => {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL as string;
    if (backendUrl && backendUrl.startsWith('http')) {
      return new URL(backendUrl).origin;
    }
  } catch { /* ignore parse error */ }
  return 'https://trb-validation-doc.vercel.app';
})();

let workspaceApi: any = null;

/** Vérifie si on est dans l'iframe Trimble Connect */
export function isInTrimbleConnect(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}

/** Helper: timeout wrapper pour éviter de bloquer l'app */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`[WorkspaceAPI] Timeout: ${label} (${ms}ms)`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
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

    // Connect with a hard 15s timeout (SDK has its own 30s timeout, we short-circuit earlier)
    workspaceApi = await withTimeout(
      wsAPI.connect(window.parent, handleEvent, 30000),
      15000,
      'connect',
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

  const icon = (name: string) => `${EXTENSION_BASE_URL}/${name}`;

  workspaceApi.ui.setMenu({
    title: 'Validation',
    icon: icon('icon_workflow_white.png'),
    command: 'dashboard',
    subMenus: [
      { title: 'Tableau de bord', command: 'dashboard', icon: icon('icon_tableau_bord_white.png') },
      { title: 'Documents', command: 'documents', icon: icon('icon_documents_white.png') },
      { title: 'Visas', command: 'visa', icon: icon('icon_visas_white.png') },
      { title: 'Workflows', command: 'workflow-list', icon: icon('icon_validation_white.png') },
      { title: 'Historique', command: 'history', icon: icon('icon_historique_white.png') },
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

    case 'extension.command': {
      // TC sends command as object {data: "command"} or string "command"
      const command = typeof data === 'string' ? data : data?.data || data?.command || 'dashboard';
      console.log('[WorkspaceAPI] Command received:', data, '→ resolved:', command);
      useAppStore.getState().setCurrentView(command);
      break;
    }

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
