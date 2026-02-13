// ============================================================================
// WORKFLOW SETTINGS PANEL — Configuration des paramètres d'un workflow
// Dossiers source/cible, auto-start, notifications, etc.
// ============================================================================

import React, { useState } from 'react';
import {
  FolderOpen, FolderInput, FolderOutput, Play, Square,
  Bell, RefreshCw, Clock, Users, Eye, FolderTree, ChevronRight,
  Check, Search,
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
import { FolderWatcher } from '@/engine';
import { toast } from 'sonner';
import type { WorkflowSettings } from '@/models/workflow';

/** Simulated project folders (in production, fetched from Trimble Connect API) */
const DEMO_FOLDERS = [
  { id: 'folder-root', name: 'Racine du projet', parentId: null, icon: '📁' },
  { id: 'folder-source', name: '01 - Documents à valider', parentId: 'folder-root', icon: '📂' },
  { id: 'folder-validated', name: '02 - Documents validés', parentId: 'folder-root', icon: '📂' },
  { id: 'folder-rejected', name: '03 - Documents rejetés', parentId: 'folder-root', icon: '📂' },
  { id: 'folder-archi', name: 'Architecture', parentId: 'folder-source', icon: '📐' },
  { id: 'folder-struct', name: 'Structure', parentId: 'folder-source', icon: '🏗️' },
  { id: 'folder-cvc', name: 'CVC', parentId: 'folder-source', icon: '❄️' },
  { id: 'folder-elec', name: 'Électricité', parentId: 'folder-source', icon: '⚡' },
  { id: 'folder-maquettes', name: 'Maquettes BIM', parentId: 'folder-root', icon: '📦' },
  { id: 'folder-plans', name: 'Plans 2D', parentId: 'folder-root', icon: '📋' },
  { id: 'folder-admin', name: 'Administratif', parentId: 'folder-root', icon: '📎' },
  { id: 'folder-photos', name: 'Photos chantier', parentId: 'folder-root', icon: '📷' },
];

interface WorkflowSettingsPanelProps {
  definitionId: string;
}

export function WorkflowSettingsPanel({ definitionId }: WorkflowSettingsPanelProps) {
  const { definitions, updateDefinition } = useWorkflowStore();
  const definition = definitions.find((d) => d.id === definitionId);
  const [isWatching, setIsWatching] = useState(false);
  const [watcherId, setWatcherId] = useState<string | null>(null);

  if (!definition) {
    return <div className="p-4 text-muted-foreground">Workflow introuvable</div>;
  }

  const settings = definition.settings;

  const updateSettings = (updates: Partial<WorkflowSettings>) => {
    updateDefinition(definitionId, {
      settings: { ...settings, ...updates },
    });
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
    const folder = DEMO_FOLDERS.find((f) => f.id === folderId);
    return folder ? `${folder.icon} ${folder.name}` : folderId;
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
          />

          <FolderSelector
            icon={<FolderOutput className="h-4 w-4 text-green-600" />}
            label="Dossier cible (validés)"
            description="Les documents approuvés seront déplacés ici"
            value={settings.targetFolderId}
            displayValue={getFolderName(settings.targetFolderId)}
            onChange={(id) => updateSettings({ targetFolderId: id })}
            color="green"
          />

          <FolderSelector
            icon={<FolderOpen className="h-4 w-4 text-red-600" />}
            label="Dossier rejetés (optionnel)"
            description="Les documents rejetés seront déplacés ici"
            value={settings.rejectedFolderId}
            displayValue={getFolderName(settings.rejectedFolderId)}
            onChange={(id) => updateSettings({ rejectedFolderId: id })}
            color="red"
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
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  value?: string;
  displayValue?: string | null;
  onChange: (id: string) => void;
  color: string;
}) {
  const [search, setSearch] = useState('');

  const filteredFolders = search
    ? DEMO_FOLDERS.filter((f) =>
        f.name.toLowerCase().includes(search.toLowerCase())
      )
    : DEMO_FOLDERS;

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

      <Popover>
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
        <PopoverContent className="w-72 p-0" align="start">
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
              {filteredFolders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={() => {
                    onChange(folder.id);
                    setSearch('');
                  }}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-muted ${
                    value === folder.id ? 'bg-primary/10 font-medium' : ''
                  }`}
                >
                  <span>{folder.icon}</span>
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
