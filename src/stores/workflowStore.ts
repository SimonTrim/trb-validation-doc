import { create } from 'zustand';
import type {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowNode,
  WorkflowEdge,
  WorkflowStatus,
} from '@/models/workflow';

interface WorkflowState {
  // Definitions (templates)
  definitions: WorkflowDefinition[];
  activeDefinition: WorkflowDefinition | null;

  // Instances (en cours d'exécution)
  instances: WorkflowInstance[];
  activeInstance: WorkflowInstance | null;

  // Designer state
  designerNodes: WorkflowNode[];
  designerEdges: WorkflowEdge[];
  selectedNodeId: string | null;
  designerStatuses: WorkflowStatus[];
  isDirty: boolean;

  // Loading
  isLoading: boolean;
  error: string | null;

  // Definition actions
  setDefinitions: (defs: WorkflowDefinition[]) => void;
  setActiveDefinition: (def: WorkflowDefinition | null) => void;
  addDefinition: (def: WorkflowDefinition) => void;
  updateDefinition: (id: string, updates: Partial<WorkflowDefinition>) => void;
  removeDefinition: (id: string) => void;

  // Instance actions
  setInstances: (instances: WorkflowInstance[]) => void;
  setActiveInstance: (instance: WorkflowInstance | null) => void;
  addInstance: (instance: WorkflowInstance) => void;
  updateInstance: (id: string, updates: Partial<WorkflowInstance>) => void;

  // Designer actions
  setDesignerNodes: (nodes: WorkflowNode[]) => void;
  setDesignerEdges: (edges: WorkflowEdge[]) => void;
  addDesignerNode: (node: WorkflowNode) => void;
  updateDesignerNode: (id: string, data: Partial<WorkflowNode>) => void;
  removeDesignerNode: (id: string) => void;
  addDesignerEdge: (edge: WorkflowEdge) => void;
  removeDesignerEdge: (id: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setDesignerStatuses: (statuses: WorkflowStatus[]) => void;
  addDesignerStatus: (status: WorkflowStatus) => void;
  updateDesignerStatus: (id: string, updates: Partial<WorkflowStatus>) => void;
  removeDesignerStatus: (id: string) => void;
  setDirty: (dirty: boolean) => void;

  // Utility
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  definitions: [],
  activeDefinition: null,
  instances: [],
  activeInstance: null,
  designerNodes: [],
  designerEdges: [],
  selectedNodeId: null,
  designerStatuses: [],
  isDirty: false,
  isLoading: false,
  error: null,

  // Definition actions
  setDefinitions: (defs) => set({ definitions: defs }),
  setActiveDefinition: (def) =>
    set({
      activeDefinition: def,
      designerNodes: def?.nodes || [],
      designerEdges: def?.edges || [],
      designerStatuses: def?.statuses || [],
      isDirty: false,
    }),
  addDefinition: (def) => set((s) => ({ definitions: [...s.definitions, def] })),
  updateDefinition: (id, updates) =>
    set((s) => ({
      definitions: s.definitions.map((d) => (d.id === id ? { ...d, ...updates } : d)),
      activeDefinition:
        s.activeDefinition?.id === id
          ? { ...s.activeDefinition, ...updates }
          : s.activeDefinition,
    })),
  removeDefinition: (id) =>
    set((s) => ({
      definitions: s.definitions.filter((d) => d.id !== id),
      activeDefinition: s.activeDefinition?.id === id ? null : s.activeDefinition,
    })),

  // Instance actions
  setInstances: (instances) => set({ instances }),
  setActiveInstance: (instance) => set({ activeInstance: instance }),
  addInstance: (instance) => set((s) => ({ instances: [...s.instances, instance] })),
  updateInstance: (id, updates) =>
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...updates } : i)),
      activeInstance:
        s.activeInstance?.id === id ? { ...s.activeInstance, ...updates } : s.activeInstance,
    })),

  // Designer actions
  setDesignerNodes: (nodes) => set({ designerNodes: nodes, isDirty: true }),
  setDesignerEdges: (edges) => set({ designerEdges: edges, isDirty: true }),
  addDesignerNode: (node) =>
    set((s) => ({ designerNodes: [...s.designerNodes, node], isDirty: true })),
  updateDesignerNode: (id, data) =>
    set((s) => ({
      designerNodes: s.designerNodes.map((n) => (n.id === id ? { ...n, ...data } : n)),
      isDirty: true,
    })),
  removeDesignerNode: (id) =>
    set((s) => ({
      designerNodes: s.designerNodes.filter((n) => n.id !== id),
      designerEdges: s.designerEdges.filter((e) => e.source !== id && e.target !== id),
      isDirty: true,
    })),
  addDesignerEdge: (edge) =>
    set((s) => ({ designerEdges: [...s.designerEdges, edge], isDirty: true })),
  removeDesignerEdge: (id) =>
    set((s) => ({
      designerEdges: s.designerEdges.filter((e) => e.id !== id),
      isDirty: true,
    })),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  setDesignerStatuses: (statuses) => set({ designerStatuses: statuses, isDirty: true }),
  addDesignerStatus: (status) =>
    set((s) => ({ designerStatuses: [...s.designerStatuses, status], isDirty: true })),
  updateDesignerStatus: (id, updates) =>
    set((s) => ({
      designerStatuses: s.designerStatuses.map((st) =>
        st.id === id ? { ...st, ...updates } : st
      ),
      isDirty: true,
    })),
  removeDesignerStatus: (id) =>
    set((s) => ({
      designerStatuses: s.designerStatuses.filter((st) => st.id !== id),
      isDirty: true,
    })),
  setDirty: (dirty) => set({ isDirty: dirty }),

  // Utility
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}));
