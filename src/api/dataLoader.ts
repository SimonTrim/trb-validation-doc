// ============================================================================
// DATA LOADER — Chargement des données depuis Trimble Connect ou mode démo
// Orchestre le pont entre les APIs Trimble Connect et les stores internes
// ============================================================================

import { useAuthStore } from '@/stores/authStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAppStore } from '@/stores/appStore';
import { getProjectFiles, getProjectUsers, getFolderItems } from './trimbleService';
import { getWorkflowDefinitions, getWorkflowInstances } from './workflowApiService';
import type { ConnectFile, ConnectUser } from '@/models/trimble';
import type { ValidationDocument, DocumentLabel, DocumentComment } from '@/models/document';
import type { WorkflowDefinition, WorkflowInstance } from '@/models/workflow';
import { generateId } from '@/lib/utils';

// ─── Mapping ConnectFile → ValidationDocument ───────────────────────────────

/** Détecte l'extension depuis le nom de fichier */
function getExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/** Convertit un fichier TC en document de validation */
export function mapConnectFileToDocument(
  file: ConnectFile,
  projectId: string,
  users: ConnectUser[],
): ValidationDocument {
  const uploader = users.find((u) => u.id === file.uploadedBy || u.email === file.uploadedBy);

  return {
    id: `doc-${file.id}`,
    fileId: file.id,
    fileName: file.name,
    fileExtension: getExtension(file.name),
    fileSize: file.size || 0,
    filePath: file.path || '/',
    uploadedBy: file.uploadedBy || 'unknown',
    uploadedByName: uploader ? `${uploader.firstName} ${uploader.lastName}` : file.uploadedBy || 'Inconnu',
    uploadedByEmail: uploader?.email || '',
    uploadedAt: file.uploadedAt || new Date().toISOString(),
    lastModified: file.lastModified || file.uploadedAt || new Date().toISOString(),
    versionId: file.versionId,
    versionNumber: 1,
    projectId,
    currentStatus: {
      id: 'pending',
      name: 'En attente',
      color: '#6a6e79',
      changedAt: file.uploadedAt || new Date().toISOString(),
      changedBy: 'Système',
    },
    reviewers: [],
    comments: [],
    labels: [],
    versionHistory: [{
      versionNumber: 1,
      versionId: file.versionId || file.id,
      fileName: file.name,
      fileSize: file.size || 0,
      uploadedBy: file.uploadedBy || 'unknown',
      uploadedByName: uploader ? `${uploader.firstName} ${uploader.lastName}` : 'Inconnu',
      uploadedAt: file.uploadedAt || new Date().toISOString(),
    }],
    metadata: {},
  };
}

// ─── Data loading ───────────────────────────────────────────────────────────

/** Charge les données depuis le backend + Trimble Connect */
export async function loadProductionData(): Promise<{
  documents: ValidationDocument[];
  definitions: WorkflowDefinition[];
  instances: WorkflowInstance[];
}> {
  const { project } = useAuthStore.getState();
  if (!project) {
    throw new Error('No project context available');
  }

  const projectId = project.id;

  // Charger en parallèle : fichiers, utilisateurs, workflows
  const [files, users, definitions, instances] = await Promise.allSettled([
    getProjectFiles(projectId),
    getProjectUsers(projectId),
    getWorkflowDefinitions(projectId),
    getWorkflowInstances(projectId),
  ]);

  const resolvedFiles = files.status === 'fulfilled' ? files.value : [];
  const resolvedUsers = users.status === 'fulfilled' ? users.value : [];
  const resolvedDefs = definitions.status === 'fulfilled' ? definitions.value : [];
  const resolvedInstances = instances.status === 'fulfilled' ? instances.value : [];

  // Log errors without blocking
  if (files.status === 'rejected') {
    console.warn('[DataLoader] Failed to load files:', files.reason);
  }
  if (users.status === 'rejected') {
    console.warn('[DataLoader] Failed to load users:', users.reason);
  }
  if (definitions.status === 'rejected') {
    console.warn('[DataLoader] Failed to load workflow definitions:', definitions.reason);
  }

  // Mapper les fichiers TC en documents de validation
  const documents = resolvedFiles.map((f) => mapConnectFileToDocument(f, projectId, resolvedUsers));

  // Enrichir les documents avec les données des instances de workflow
  for (const inst of resolvedInstances) {
    const doc = documents.find((d) => d.fileId === inst.documentId || d.id === inst.documentId);
    if (doc) {
      doc.workflowInstanceId = inst.id;
      if (inst.currentStatusId) {
        const statusDef = resolvedDefs
          .flatMap((d) => d.statuses)
          .find((s) => s.id === inst.currentStatusId);
        if (statusDef) {
          doc.currentStatus = {
            id: statusDef.id,
            name: statusDef.name,
            color: statusDef.color,
            changedAt: inst.updatedAt,
            changedBy: 'Système',
          };
        }
      }
    }
  }

  return { documents, definitions: resolvedDefs, instances: resolvedInstances };
}

/** Charge les fichiers d'un dossier spécifique (pour le FolderWatcher) */
export async function loadFolderFiles(folderId: string): Promise<ConnectFile[]> {
  try {
    const items = await getFolderItems(folderId);
    // Filtrer uniquement les fichiers (pas les sous-dossiers)
    return items.filter((item): item is ConnectFile => 'extension' in item || 'size' in item);
  } catch (error) {
    console.error('[DataLoader] Failed to load folder:', folderId, error);
    return [];
  }
}

/** Initialise les stores avec les données chargées */
export async function initializeStores(mode: 'production' | 'demo'): Promise<void> {
  const docStore = useDocumentStore.getState();
  const wfStore = useWorkflowStore.getState();
  const appStore = useAppStore.getState();

  if (mode === 'production') {
    try {
      const { documents, definitions, instances } = await loadProductionData();
      docStore.setDocuments(documents);
      wfStore.setDefinitions(definitions);
      wfStore.setInstances(instances);

      appStore.addNotification({
        id: generateId(),
        type: 'success',
        title: 'Données chargées',
        message: `${documents.length} documents et ${definitions.length} workflows chargés depuis Trimble Connect.`,
        timestamp: new Date().toISOString(),
        read: false,
      });
    } catch (error) {
      console.error('[DataLoader] Production data load failed:', error);
      appStore.addNotification({
        id: generateId(),
        type: 'error',
        title: 'Erreur de chargement',
        message: 'Impossible de charger les données depuis le serveur. Mode démo activé.',
        timestamp: new Date().toISOString(),
        read: false,
      });
      // Fallback to demo
      throw error;
    }
  }
  // 'demo' mode: data loaded by App.tsx directly
}
