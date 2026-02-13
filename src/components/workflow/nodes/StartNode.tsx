import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';
import type { WorkflowNodeData } from '@/models/workflow';

export function StartNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;

  return (
    <div
      className={`
        flex items-center gap-2 rounded-lg border-2 bg-card px-4 py-3 shadow-sm transition-all
        ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-emerald-400'}
      `}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
        <Play className="h-4 w-4 text-emerald-600" />
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-800">{nodeData.label || 'Début'}</div>
        {nodeData.description && (
          <div className="text-xs text-gray-500">{nodeData.description}</div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-emerald-400 !bg-white"
      />
    </div>
  );
}
