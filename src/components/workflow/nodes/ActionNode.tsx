import React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap, FolderOutput, Bell, MessageSquare, Globe } from 'lucide-react';
import type { WorkflowNodeData } from '@/models/workflow';

const actionIcons: Record<string, React.ReactNode> = {
  move_file: <FolderOutput className="h-4 w-4" />,
  copy_file: <FolderOutput className="h-4 w-4" />,
  notify_user: <Bell className="h-4 w-4" />,
  send_comment: <MessageSquare className="h-4 w-4" />,
  webhook: <Globe className="h-4 w-4" />,
  default: <Zap className="h-4 w-4" />,
};

export function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const actionType = nodeData.autoActions?.[0]?.type || 'default';
  const icon = actionIcons[actionType] || actionIcons.default;

  return (
    <div
      className={`
        min-w-[140px] rounded-lg border-2 border-dashed bg-card shadow-sm transition-all
        ${selected ? 'border-purple-500 ring-2 ring-purple-200' : 'border-purple-300'}
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-purple-400 !bg-white"
      />

      <div className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-100">
          <span className="text-purple-600">{icon}</span>
        </div>
        <div>
          <div className="text-xs font-semibold text-purple-800">
            {nodeData.label || 'Action'}
          </div>
          {nodeData.description && (
            <div className="text-[10px] text-gray-400">{nodeData.description}</div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-purple-400 !bg-white"
      />
    </div>
  );
}
