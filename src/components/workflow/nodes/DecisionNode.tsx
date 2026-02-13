import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import type { WorkflowNodeData } from '@/models/workflow';

export function DecisionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;

  return (
    <div
      className={`
        relative flex h-[80px] w-[80px] items-center justify-center
        ${selected ? 'drop-shadow-lg' : 'drop-shadow-sm'}
      `}
    >
      {/* Diamond shape */}
      <div
        className={`
          absolute inset-0 rotate-45 rounded-lg border-2 bg-card transition-all
          ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-blue-400'}
        `}
      />

      {/* Content (not rotated) */}
      <div className="relative z-10 flex flex-col items-center">
        <GitBranch className="h-5 w-5 text-blue-600" />
        <span className="mt-0.5 text-[10px] font-semibold text-blue-700">
          {nodeData.label || 'Décision'}
        </span>
      </div>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-blue-400 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!h-3 !w-3 !border-2 !border-blue-400 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className="!h-3 !w-3 !border-2 !border-blue-400 !bg-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!h-3 !w-3 !border-2 !border-blue-400 !bg-white"
      />
    </div>
  );
}
