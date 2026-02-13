// ============================================================================
// WORKFLOW SETTINGS PANEL — Configuration des paramètres d'un workflow
// Dossiers source/cible, auto-start, notifications, etc.
// ============================================================================

import React, { useState, useEffect } from 'react';
import {
  FolderOpen, FolderInput, FolderOutput, Play, Square,
  Bell, RefreshCw, Clock, Users, Eye, FolderTree, ChevronRight,
  Check, Search, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAuthStore } from '@/stores/authStore';
import { FolderWatcher } from '@/engine';
import { getProjectFolders, getSubFolders } from '@/api/trimbleService';
import * as workflowApi from '@/api/workflowApiService';
import { toast } from 'sonner';
import type { WorkflowSettings } from '@/models/workflow';
import type { ConnectFolder } from '@/models/trimble';

interface WorkflowSettingsPanelProps {
  definitionId: string;
}

export function WorkflowSettingsPanel({ definitionId }: WorkflowSettingsPanelProps) {
  const { definitions, updateDefinition } = useWorkflowStore();
  const definition = definitions.find((d) => d.id === definitionId);
  const [isWatching, setIsWatching] = useState(false);
  const [watcherId, setWatcherId] = useState<string | null>(null);
  const [folders, setFolders] = useState<ConnectFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [scanningFolder, setScanningFolder] = useState(false);

  // Load real TC folders on mount, retry when auth becomes available
  useEffect(() => {
    loadFolders();
    // Also listen for auth state changes to retry
    const unsub = useAuthStore.subscribe((state, prevState) => {
      if (state.accessToken && !prevState.accessToken) {
        console.log('[WorkflowSettings] Token became available, loading folders...');
        loadFolders();
      }
    });
    return () => unsub();
  }, []);

  const loadFolders = async () => {
    const { project, accessToken, isConnected } = useAuthStore.getState();
    console.log('[WorkflowSettings] loadFolders called — project:', project?.id, 'rootId:', project?.rootId, 'token:', accessToken ? `${accessToken.length} chars` : 'null', 'connected:', isConnected);

    if (!project?.id) {
      setFolderError('Projet non détecté. Rechargez l\'extension dans Trimble Connect.');
      return;
    }
    if (!accessToken) {
      setFolderError('Token d\'accès non disponible. L\'extension tente de se reconnecter...');
      // Try to refresh the token
      try {
        const { refreshAccessToken } = await import('@/api/workspaceApi');
        const newToken = await refreshAccessToken();
        if (!newToken) {
          setFolderError('Impossible d\'obtenir un token. Rechargez la page Trimble Connect.');
          return;
        }
      } catch {
        setFolderError('Impossible d\'obtenir un token. Rechargez la page Trimble Connect.');
        return;
      }
    }

    setLoadingFolders(true);
    setFolderError(null);
    try {
      const data = await getProjectFolders(project.id);
      console.log('[WorkflowSettings] Folders loaded:', data.length, 'folders');
      setFolders(data);
      if (data.length === 0) {
        setFolderError('Le projet ne contient aucun dossier, ou l\'API a retourné une liste vide.');
      }
    } catch (err: any) {
      const msg = err?.body || err?.message || String(err);
      console.error('[WorkflowSettings] Failed to load folders:', msg, err);
      setFolderError(`Erreur: ${msg}`);
    } finally {
      setLoadingFolders(false);
    }
  };

  if (!definition) {
    return <div className="p-4 text-muted-foreground">Workflow introuvable</div>;
  }

  const settings = definition.settings;

  const updateSettings = (updates: Partial<WorkflowSettings>) => {
    const newSettings = { ...settings, ...updates };
    updateDefinition(definitionId, { settings: newSettings });

    // Persist to backend (non-blocking)
    if (definition) {
      const fullDef = {
        ...definition,
        settings: newSettings,
        projectId: definition.projectId || useAuthStore.getState().project?.id || '',
        createdBy: definition.createdBy || useAuthStore.getState().currentUser?.id || '',
      };
      workflowApi.updateWorkflowDefinition(definitionId, fullDef).catch((err) => {
        console.warn('[WorkflowSettings] Failed to persist settings:', err);
      });
    }
  };

  const handleToggleWatcher = () => {
    if (isWatching && watcherId) {
      FolderWatcher.stop(watcherId);
      setWatcherId(null);
      setIsWatching(false);
      toast.info('Surveillance arrêtée');
    } else if (settings.sourceFolderId) {
      const id = FolderWatcher.start({
        pollInterval: 30000,
        folderId: settings.sourceFolderId,
        workflowDefinitionId: definitionId,
      });
      setWatcherId(id);
      setIsWatching(true);
      toast.success('Surveillance démarrée', {
        description: 'Le dossier source est maintenant surveillé.',
      });
    }
  };

  const getFolderName = (folderId?: string) => {
    if (!folderId) return null;
    const folder = folders.find((f) => f.id === folderId);
    if (folder) return folder.name;
    // If folder not found in loaded list, show truncated ID
    return folderId.length > 20 ? `...${folderId.slice(-12)}` : folderId;
  };

  const handleLoadSubfolders = async (parentId: string) => {
    try {
      const subs = await getSubFolders(parentId);
      // Merge new folders, avoiding duplicates
      setFolders((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const newFolders = subs.filter((f) => !existingIds.has(f.id));
        return [...prev, ...newFolders];
      });
    } catch (err) {
      console.warn('[WorkflowSettings] Failed to load subfolders:', err);
    }
  };

  /** Scan the source folder for existing files and import them as validation documents */
  const handleScanSourceFolder = async () => {
    if (!settings.sourceFolderId) return;
    setScanningFolder(true);
    try {
      const { getFolderItems } = await import('@/api/trimbleService');
      const { createValidationDocument } = await import('@/api/documentApiService');
      const { useDocumentStore } = await import('@/stores/documentStore');
      const { generateId } = await import('@/lib/utils');

      const items = await getFolderItems(settings.sourceFolderId);
      // Filter to files only (items with size or extension)
      const files = items.filter((item: any) => item.size || item.extension || item.fileSize);
      const existingDocs = useDocumentStore.getState().documents;
      const existingFileIds = new Set(existingDocs.map((d) => d.fileId));

      let imported = 0;
      for (const file of files) {
        if (existingFileIds.has(file.id)) continue; // Skip already imported

        const authState = useAuthStore.getState();
        const doc = {
          id: generateId(),
          fileId: file.id,
          fileName: file.name,
          fileExtension: (file as any).extension || '',
          fileSize: (file as any).size || 0,
          filePath: (file as any).path || '',
          uploadedBy: (file as any).uploadedBy || authState.currentUser?.id || '',
          uploadedByName: (file as any).uploadedBy || authState.currentUser?.firstName || 'Utilisateur',
          uploadedByEmail: authState.currentUser?.email || '',
          uploadedAt: (file as any).uploadedAt || new Date().toISOString(),
          lastModified: (file as any).lastModified || new Date().toISOString(),
          versionNumber: 1,
          projectId: authState.project?.id || '',
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
            versionId: file.id,
            fileName: file.name,
            fileSize: (file as any).size || 0,
            uploadedBy: authState.currentUser?.id || 'system',
            uploadedByName: authState.currentUser?.firstName || 'Système',
            uploadedAt: new Date().toISOString(),
          }],
          comments: [],
          metadata: {},
        };

        useDocumentStore.getState().addDocument(doc as any);
        createValidationDocument(doc as any).catch((err) => {
          console.warn('[WorkflowSettings] Failed to persist scanned doc:', err);
        });
        imported++;
      }

      if (imported > 0) {
        toast.success(`${imported} document(s) importé(s)`, {
          description: 'Les fichiers du dossier source ont été ajoutés à la validation.',
        });
      } else if (files.length === 0) {
        toast.info('Aucun fichier trouvé dans le dossier source');
      } else {
        toast.info('Tous les fichiers sont déjà importés');
      }
    } catch (err: any) {
      console.error('[WorkflowSettings] Scan failed:', err);
      toast.error('Erreur lors du scan', { description: err?.message || String(err) });
    } finally {
      setScanningFolder(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <CardTitle className="text-lg">Paramètres du workflow</CardTitle>
      <CardDescription>
        Configurez les dossiers et le comportement automatique de « {definition.name} »
      </CardDescription>

      <Separator />

      {/* Dossiers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FolderTree className="h-4 w-4" />
            Dossiers du projet
          </CardTitle>
          <CardDescription className="text-xs">
            Sélectionnez les dossiers Trimble Connect pour ce workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FolderSelector
            icon={<FolderInput className="h-4 w-4 text-blue-600" />}
            label="Dossier source (dépôt)"
            description="Les documents déposés ici déclencheront le workflow"
            value={settings.sourceFolderId}
            displayValue={getFolderName(settings.sourceFolderId)}
            onChange={(id) => updateSettings({ sourceFolderId: id })}
            color="blue"
            folders={folders}
            loading={loadingFolders}
            error={folderError}
            onExpandFolder={handleLoadSubfolders}
            onOpen={loadFolders}
            onRetry={loadFolders}
          />

          <FolderSelector
            icon={<FolderOutput className="h-4 w-4 text-green-600" />}
            label="Dossier cible (validés)"
            description="Les documents approuvés seront déplacés ici"
            value={settings.targetFolderId}
            displayValue={getFolderName(settings.targetFolderId)}
            onChange={(id) => updateSettings({ targetFolderId: id })}
            color="green"
            folders={folders}
            loading={loadingFolders}
            error={folderError}
            onExpandFolder={handleLoadSubfolders}
            onOpen={loadFolders}
            onRetry={loadFolders}
          />

          <FolderSelector
            icon={<FolderOpen className="h-4 w-4 text-red-600" />}
            label="Dossier rejetés (optionnel)"
            description="Les documents rejetés seront déplacés ici"
            value={settings.rejectedFolderId}
            displayValue={getFolderName(settings.rejectedFolderId)}
            onChange={(id) => updateSettings({ rejectedFolderId: id })}
            color="red"
            folders={folders}
            loading={loadingFolders}
            error={folderError}
            onExpandFolder={handleLoadSubfolders}
            onOpen={loadFolders}
            onRetry={loadFolders}
          />
        </CardContent>
      </Card>

      {/* Automatisations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4" />
            Automatisations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            icon={<Play className="h-3.5 w-3.5 text-green-600" />}
            label="Démarrage auto à l'upload"
            description="Démarre le workflow quand un fichier est déposé dans le dossier source"
            enabled={settings.autoStartOnUpload}
            onToggle={(v) => updateSettings({ autoStartOnUpload: v })}
          />
          <ToggleRow
            icon={<Bell className="h-3.5 w-3.5 text-amber-600" />}
            label="Notifications de statut"
            description="Notifier les utilisateurs à chaque changement de statut"
            enabled={settings.notifyOnStatusChange}
            onToggle={(v) => updateSettings({ notifyOnStatusChange: v })}
          />
          <ToggleRow
            icon={<RefreshCw className="h-3.5 w-3.5 text-blue-600" />}
            label="Re-soumission après rejet"
            description="Autoriser le déposant à re-soumettre un document rejeté"
            enabled={settings.allowResubmission}
            onToggle={(v) => updateSettings({ allowResubmission: v })}
          />
          <ToggleRow
            icon={<Users className="h-3.5 w-3.5 text-purple-600" />}
            label="Review en parallèle"
            description="Tous les reviewers visent en même temps (vs séquentiel)"
            enabled={settings.parallelReview}
            onToggle={(v) => updateSettings({ parallelReview: v })}
          />

          <Separator />

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" />
              Délai max de review (jours)
            </label>
            <Input
              type="number"
              min={1}
              value={settings.maxReviewDays || ''}
              onChange={(e) => updateSettings({ maxReviewDays: parseInt(e.target.value) || undefined })}
              placeholder="Aucune limite"
              className="w-32 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Surveillance dossier */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4" />
            Surveillance du dossier
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Folder Watcher</p>
              <p className="text-xs text-muted-foreground">
                Surveille le dossier source et démarre les workflows automatiquement
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isWatching ? 'default' : 'secondary'}>
                {isWatching ? 'Actif' : 'Inactif'}
              </Badge>
              <Button
                size="sm"
                variant={isWatching ? 'destructive' : 'default'}
                onClick={handleToggleWatcher}
                disabled={!settings.sourceFolderId}
              >
                {isWatching ? (
                  <>
                    <Square className="mr-1.5 h-3 w-3" /> Arrêter
                  </>
                ) : (
                  <>
                    <Play className="mr-1.5 h-3 w-3" /> Démarrer
                  </>
                )}
              </Button>
            </div>
          </div>

          {!settings.sourceFolderId && (
            <p className="text-xs text-destructive">
              Configurez d'abord un dossier source pour activer la surveillance.
            </p>
          )}

          {settings.sourceFolderId && (
            <Separator />
          )}

          {settings.sourceFolderId && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Scanner le dossier source</p>
                <p className="text-xs text-muted-foreground">
                  Importe les fichiers déjà présents dans le dossier source comme documents à valider
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleScanSourceFolder()}
                disabled={scanningFolder}
              >
                {scanningFolder ? (
                  <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Scan...</>
                ) : (
                  <><Search className="mr-1.5 h-3 w-3" /> Scanner</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── FOLDER SELECTOR ─────────────────────────────────────────────────────────

function FolderSelector({
  icon,
  label,
  description,
  value,
  displayValue,
  onChange,
  color,
  folders,
  loading,
  error,
  onExpandFolder,
  onOpen,
  onRetry,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value?: string;
  displayValue?: string | null;
  onChange: (id: string) => void;
  color: string;
  folders: ConnectFolder[];
  loading?: boolean;
  error?: string | null;
  onExpandFolder?: (folderId: string) => void;
  onOpen?: () => void;
  onRetry?: () => void;
}) {
  const [search, setSearch] = useState('');

  const filteredFolders = search
    ? folders.filter((f) =>
        f.name.toLowerCase().includes(search.toLowerCase())
      )
    : folders;

  const colorClasses: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20',
    green: 'border-green-200 bg-green-50/50 dark:bg-green-950/20',
    red: 'border-red-200 bg-red-50/50 dark:bg-red-950/20',
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color] || ''}`}>
      <div className="flex items-start gap-2 mb-2">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">{label}</p>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>

      <Popover onOpenChange={(open) => { if (open) onOpen?.(); }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 h-8 text-xs bg-background"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            {displayValue ? (
              <span className="truncate">{displayValue}</span>
            ) : (
              <span className="text-muted-foreground">Sélectionner un dossier...</span>
            )}
            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
          <ScrollArea className="h-[200px]">
            <div className="p-1">
              {loading && (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Chargement des dossiers...
                </div>
              )}
              {!loading && error && (
                <div className="py-3 px-2 text-center text-xs space-y-2">
                  <p className="text-destructive font-medium">Connexion échouée</p>
                  <p className="text-[10px] text-muted-foreground break-words">{error}</p>
                  {onRetry && (
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={onRetry}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Réessayer
                    </Button>
                  )}
                </div>
              )}
              {!loading && !error && filteredFolders.length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground space-y-2">
                  <p>Aucun dossier trouvé</p>
                  <p className="text-[10px]">
                    Le projet semble vide. Créez des dossiers dans Trimble Connect puis réessayez.
                  </p>
                  {onRetry && (
                    <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={onRetry}>
                      <RefreshCw className="mr-1 h-3 w-3" /> Recharger
                    </Button>
                  )}
                </div>
              )}
              {filteredFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    onChange(folder.id);
                    setSearch('');
                    // Load subfolders when selecting
                    onExpandFolder?.(folder.id);
                  }}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-muted ${
                    value === folder.id ? 'bg-primary/10 font-medium' : ''
                  }`}
                >
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-left truncate">{folder.name}</span>
                  {value === folder.id && (
                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
          {/* Manual ID input fallback */}
          <div className="border-t p-2">
            <Input
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Ou saisir un ID de dossier..."
              className="h-7 text-[10px]"
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── TOGGLE ROW (with Switch) ────────────────────────────────────────────────

function ToggleRow({
  icon,
  label,
  description,
  enabled,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {icon} {label}
        </p>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}
