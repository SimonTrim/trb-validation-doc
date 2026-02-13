// ============================================================================
// FOLDER WATCHER — Surveille un dossier source Trimble Connect
// Détecte les nouveaux fichiers et démarre automatiquement les workflows
// ============================================================================

import * as trimbleService from '@/api/trimbleService';
import { WorkflowEngine } from './WorkflowEngine';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { generateId } from '@/lib/utils';
import type { WorkflowDefinition } from '@/models/workflow';
import type { ValidationDocument } from '@/models/document';
import type { ConnectFile } from '@/models/trimble';

// ─── TYPES ──────────────────────────────────────────────────────────────────

interface WatcherConfig {
  /** Intervalle de polling en ms (défaut: 30s) */
  pollInterval: number;
  /** Dossier source à surveiller */
  folderId: string;
  /** Workflow à démarrer automatiquement */
  workflowDefinitionId: string;
  /** Filtre par extension de fichier (optionnel) */
  fileExtensions?: string[];
}

type WatcherEventListener = (event: WatcherEvent) => void;

interface WatcherEvent {
  type: 'new_file' | 'workflow_started' | 'error' | 'poll';
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── FOLDER WATCHER CLASS ───────────────────────────────────────────────────

class FolderWatcherClass {
  private watchers: Map<string, WatcherState> = new Map();
  private listeners: WatcherEventListener[] = [];

  /**
   * Démarre la surveillance d'un dossier.
   * Retourne un ID de watcher pour pouvoir l'arrêter plus tard.
   */
  start(config: WatcherConfig): string {
    const watcherId = generateId();

    const state: WatcherState = {
      id: watcherId,
      config,
      knownFileIds: new Set<string>(),
      isRunning: true,
      intervalId: null,
      lastPollAt: null,
      errorCount: 0,
    };

    this.watchers.set(watcherId, state);

    // Premier scan pour remplir les fichiers connus (sans démarrer de workflows)
    this.initialScan(state).then(() => {
      // Puis démarrer le polling
      state.intervalId = window.setInterval(
        () => this.poll(state),
        config.pollInterval
      );
    });

    console.log(`[FolderWatcher] Started watcher ${watcherId} on folder ${config.folderId}`);
    return watcherId;
  }

  /** Arrête un watcher */
  stop(watcherId: string): void {
    const state = this.watchers.get(watcherId);
    if (!state) return;

    state.isRunning = false;
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }

    this.watchers.delete(watcherId);
    console.log(`[FolderWatcher] Stopped watcher ${watcherId}`);
  }

  /** Arrête tous les watchers */
  stopAll(): void {
    for (const [id] of this.watchers) {
      this.stop(id);
    }
  }

  /** Liste les watchers actifs */
  getActiveWatchers(): { id: string; folderId: string; lastPoll: string | null }[] {
    return Array.from(this.watchers.values()).map((w) => ({
      id: w.id,
      folderId: w.config.folderId,
      lastPoll: w.lastPollAt,
    }));
  }

  /**
   * Configure et démarre les watchers pour tous les workflows actifs du projet.
   */
  startForActiveWorkflows(): void {
    const { definitions } = useWorkflowStore.getState();
    const activeWorkflows = definitions.filter(
      (d) => d.isActive && d.settings.autoStartOnUpload && d.settings.sourceFolderId
    );

    for (const workflow of activeWorkflows) {
      this.start({
        pollInterval: 30000, // 30 secondes
        folderId: workflow.settings.sourceFolderId!,
        workflowDefinitionId: workflow.id,
      });
    }

    if (activeWorkflows.length > 0) {
      console.log(`[FolderWatcher] Started ${activeWorkflows.length} watcher(s) for active workflows`);
    }
  }

  // ── Scan initial ──────────────────────────────────────────────────────

  /**
   * Scan initial pour identifier les fichiers déjà présents.
   * Ne démarre PAS de workflows pour ces fichiers.
   */
  private async initialScan(state: WatcherState): Promise<void> {
    try {
      const items = await trimbleService.getFolderItems(state.config.folderId);
      const files = items.filter((item): item is any => 'extension' in item);

      for (const file of files) {
        state.knownFileIds.add(file.id);
      }

      console.log(`[FolderWatcher] Initial scan: ${files.length} file(s) found in folder`);
    } catch (error) {
      console.error('[FolderWatcher] Initial scan failed:', error);
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────

  /**
   * Un cycle de polling : vérifie le dossier pour de nouveaux fichiers.
   */
  private async poll(state: WatcherState): Promise<void> {
    if (!state.isRunning) return;

    try {
      const items = await trimbleService.getFolderItems(state.config.folderId);
      const files = items.filter((item): item is any => 'extension' in item);

      // Filtrer par extension si configuré
      const filteredFiles = state.config.fileExtensions
        ? files.filter((f: any) =>
            state.config.fileExtensions!.includes(f.extension?.toLowerCase())
          )
        : files;

      // Détecter les nouveaux fichiers
      const newFiles = filteredFiles.filter(
        (f: any) => !state.knownFileIds.has(f.id)
      );

      state.lastPollAt = new Date().toISOString();
      state.errorCount = 0;

      this.emit({
        type: 'poll',
        data: {
          watcherId: state.id,
          totalFiles: files.length,
          newFiles: newFiles.length,
        },
        timestamp: state.lastPollAt,
      });

      // Traiter les nouveaux fichiers
      for (const file of newFiles) {
        state.knownFileIds.add(file.id);
        await this.handleNewFile(file as ConnectFile, state);
      }
    } catch (error) {
      state.errorCount++;
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.emit({
        type: 'error',
        data: { watcherId: state.id, error: errorMsg, errorCount: state.errorCount },
        timestamp: new Date().toISOString(),
      });

      // Arrêter après 10 erreurs consécutives
      if (state.errorCount >= 10) {
        console.error(`[FolderWatcher] Too many errors, stopping watcher ${state.id}`);
        this.stop(state.id);
      }
    }
  }

  // ── Traitement d'un nouveau fichier ───────────────────────────────────

  /**
   * Traite un nouveau fichier détecté dans le dossier source.
   * Crée un document de validation et démarre le workflow.
   */
  private async handleNewFile(file: ConnectFile, state: WatcherState): Promise<void> {
    const authState = useAuthStore.getState();
    const projectId = authState.project?.id || '';

    this.emit({
      type: 'new_file',
      data: { fileName: file.name, fileId: file.id },
      timestamp: new Date().toISOString(),
    });

    // Créer un ValidationDocument à partir du fichier TC
    const document: ValidationDocument = {
      id: generateId(),
      fileId: file.id,
      fileName: file.name,
      fileExtension: file.extension || '',
      fileSize: file.size || 0,
      filePath: file.path || '',
      uploadedBy: file.uploadedBy || '',
      uploadedByName: file.uploadedBy || 'Utilisateur',
      uploadedByEmail: '',
      uploadedAt: file.uploadedAt || new Date().toISOString(),
      lastModified: file.lastModified || new Date().toISOString(),
      versionNumber: 1,
      projectId,
      currentStatus: {
        id: 'pending',
        name: 'En attente',
        color: '#6a6e79',
        changedAt: new Date().toISOString(),
        changedBy: 'Système',
      },
      reviewers: [],
      labels: [],
      versionHistory: [{
        versionNumber: 1,
        versionId: file.id || `v-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size || 0,
        uploadedBy: file.uploadedBy || 'system',
        uploadedByName: file.uploadedBy || 'Système',
        uploadedAt: new Date().toISOString(),
      }],
      comments: [
        {
          id: generateId(),
          documentId: '',
          authorId: 'system',
          authorName: 'Système',
          authorEmail: '',
          content: `Document détecté dans le dossier source et ajouté au workflow de validation.`,
          createdAt: new Date().toISOString(),
          isSystemMessage: true,
          attachments: [],
          reactions: [],
        },
      ],
      metadata: {},
    };

    // Ajouter au store
    useDocumentStore.getState().addDocument(document);

    // Notifier
    useAppStore.getState().addNotification({
      id: generateId(),
      type: 'info',
      title: 'Nouveau document',
      message: `"${file.name}" a été détecté et ajouté à la validation.`,
      timestamp: new Date().toISOString(),
      read: false,
      documentId: document.id,
    });

    // Démarrer le workflow
    const definition = useWorkflowStore.getState().definitions.find(
      (d) => d.id === state.config.workflowDefinitionId
    );

    if (definition) {
      try {
        await WorkflowEngine.startWorkflow(definition, document);

        this.emit({
          type: 'workflow_started',
          data: {
            fileName: file.name,
            workflowName: definition.name,
            documentId: document.id,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`[FolderWatcher] Failed to start workflow for "${file.name}":`, error);
      }
    }
  }

  // ── Events ────────────────────────────────────────────────────────────

  onEvent(listener: WatcherEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: WatcherEvent) {
    this.listeners.forEach((l) => l(event));
  }
}

/** State interne d'un watcher */
interface WatcherState {
  id: string;
  config: WatcherConfig;
  knownFileIds: Set<string>;
  isRunning: boolean;
  intervalId: number | null;
  lastPollAt: string | null;
  errorCount: number;
}

// Singleton export
export const FolderWatcher = new FolderWatcherClass();
