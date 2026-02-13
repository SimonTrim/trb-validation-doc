// ============================================================================
// TRIMBLE CONNECT SERVICE — Appels API pour fichiers, dossiers, utilisateurs
// Passe par le backend proxy pour éviter les problèmes CORS
// ============================================================================

import { apiRequest, withRetry } from './apiClient';
import { useAuthStore } from '@/stores/authStore';
import type { ConnectFile, ConnectFolder, ConnectUser } from '@/models/trimble';

// ─── FICHIERS ───────────────────────────────────────────────────────────────

/** Lister les fichiers d'un projet */
export async function getProjectFiles(projectId: string): Promise<ConnectFile[]> {
  return withRetry(() => apiRequest<ConnectFile[]>(`/projects/${projectId}/files`));
}

/** Détails d'un fichier */
export async function getFile(fileId: string): Promise<ConnectFile> {
  return withRetry(() => apiRequest<ConnectFile>(`/files/${fileId}`));
}

/** Obtenir l'URL de téléchargement d'un fichier */
export async function getFileDownloadUrl(fileId: string): Promise<{ url: string }> {
  return withRetry(() => apiRequest<{ url: string }>(`/files/${fileId}/downloadurl`));
}

/** Contenu d'un dossier */
export async function getFolderItems(folderId: string): Promise<(ConnectFile | ConnectFolder)[]> {
  return withRetry(() => apiRequest<(ConnectFile | ConnectFolder)[]>(`/folders/${folderId}/items`));
}

/** Lister les dossiers d'un projet (racine + premier niveau) */
export async function getProjectFolders(projectId: string): Promise<ConnectFolder[]> {
  // Use rootId from auth store if available (avoids extra API call)
  const { project, accessToken } = useAuthStore.getState();
  const rootId = project?.rootId;
  console.log('[trimbleService] getProjectFolders — projectId:', projectId, 'rootId:', rootId, 'hasToken:', !!accessToken);

  if (rootId) {
    // Directly list root folder contents using the existing /folders/:folderId/items route
    console.log('[trimbleService] Using rootId shortcut:', rootId);
    const items = await withRetry(() => apiRequest<any[]>(`/folders/${rootId}/items`));
    console.log('[trimbleService] Root folder items received:', items?.length, 'items');
    const folders: ConnectFolder[] = (items || [])
      .filter((item: any) => {
        const t = (item.type || '').toUpperCase();
        return t === 'FOLDER' || t === 'DIR' || (item.id && !item.size && !item.extension && item.name);
      })
      .map((f: any) => ({ id: f.id, name: f.name, parentId: f.parentId || rootId }));
    console.log('[trimbleService] Filtered to', folders.length, 'folders');
    // Prepend root folder
    return [{ id: rootId, name: project?.name || 'Racine du projet', parentId: '' }, ...folders];
  }

  // Fallback: use backend route (fetches rootId via TC API)
  console.log('[trimbleService] No rootId, using fallback /projects/${projectId}/folders');
  return withRetry(() => apiRequest<ConnectFolder[]>(`/projects/${projectId}/folders`));
}

/** Lister les sous-dossiers d'un dossier */
export async function getSubFolders(folderId: string): Promise<ConnectFolder[]> {
  const items = await withRetry(() => apiRequest<any[]>(`/folders/${folderId}/items`));
  return items
    .filter((item: any) => {
      const t = (item.type || '').toUpperCase();
      return t === 'FOLDER' || t === 'DIR' || (item.id && !item.size && !item.extension && item.name);
    })
    .map((f: any) => ({ id: f.id, name: f.name, parentId: f.parentId || folderId }));
}

/** Uploader un fichier dans un dossier TC (via le backend) */
export async function uploadFile(
  projectId: string,
  folderId: string,
  file: File
): Promise<ConnectFile> {
  // Convert file to base64 for JSON transport through the proxy
  const fileBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  return apiRequest<ConnectFile>(`/projects/${projectId}/files`, {
    method: 'POST',
    body: {
      fileName: file.name,
      folderId,
      fileBase64,
      mimeType: file.type || 'application/octet-stream',
    },
  });
}

/** Copier un fichier vers un autre dossier (via le backend) */
export async function copyFile(fileId: string, targetFolderId: string): Promise<ConnectFile> {
  return apiRequest<ConnectFile>('/files/copy', {
    method: 'POST',
    body: { fileId, targetFolderId },
  });
}

/** Déplacer un fichier vers un autre dossier (copie + suppression source) */
export async function moveFile(fileId: string, targetFolderId: string): Promise<ConnectFile> {
  return apiRequest<ConnectFile>('/files/move', {
    method: 'POST',
    body: { fileId, targetFolderId },
  });
}

// ─── UTILISATEURS ───────────────────────────────────────────────────────────

/** Lister les utilisateurs du projet */
export async function getProjectUsers(projectId: string): Promise<ConnectUser[]> {
  return withRetry(() => apiRequest<ConnectUser[]>(`/projects/${projectId}/users`));
}

// ─── TODOS / NOTIFICATIONS ──────────────────────────────────────────────────

export interface TrimbleTodo {
  id?: string;
  label: string;
  description: string;
  projectId: string;
  done?: boolean;
}

/** Créer un todo (utilisé comme notification) */
export async function createTodo(todo: TrimbleTodo): Promise<TrimbleTodo> {
  return apiRequest<TrimbleTodo>('/todos', {
    method: 'POST',
    body: todo,
  });
}

/** Lister les todos du projet */
export async function getProjectTodos(projectId: string): Promise<TrimbleTodo[]> {
  return withRetry(() => apiRequest<TrimbleTodo[]>(`/projects/${projectId}/todos`));
}

// ─── VERSIONS ──────────────────────────────────────────────────────────────

/** Obtenir les versions d'un fichier */
export async function getFileVersions(fileId: string): Promise<ConnectFile[]> {
  return withRetry(() => apiRequest<ConnectFile[]>(`/files/${fileId}/versions`));
}

// ─── BCF TOPICS ────────────────────────────────────────────────────────────

export interface BcfTopic {
  guid: string;
  title: string;
  description?: string;
  creation_date: string;
  modified_date?: string;
  creation_author: string;
  assigned_to?: string;
  topic_status: string;
  topic_type: string;
  priority?: string;
  due_date?: string;
  labels?: string[];
}

export interface BcfComment {
  guid: string;
  comment: string;
  date: string;
  author: string;
  topic_guid: string;
}

/** Lister les topics BCF d'un projet */
export async function getBcfTopics(projectId: string): Promise<BcfTopic[]> {
  return withRetry(() => apiRequest<BcfTopic[]>(`/projects/${projectId}/bcf/topics`));
}

/** Créer un topic BCF */
export async function createBcfTopic(projectId: string, topic: Partial<BcfTopic>): Promise<BcfTopic> {
  return apiRequest<BcfTopic>(`/projects/${projectId}/bcf/topics`, {
    method: 'POST',
    body: topic,
  });
}

/** Obtenir les commentaires d'un topic BCF */
export async function getBcfTopicComments(projectId: string, topicId: string): Promise<BcfComment[]> {
  return withRetry(() => apiRequest<BcfComment[]>(`/projects/${projectId}/bcf/topics/${topicId}/comments`));
}

// ─── VUES ──────────────────────────────────────────────────────────────────

export interface ConnectView {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdOn: string;
  projectId: string;
}

/** Lister les vues sauvegardées d'un projet */
export async function getProjectViews(projectId: string): Promise<ConnectView[]> {
  return withRetry(() => apiRequest<ConnectView[]>(`/projects/${projectId}/views`));
}
