import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  BackgroundVariant,
  Panel,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Save, Undo2, Redo2, Settings2, List, Eye, FileText, X, ChevronDown, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

import { StartNode, EndNode, StatusNode, DecisionNode, ActionNode, ReviewNode } from './nodes';
import { NodeToolbar } from './NodeToolbar';
import { NodeConfigPanel } from './NodeConfigPanel';
import { StatusConfigPanel } from './StatusConfigPanel';
import { MetadataSchemaEditor } from './MetadataSchemaEditor';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAppStore } from '@/stores/appStore';
import { useAuthStore } from '@/stores/authStore';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { generateId } from '@/lib/utils';
import * as workflowApi from '@/api/workflowApiService';
import type { WorkflowNodeType, WorkflowNodeData, WorkflowInstance } from '@/models/workflow';

/** Snapshot of the designer state for undo/redo */
interface DesignerSnapshot {
  nodes: Node[];
  edges: Edge[];
}

const nodeTypes: NodeTypes = {
  start: StartNode,
  end: EndNode,
  status: StatusNode,
  decision: DecisionNode,
  action: ActionNode,
  review: ReviewNode,
};

const defaultNodeData: Record<WorkflowNodeType, Partial<WorkflowNodeData>> = {
  start: { label: 'Début', description: 'Point de départ' },
  end: { label: 'Fin', description: 'Fin du workflow' },
  status: { label: 'Nouveau statut', color: '#6a6e79' },
  decision: { label: 'Décision' },
  action: {
    label: 'Action',
    autoActions: [{ id: 'a1', type: 'notify_user', config: {}, label: 'Notifier' }],
  },
  review: { label: 'Vérification', requiredApprovals: 1, assignees: [] },
  parallel: { label: 'Parallèle' },
  timer: { label: 'Timer', timerDuration: 24, timerUnit: 'hours' },
};

interface WorkflowDesignerProps {
  onSave?: () => void;
}

export function WorkflowDesigner({ onSave }: WorkflowDesignerProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const {
    designerNodes,
    designerEdges,
    selectedNodeId,
    isDirty,
    instances,
    activeDefinition,
    setDesignerNodes,
    setDesignerEdges,
    setSelectedNodeId,
    updateDefinition,
  } = useWorkflowStore();

  const { documents } = useDocumentStore();
  const { setCurrentView } = useAppStore();

  // Instance viewer mode
  const [viewingInstanceId, setViewingInstanceId] = useState<string | null>(null);

  // Instances du workflow actif
  const workflowInstances = useMemo(
    () => instances.filter((i) => i.workflowDefinitionId === activeDefinition?.id),
    [instances, activeDefinition]
  );

  const viewingInstance = viewingInstanceId
    ? workflowInstances.find((i) => i.id === viewingInstanceId) || null
    : null;

  // Noeuds visités par l'instance sélectionnée
  const visitedNodeIds = useMemo(() => {
    if (!viewingInstance) return new Set<string>();
    const visited = new Set<string>();
    for (const h of viewingInstance.history) {
      if (h.fromNodeId) visited.add(h.fromNodeId);
      if (h.toNodeId) visited.add(h.toNodeId);
    }
    visited.add(viewingInstance.currentNodeId);
    return visited;
  }, [viewingInstance]);

  // Edges traversées
  const traversedEdgeIds = useMemo(() => {
    if (!viewingInstance) return new Set<string>();
    const traversed = new Set<string>();
    for (const h of viewingInstance.history) {
      // Trouver l'edge qui relie fromNode → toNode
      const edge = designerEdges.find(
        (e) => e.source === h.fromNodeId && e.target === h.toNodeId
      );
      if (edge) traversed.add(edge.id);
    }
    return traversed;
  }, [viewingInstance, designerEdges]);

  // Convert our workflow nodes to React Flow nodes
  const initialNodes: Node[] = designerNodes.map((n) => {
    const isCurrentNode = viewingInstance?.currentNodeId === n.id;
    const isVisited = visitedNodeIds.has(n.id);
    const isViewing = !!viewingInstance;

    return {
      id: n.id,
      type: n.type as string,
      position: n.position,
      data: {
        ...n.data,
        // Injecter les infos d'instance pour les noeuds custom
        _isCurrentNode: isCurrentNode,
        _isVisited: isVisited,
        _isViewing: isViewing,
        _instanceDocName: isCurrentNode ? viewingInstance?.documentName : undefined,
      } as Record<string, unknown>,
      selected: n.id === selectedNodeId,
      className: isViewing
        ? isCurrentNode
          ? 'ring-4 ring-blue-400 ring-offset-2 rounded-lg'
          : isVisited
            ? 'opacity-100'
            : 'opacity-30'
        : '',
    };
  });

  const initialEdges: Edge[] = designerEdges.map((e) => {
    const isTraversed = traversedEdgeIds.has(e.id);
    const isViewing = !!viewingInstance;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label,
      animated: isViewing ? isTraversed : e.animated,
      style: {
        stroke: isViewing
          ? isTraversed ? '#3b82f6' : '#d1d5db'
          : '#6a6e79',
        strokeWidth: isViewing && isTraversed ? 3 : 2,
      },
      labelStyle: { fontSize: 11, fontWeight: 500 },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      labelBgStyle: { fill: '#f8f9fa', stroke: '#dee2e6' },
    };
  });

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Undo/Redo system
  const undoRedo = useUndoRedo<DesignerSnapshot>({ nodes: initialNodes, edges: initialEdges });
  const isUndoRedoAction = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Capture snapshot after a debounce (to batch rapid changes) */
  const captureSnapshot = useCallback(() => {
    if (isUndoRedoAction.current) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // Read current React Flow state
      setNodes((currentNodes) => {
        setEdges((currentEdges) => {
          undoRedo.push({ nodes: currentNodes, edges: currentEdges });
          return currentEdges;
        });
        return currentNodes;
      });
    }, 300);
  }, [undoRedo, setNodes, setEdges]);

  /** Apply undo */
  const handleUndo = useCallback(() => {
    if (!undoRedo.canUndo) return;
    // Capture current state to redo stack
    isUndoRedoAction.current = true;
    undoRedo.undo();
  }, [undoRedo]);

  /** Apply redo */
  const handleRedo = useCallback(() => {
    if (!undoRedo.canRedo) return;
    isUndoRedoAction.current = true;
    undoRedo.redo();
  }, [undoRedo]);

  // Apply undo/redo snapshot to React Flow
  useEffect(() => {
    if (!isUndoRedoAction.current) return;
    setNodes(undoRedo.current.nodes);
    setEdges(undoRedo.current.edges);
    isUndoRedoAction.current = false;
  }, [undoRedo.current, setNodes, setEdges]);

  // Keyboard shortcuts (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Sync changes back to store
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      // Capture for undo after position/add/remove changes
      const significant = changes.some((c: any) =>
        c.type === 'remove' || c.type === 'add' || (c.type === 'position' && c.dragging === false)
      );
      if (significant) captureSnapshot();
    },
    [onNodesChange, captureSnapshot]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      const significant = changes.some((c: any) => c.type === 'remove' || c.type === 'add');
      if (significant) captureSnapshot();
    },
    [onEdgesChange, captureSnapshot]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `edge-${generateId()}`,
        animated: false,
        style: { stroke: '#6a6e79', strokeWidth: 2 },
      } as Edge;
      setEdges((eds) => addEdge(newEdge, eds));
      captureSnapshot();
    },
    [setEdges, captureSnapshot]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  // Drag & Drop from toolbar
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow') as WorkflowNodeType;
      if (!type || !reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = {
        x: event.clientX - bounds.left - 75,
        y: event.clientY - bounds.top - 25,
      };

      const newNode: Node = {
        id: `node-${generateId()}`,
        type,
        position,
        data: { ...defaultNodeData[type] } as Record<string, unknown>,
      };

      setNodes((nds) => [...nds, newNode]);
      captureSnapshot();
    },
    [setNodes, captureSnapshot]
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent, nodeType: WorkflowNodeType) => {
      event.dataTransfer.setData('application/reactflow', nodeType);
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleSave = useCallback(async () => {
    // Sync React Flow state back to store
    const workflowNodes = nodes.map((n) => ({
      id: n.id,
      type: n.type as WorkflowNodeType,
      position: n.position,
      data: n.data as unknown as WorkflowNodeData,
    }));
    const workflowEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || undefined,
      targetHandle: e.targetHandle || undefined,
      label: typeof e.label === 'string' ? e.label : undefined,
      animated: e.animated,
    }));

    setDesignerNodes(workflowNodes);
    setDesignerEdges(workflowEdges);

    // Persist to backend
    if (activeDefinition) {
      const updates = {
        nodes: workflowNodes,
        edges: workflowEdges,
        statuses: useWorkflowStore.getState().designerStatuses || activeDefinition.statuses,
        settings: activeDefinition.settings,
      };
      updateDefinition(activeDefinition.id, updates);

      // Send the FULL definition (needed for upsert if it doesn't exist in DB yet)
      const fullDefinition = {
        ...activeDefinition,
        ...updates,
        projectId: activeDefinition.projectId || useAuthStore.getState().project?.id || '',
        createdBy: activeDefinition.createdBy || useAuthStore.getState().currentUser?.id || '',
      };
      workflowApi.updateWorkflowDefinition(activeDefinition.id, fullDefinition).then(() => {
        toast.success('Workflow enregistré');
        // Restart folder watcher if settings changed
        if (fullDefinition.isActive && fullDefinition.settings?.autoStartOnUpload && fullDefinition.settings?.sourceFolderId) {
          import('@/engine').then(({ FolderWatcher }) => {
            FolderWatcher.stopAll();
            FolderWatcher.startForActiveWorkflows();
          });
        }
      }).catch((err) => {
        console.warn('[WorkflowDesigner] Failed to persist save:', err);
        toast.error('Erreur de sauvegarde', { description: 'Le workflow a été sauvé localement mais pas sur le serveur.' });
      });
    }

    onSave?.();
  }, [nodes, edges, setDesignerNodes, setDesignerEdges, onSave, activeDefinition, updateDefinition]);

  const handleCancel = useCallback(() => {
    // Reset designer to original definition state
    if (activeDefinition) {
      setDesignerNodes(activeDefinition.nodes);
      setDesignerEdges(activeDefinition.edges);
    }
    // Navigate back to workflow list
    setCurrentView('workflow-list');
    toast.info('Modifications annulées', {
      description: 'Retour à la liste des workflows.',
    });
  }, [activeDefinition, setDesignerNodes, setDesignerEdges, setCurrentView]);

  const minimapNodeColor = useCallback((node: Node) => {
    const colors: Record<string, string> = {
      start: '#10b981',
      end: '#ef4444',
      status: (node.data as any)?.color || '#6a6e79',
      decision: '#6366f1',
      action: '#a855f7',
      review: '#f59e0b',
    };
    return colors[node.type || 'status'] || '#6a6e79';
  }, []);

  return (
    <div className="flex h-full" ref={reactFlowWrapper}>
      {/* Left panel: Node toolbar + Status config */}
      <div className="w-[240px] border-r bg-muted/30">
        <Tabs defaultValue="nodes" className="h-full">
          <TabsList className="mx-3 mt-3 grid w-[calc(100%-24px)] grid-cols-3">
            <TabsTrigger value="nodes" className="text-xs">
              <List className="mr-1 h-3.5 w-3.5" />
              Noeuds
            </TabsTrigger>
            <TabsTrigger value="statuses" className="text-xs">
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              Statuts
            </TabsTrigger>
            <TabsTrigger value="metadata" className="text-xs">
              <Database className="mr-1 h-3.5 w-3.5" />
              Méta
            </TabsTrigger>
          </TabsList>
          <TabsContent value="nodes" className="h-[calc(100%-60px)]">
            <ScrollArea className="h-full">
              <NodeToolbar onDragStart={handleDragStart} />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="statuses" className="h-[calc(100%-60px)]">
            <ScrollArea className="h-full">
              <div className="p-3">
                <StatusConfigPanel />
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="metadata" className="h-[calc(100%-60px)]">
            <ScrollArea className="h-full">
              <div className="p-3">
                <MetadataSchemaEditor
                  schema={activeDefinition?.metadataSchema || []}
                  onChange={(metadataSchema) => {
                    if (activeDefinition) updateDefinition(activeDefinition.id, { metadataSchema });
                  }}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      {/* Main canvas */}
      <div className="relative flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          defaultEdgeOptions={{
            style: { stroke: '#6a6e79', strokeWidth: 2 },
            type: 'smoothstep',
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={15} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={minimapNodeColor}
            style={{ width: 150, height: 100 }}
            maskColor="rgba(0,0,0,0.08)"
          />

          {/* Top toolbar */}
          <Panel position="top-right" className="flex gap-2">
            {/* Instance viewer selector */}
            {workflowInstances.length > 0 && (
              <div className="flex items-center gap-1">
                {viewingInstance ? (
                  <Badge
                    variant="default"
                    className="gap-1.5 bg-blue-500 hover:bg-blue-600 cursor-pointer pr-1"
                  >
                    <Eye className="h-3 w-3" />
                    <span className="max-w-[120px] truncate text-xs">
                      {viewingInstance.documentName}
                    </span>
                    <button
                      onClick={() => setViewingInstanceId(null)}
                      className="ml-1 rounded p-0.5 hover:bg-blue-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : (
                  <Select
                    value=""
                    onValueChange={(v) => setViewingInstanceId(v || null)}
                  >
                    <SelectTrigger className="h-8 w-auto gap-1.5 bg-card text-xs">
                      <Eye className="h-3.5 w-3.5" />
                      Suivre un document
                    </SelectTrigger>
                    <SelectContent>
                      {workflowInstances.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          <div className="flex items-center gap-2">
                            <FileText className="h-3 w-3" />
                            <span className="truncate">{inst.documentName}</span>
                            <Badge
                              variant={inst.completedAt ? 'secondary' : 'default'}
                              className="ml-auto text-[10px] px-1.5 py-0"
                            >
                              {inst.completedAt ? 'Terminé' : 'En cours'}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Undo/Redo buttons */}
            <div className="flex items-center rounded-md border bg-card shadow-sm">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-r-none"
                onClick={handleUndo}
                disabled={!undoRedo.canUndo}
                title="Annuler (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" />
                {undoRedo.undoCount > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">{undoRedo.undoCount}</span>
                )}
              </Button>
              <div className="h-5 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 rounded-l-none"
                onClick={handleRedo}
                disabled={!undoRedo.canRedo}
                title="Refaire (Ctrl+Y)"
              >
                <Redo2 className="h-4 w-4" />
                {undoRedo.redoCount > 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">{undoRedo.redoCount}</span>
                )}
              </Button>
            </div>

            {/* Cancel / Back */}
            {isDirty ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="border-destructive/50 text-destructive hover:bg-destructive/10">
                    <X className="mr-1 h-4 w-4" />
                    Annuler
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Annuler les modifications ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Des modifications non enregistrées seront perdues. Voulez-vous vraiment quitter l'éditeur de workflow ?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Rester</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Annuler les modifications
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="mr-1 h-4 w-4" />
                Annuler
              </Button>
            )}
            <Button size="sm" onClick={handleSave}>
              <Save className="mr-1 h-4 w-4" />
              Enregistrer
              {isDirty && <span className="ml-1 h-2 w-2 rounded-full bg-amber-400" />}
            </Button>
          </Panel>

          {/* Instance info panel (bottom) */}
          {viewingInstance && (
            <Panel position="bottom-center" className="w-auto max-w-md">
              <div className="rounded-lg border bg-card/95 p-3 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <FileText className="h-3 w-3" />
                    {viewingInstance.documentName}
                  </Badge>
                  <span className="text-muted-foreground">
                    Noeud actuel: <strong>{
                      designerNodes.find((n) => n.id === viewingInstance.currentNodeId)?.data.label || viewingInstance.currentNodeId
                    }</strong>
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">
                    {viewingInstance.history.length} étape(s)
                  </span>
                  <span className="text-muted-foreground">|</span>
                  <span className="text-muted-foreground">
                    {viewingInstance.reviews.length} visa(s)
                  </span>
                  {viewingInstance.completedAt && (
                    <Badge variant="secondary" className="text-[10px]">Terminé</Badge>
                  )}
                </div>
              </div>
            </Panel>
          )}
        </ReactFlow>

        {/* Node config panel (slide-in from right) */}
        {selectedNodeId && <NodeConfigPanel />}
      </div>
    </div>
  );
}
