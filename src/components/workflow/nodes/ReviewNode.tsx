import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { UserCheck, Users } from 'lucide-react';
import type { WorkflowNodeData } from '@/models/workflow';

export function ReviewNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const assigneeCount = nodeData.assignees?.length || 0;
  const requiredApprovals = nodeData.requiredApprovals || 1;

  return (
    <div
      className={`
        min-w-[170px] rounded-lg border-2 bg-card shadow-sm transition-all
        ${selected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-amber-400'}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-amber-400 !bg-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-md bg-amber-50 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
          {assigneeCount > 1 ? (
            <Users className="h-4 w-4 text-amber-700" />
          ) : (
            <UserCheck className="h-4 w-4 text-amber-700" />
          )}
        </div>
        <div>
          <div className="text-sm font-semibold text-amber-800">
            {nodeData.label || 'Vérification'}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-1 px-3 py-2">
        {nodeData.description && (
          <p className="text-xs text-gray-500">{nodeData.description}</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">
            {assigneeCount} réviseur{assigneeCount > 1 ? 's' : ''}
          </span>
          <span className="text-[10px] text-amber-600">
            {requiredApprovals} visa{requiredApprovals > 1 ? 's' : ''} requis
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-amber-400 !bg-white"
      />
    </div>
  );
}
