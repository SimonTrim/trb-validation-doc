import React from 'react';
import {
  Play, Square, GitBranch, Zap, UserCheck, CircleDot,
} from 'lucide-react';
import type { WorkflowNodeType } from '@/models/workflow';

interface NodeToolbarItem {
  type: WorkflowNodeType;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

const nodeItems: NodeToolbarItem[] = [
  {
    type: 'start',
    label: 'Début',
    icon: <Play className="h-4 w-4" />,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    description: 'Point de départ du workflow',
  },
  {
    type: 'status',
    label: 'Statut',
    icon: <CircleDot className="h-4 w-4" />,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    description: 'État du document',
  },
  {
    type: 'review',
    label: 'Vérification',
    icon: <UserCheck className="h-4 w-4" />,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    description: 'Étape de visa / review',
  },
  {
    type: 'decision',
    label: 'Décision',
    icon: <GitBranch className="h-4 w-4" />,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    description: 'Branchement conditionnel',
  },
  {
    type: 'action',
    label: 'Action',
    icon: <Zap className="h-4 w-4" />,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    description: 'Action automatique',
  },
  {
    type: 'end',
    label: 'Fin',
    icon: <Square className="h-4 w-4" />,
    color: 'text-red-600 bg-red-50 border-red-200',
    description: 'Point de fin du workflow',
  },
];

interface NodeToolbarProps {
  onDragStart: (event: React.DragEvent, nodeType: WorkflowNodeType) => void;
}

export function NodeToolbar({ onDragStart }: NodeToolbarProps) {
  return (
    <div className="space-y-1 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Noeuds
      </h3>
      {nodeItems.map((item) => (
        <div
          key={item.type}
          className={`
            flex cursor-grab items-center gap-2.5 rounded-lg border px-3 py-2 transition-all
            hover:shadow-sm active:cursor-grabbing
            ${item.color}
          `}
          draggable
          onDragStart={(e) => onDragStart(e, item.type)}
          title={item.description}
        >
          {item.icon}
          <div>
            <div className="text-xs font-medium">{item.label}</div>
            <div className="text-[10px] opacity-60">{item.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
