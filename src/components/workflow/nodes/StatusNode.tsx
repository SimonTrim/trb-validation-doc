import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Clock, CheckCircle, MessageCircle, XCircle,
  AlertCircle, AlertTriangle, Check, Ban,
} from 'lucide-react';
import type { WorkflowNodeData } from '@/models/workflow';

const iconMap: Record<string, React.ReactNode> = {
  clock: <Clock className="h-4 w-4" />,
  'check-circle': <CheckCircle className="h-4 w-4" />,
  'message-circle': <MessageCircle className="h-4 w-4" />,
  'x-circle': <XCircle className="h-4 w-4" />,
  'alert-circle': <AlertCircle className="h-4 w-4" />,
  'alert-triangle': <AlertTriangle className="h-4 w-4" />,
  check: <Check className="h-4 w-4" />,
  ban: <Ban className="h-4 w-4" />,
};

export function StatusNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const color = nodeData.color || '#6a6e79';

  return (
    <div
      className={`
        min-w-[160px] rounded-lg border-2 bg-card shadow-sm transition-all
        ${selected ? 'ring-2 ring-primary/20' : ''}
      `}
      style={{ borderColor: color }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !bg-white"
        style={{ borderColor: color }}
      />

      {/* Header with color */}
      <div
        className="flex items-center gap-2 rounded-t-md px-3 py-2"
        style={{ backgroundColor: `${color}15` }}
      >
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: color }}
        >
          {iconMap[nodeData.color || 'clock'] || <div className="h-2 w-2 rounded-full bg-white" />}
        </div>
        <span className="text-sm font-semibold" style={{ color }}>
          {nodeData.label || 'Statut'}
        </span>
      </div>

      {/* Body */}
      {nodeData.description && (
        <div className="px-3 py-2">
          <p className="text-xs text-gray-500">{nodeData.description}</p>
        </div>
      )}

      {/* Assignees */}
      {nodeData.assignees && nodeData.assignees.length > 0 && (
        <div className="border-t px-3 py-1.5">
          <span className="text-[10px] text-gray-400">
            {nodeData.assignees.length} assigné(s)
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !bg-white"
        style={{ borderColor: color }}
      />
    </div>
  );
}
