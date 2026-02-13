import React from 'react';
import {
  Plus, GitBranch, Clock, CheckCircle, MoreVertical, Settings, Play, Copy, Trash2,
  Power, PowerOff, Download, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TemplateSelector } from './TemplateSelector';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { DOCUMENT_VALIDATION_STATUSES } from '@/models/workflow';
import { formatDate, generateId } from '@/lib/utils';
import { toast } from 'sonner';
import type { WorkflowDefinition } from '@/models/workflow';
import * as workflowApi from '@/api/workflowApiService';

export function WorkflowList() {
  const { definitions, setActiveDefinition, addDefinition, updateDefinition, removeDefinition } = useWorkflowStore();
  const { setCurrentView } = useAppStore();

  const handleCreateWorkflow = async () => {
    const { project, currentUser } = useAuthStore.getState();
    const newDef: WorkflowDefinition = {
      id: generateId(),
      name: 'Nouveau workflow',
      description: 'Workflow de validation documentaire',
      version: 1,
      type: 'document_validation',
      projectId: project?.id || '',
      createdBy: currentUser?.id || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: false,
      statuses: [...DOCUMENT_VALIDATION_STATUSES],
      nodes: [
        {
          id: 'node-start',
          type: 'start',
          position: { x: 50, y: 200 },
          data: { label: 'Dépôt document' },
        },
        {
          id: 'node-pending',
          type: 'status',
          position: { x: 250, y: 200 },
          data: {
            label: 'En attente',
            statusId: 'pending',
            color: '#6a6e79',
          },
        },
        {
          id: 'node-review',
          type: 'review',
          position: { x: 480, y: 200 },
          data: {
            label: 'Vérification',
            requiredApprovals: 1,
            assignees: [],
          },
        },
        {
          id: 'node-decision',
          type: 'decision',
          position: { x: 710, y: 200 },
          data: { label: 'Décision' },
        },
      ],
      edges: [
        { id: 'edge-1', source: 'node-start', target: 'node-pending' },
        { id: 'edge-2', source: 'node-pending', target: 'node-review' },
        { id: 'edge-3', source: 'node-review', target: 'node-decision' },
      ],
      settings: {
        autoStartOnUpload: true,
        notifyOnStatusChange: true,
        allowResubmission: true,
        parallelReview: false,
      },
    };

    addDefinition(newDef);
    setActiveDefinition(newDef);
    setCurrentView('workflow-designer');

    // Persist to backend (non-blocking)
    workflowApi.createWorkflowDefinition(newDef).catch((err) => {
      console.warn('[WorkflowList] Failed to persist new workflow:', err);
    });
  };

  const handleOpenDesigner = (def: WorkflowDefinition) => {
    setActiveDefinition(def);
    setCurrentView('workflow-designer');
  };

  const handleToggleActive = (def: WorkflowDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !def.isActive;
    updateDefinition(def.id, { isActive: newState });
    toast.success(newState ? 'Workflow activé' : 'Workflow désactivé', {
      description: `"${def.name}" est maintenant ${newState ? 'actif' : 'en brouillon'}.`,
    });

    // Persist to backend (non-blocking)
    workflowApi.updateWorkflowDefinition(def.id, { isActive: newState }).catch((err) => {
      console.warn('[WorkflowList] Failed to persist toggle:', err);
    });
  };

  const handleDuplicate = (def: WorkflowDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy: WorkflowDefinition = {
      ...def,
      id: generateId(),
      name: `${def.name} (copie)`,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addDefinition(copy);
    toast.success('Workflow dupliqué', { description: `"${copy.name}" créé.` });

    // Persist to backend (non-blocking)
    workflowApi.createWorkflowDefinition(copy).catch((err) => {
      console.warn('[WorkflowList] Failed to persist duplicate:', err);
    });
  };

  const handleDelete = (def: WorkflowDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    removeDefinition(def.id);
    toast.success('Workflow supprimé', { description: `"${def.name}" a été supprimé.` });

    // Persist to backend (non-blocking)
    workflowApi.deleteWorkflowDefinition(def.id).catch((err) => {
      console.warn('[WorkflowList] Failed to persist delete:', err);
    });
  };

  const handleExportTemplate = (def: WorkflowDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    const template = {
      ...def,
      id: undefined,
      projectId: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      isActive: false,
      _exportedAt: new Date().toISOString(),
      _format: 'trb-workflow-template-v1',
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${def.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Template exporté', { description: `"${def.name}" a été exporté.` });
  };

  const handleImportTemplate = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string);
          if (data._format !== 'trb-workflow-template-v1') {
            toast.error('Format invalide', { description: 'Ce fichier n\'est pas un template de workflow valide.' });
            return;
          }
          const { project, currentUser } = useAuthStore.getState();
          const newDef: WorkflowDefinition = {
            ...data,
            id: generateId(),
            projectId: project?.id || '',
            createdBy: currentUser?.id || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: false,
            name: `${data.name || 'Workflow'} (importé)`,
          };
          delete (newDef as any)._exportedAt;
          delete (newDef as any)._format;
          addDefinition(newDef);
          toast.success('Template importé', { description: `"${newDef.name}" a été ajouté.` });

          // Persist to backend (non-blocking)
          workflowApi.createWorkflowDefinition(newDef).catch((err) => {
            console.warn('[WorkflowList] Failed to persist imported template:', err);
          });
        } catch {
          toast.error('Erreur de lecture', { description: 'Le fichier JSON est invalide.' });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Workflows</h2>
          <p className="text-sm text-muted-foreground">
            Créez et gérez vos workflows de validation
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TemplateSelector onSelect={() => setCurrentView('workflow-designer')} />
          <Button variant="outline" onClick={handleImportTemplate}>
            <Upload className="mr-2 h-4 w-4" />
            Importer
          </Button>
          <Button onClick={handleCreateWorkflow}>
            <Plus className="mr-2 h-4 w-4" />
            Workflow vide
          </Button>
        </div>
      </div>

      {/* Workflow cards */}
      {definitions.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <GitBranch className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <CardTitle className="mb-2">Aucun workflow</CardTitle>
          <CardDescription className="mb-6 max-w-md">
            Créez votre premier workflow de validation documentaire. Vous pourrez définir
            les étapes, les statuts, les réviseurs et les actions automatiques.
          </CardDescription>
          <Button onClick={handleCreateWorkflow}>
            <Plus className="mr-2 h-4 w-4" />
            Créer un workflow
          </Button>
        </Card>
      ) : (
        <TooltipProvider>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {definitions.map((def) => (
              <Card
                key={def.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${
                  !def.isActive ? 'opacity-70' : ''
                }`}
                onClick={() => handleOpenDesigner(def)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{def.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Toggle activer/désactiver */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted"
                            onClick={(e) => handleToggleActive(def, e)}
                          >
                            <Switch
                              checked={def.isActive}
                              className="scale-90"
                              onCheckedChange={() => {}}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {def.isActive ? 'Désactiver le workflow' : 'Activer le workflow'}
                        </TooltipContent>
                      </Tooltip>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleOpenDesigner(def); }}>
                            <Settings className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleDuplicate(def, e)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Dupliquer
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => handleExportTemplate(def, e)}>
                            <Download className="mr-2 h-4 w-4" />
                            Exporter en template
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => handleToggleActive(def, e)}>
                            {def.isActive ? (
                              <>
                                <PowerOff className="mr-2 h-4 w-4" />
                                Désactiver
                              </>
                            ) : (
                              <>
                                <Power className="mr-2 h-4 w-4" />
                                Activer
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={(e) => handleDelete(def, e)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <CardDescription>{def.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={def.isActive ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {def.isActive ? (
                        <>
                          <CheckCircle className="mr-1 h-3 w-3" />
                          Actif
                        </>
                      ) : (
                        <>
                          <Clock className="mr-1 h-3 w-3" />
                          Brouillon
                        </>
                      )}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {def.type === 'document_validation'
                        ? 'Validation doc'
                        : def.type === 'document_review'
                          ? 'Revue doc'
                          : def.type === 'approval'
                            ? 'Approbation'
                            : def.type}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{def.nodes.length} noeuds</span>
                    <span>{def.statuses.length} statuts</span>
                    <span>v{def.version}</span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Modifié le {formatDate(def.updatedAt)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
