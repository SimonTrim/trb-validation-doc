// ============================================================================
// DATA LOADER — Chargement des données depuis Trimble Connect ou mode démo
// Orchestre le pont entre les APIs Trimble Connect et les stores internes
// ============================================================================

import { useAuthStore } from '@/stores/authStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAppStore } from '@/stores/appStore';
import { useLabelStore } from '@/stores/labelStore';
import { getProjectUsers, getFolderItems } from './trimbleService';
import { getWorkflowDefinitions, getWorkflowInstances } from './workflowApiService';
import { getValidationDocuments, getCustomLabels } from './documentApiService';
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
  const uploaderId = file.uploadedBy || '';
  const uploader = users.find(
    (u) => u.id === uploaderId || u.email?.toLowerCase() === uploaderId.toLowerCase()
  );

  const fileName = file.name || 'Sans nom';
  const now = new Date().toISOString();
  const uploadedAt = file.uploadedAt || now;

  return {
    id: `doc-${file.id}`,
    fileId: file.id,
    fileName,
    fileExtension: getExtension(fileName),
    fileSize: file.size || 0,
    filePath: file.path || '/',
    uploadedBy: uploaderId || 'unknown',
    uploadedByName: uploader ? `${uploader.firstName || ''} ${uploader.lastName || ''}`.trim() : uploaderId || 'Inconnu',
    uploadedByEmail: uploader?.email || '',
    uploadedAt,
    lastModified: file.lastModified || uploadedAt,
    versionId: file.versionId,
    versionNumber: 1,
    projectId,
    currentStatus: {
      id: 'pending',
      name: 'En attente',
      color: '#6a6e79',
      changedAt: uploadedAt,
      changedBy: 'Système',
    },
    reviewers: [],
    comments: [],
    labels: [],
    versionHistory: [{
      versionNumber: 1,
      versionId: file.versionId || file.id,
      fileName,
      fileSize: file.size || 0,
      uploadedBy: uploaderId || 'unknown',
      uploadedByName: uploader ? `${uploader.firstName || ''} ${uploader.lastName || ''}`.trim() : 'Inconnu',
      uploadedAt,
    }],
    metadata: {},
  };
}

// ─── Data loading ───────────────────────────────────────────────────────────

/** Charge les données depuis le backend Turso + Trimble Connect */
export async function loadProductionData(): Promise<{
  documents: ValidationDocument[];
  definitions: WorkflowDefinition[];
  instances: WorkflowInstance[];
  users: ConnectUser[];
}> {
  const { project } = useAuthStore.getState();
  if (!project) {
    throw new Error('No project context available');
  }

  const projectId = project.id;

  // Charger en parallèle : documents validation (Turso), utilisateurs (TC), workflows (Turso)
  const [docs, users, definitions, instances] = await Promise.allSettled([
    getValidationDocuments(projectId),
    getProjectUsers(projectId),
    getWorkflowDefinitions(projectId),
    getWorkflowInstances(projectId),
  ]);

  const resolvedDocs = docs.status === 'fulfilled' ? docs.value : [];
  const resolvedUsers = users.status === 'fulfilled' ? users.value : [];
  const resolvedDefs = definitions.status === 'fulfilled' ? definitions.value : [];
  const resolvedInstances = instances.status === 'fulfilled' ? instances.value : [];

  // Log errors without blocking
  if (docs.status === 'rejected') {
    console.warn('[DataLoader] Failed to load validation documents:', docs.reason);
  }
  if (users.status === 'rejected') {
    console.warn('[DataLoader] Failed to load users:', users.reason);
  }
  if (definitions.status === 'rejected') {
    console.warn('[DataLoader] Failed to load workflow definitions:', definitions.reason);
  }

  // Normaliser les documents depuis Turso (ajout des champs manquants)
  const documents: ValidationDocument[] = resolvedDocs.map((doc) => ({
    ...doc,
    // Restore reviewers from metadata if saved there by the workflow engine
    reviewers: doc.reviewers?.length
      ? doc.reviewers
      : (() => {
          const raw = (doc.metadata as any)?.reviewers;
          if (!raw) return [];
          if (Array.isArray(raw)) return raw;
          if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
          return [];
        })(),
    comments: doc.comments || [],
    labels: doc.labels || [],
    versionHistory: doc.versionHistory || [{
      versionNumber: doc.versionNumber || 1,
      versionId: doc.versionId || doc.fileId,
      fileName: doc.fileName,
      fileSize: doc.fileSize || 0,
      uploadedBy: doc.uploadedBy || 'unknown',
      uploadedByName: doc.uploadedByName || 'Inconnu',
      uploadedAt: doc.uploadedAt,
    }],
    metadata: doc.metadata || {},
  }));

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

  return { documents, definitions: resolvedDefs, instances: resolvedInstances, users: resolvedUsers };
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

/** Tente d'identifier l'utilisateur courant parmi les utilisateurs du projet */
async function detectCurrentUser(users: ConnectUser[]): Promise<void> {
  const authStore = useAuthStore.getState();
  if (authStore.currentUser) {
    console.log('[DataLoader] Current user already set:', authStore.currentUser.email);
    return;
  }

  // Try to get user info from the access token (JWT payload)
  try {
    const token = authStore.accessToken;
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('[DataLoader] JWT payload claims:', Object.keys(payload).join(', '));

      // Try multiple claim names for email (Trimble tokens may vary)
      const email = payload.email
        || payload.preferred_username
        || payload.unique_name
        || payload.upn
        || '';

      // Also try sub as a fallback if it looks like an email
      const sub = payload.sub || '';
      const effectiveEmail = email || (sub.includes('@') ? sub : '');

      console.log('[DataLoader] JWT email:', effectiveEmail, 'sub:', sub);

      if (effectiveEmail) {
        const match = users.find(
          (u) => u.email.toLowerCase() === effectiveEmail.toLowerCase()
        );
        if (match) {
          authStore.setCurrentUser(match);
          console.log('[DataLoader] Current user detected from JWT match:', match.email, 'id:', match.id);
          return;
        }
        // User found in token but not in project users — create a basic entry
        authStore.setCurrentUser({
          id: sub || effectiveEmail,
          email: effectiveEmail,
          firstName: payload.given_name || payload.firstName || effectiveEmail.split('@')[0],
          lastName: payload.family_name || payload.lastName || '',
          role: 'USER',
        });
        console.log('[DataLoader] Current user from token (no project match):', effectiveEmail);
        return;
      }

      // If sub is a UUID, try to match it against user IDs
      if (sub && !sub.includes('@')) {
        const matchById = users.find((u) => u.id === sub);
        if (matchById) {
          authStore.setCurrentUser(matchById);
          console.log('[DataLoader] Current user matched by sub ID:', matchById.email);
          return;
        }
      }
    }
  } catch (err) {
    console.warn('[DataLoader] Token parsing failed:', err);
  }

  // Fallback: first admin user, or first user
  const admin = users.find((u) => u.role === 'ADMIN');
  if (admin) {
    authStore.setCurrentUser(admin);
    console.log('[DataLoader] Current user fallback (admin):', admin.email);
  } else if (users.length > 0) {
    authStore.setCurrentUser(users[0]);
    console.log('[DataLoader] Current user fallback (first):', users[0].email);
  }
}

/** Initialise les stores avec les données chargées */
export async function initializeStores(mode: 'production' | 'demo'): Promise<void> {
  const docStore = useDocumentStore.getState();
  const wfStore = useWorkflowStore.getState();
  const appStore = useAppStore.getState();

  if (mode === 'production') {
    try {
      const { documents, definitions, instances, users } = await loadProductionData();
      docStore.setDocuments(documents);
      wfStore.setDefinitions(definitions);
      wfStore.setInstances(instances);

      // Load custom labels
      const projectId = useAuthStore.getState().project?.id;
      if (projectId) {
        try {
          const customLabels = await getCustomLabels(projectId);
          useLabelStore.getState().setCustomLabels(customLabels);
        } catch (err) {
          console.warn('[DataLoader] Failed to load custom labels:', err);
        }
      }

      // Detect and set the current user
      await detectCurrentUser(users);

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
