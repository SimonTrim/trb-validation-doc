import React, { useState, useRef, useCallback } from 'react';
import { Plus, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkflowStore } from '@/stores/workflowStore';
import { generateId } from '@/lib/utils';
import type { WorkflowStatus } from '@/models/workflow';

export function StatusConfigPanel() {
  const {
    designerStatuses, addDesignerStatus, updateDesignerStatus,
    removeDesignerStatus, setDesignerStatuses,
  } = useWorkflowStore();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#6a6e79');

  // ── Drag-and-drop state ──────────────────────────────────────────────
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = useCallback((index: number, e: React.DragEvent<HTMLDivElement>) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Transparent drag image — we'll show visual feedback instead
    const ghost = document.createElement('div');
    ghost.style.opacity = '0';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const handleDragOver = useCallback((index: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const reordered = [...designerStatuses];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      // Update order property
      const updated = reordered.map((s, i) => ({ ...s, order: i }));
      setDesignerStatuses(updated);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex, designerStatuses, setDesignerStatuses]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleAddStatus = () => {
    if (!newName.trim()) return;
    const status: WorkflowStatus = {
      id: generateId(),
      name: newName.trim(),
      description: '',
      color: newColor,
      isFinal: false,
      isDefault: false,
      visibleInResolution: true,
      order: designerStatuses.length,
    };
    addDesignerStatus(status);
    setNewName('');
    setNewColor('#6a6e79');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Statuts du workflow</h3>
        <span className="text-xs text-muted-foreground">
          {designerStatuses.length} statut(s) · glisser pour réordonner
        </span>
      </div>

      {/* Status list with drag-and-drop */}
      <div className="space-y-2">
        {designerStatuses.map((status, index) => {
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <div
              key={status.id}
              ref={isDragging ? dragNodeRef : undefined}
              draggable
              onDragStart={(e) => handleDragStart(index, e)}
              onDragOver={(e) => handleDragOver(index, e)}
              onDragEnd={handleDragEnd}
              onDragLeave={handleDragLeave}
              className={`rounded-lg border p-2 shadow-sm space-y-1.5 transition-all duration-150 ${
                isDragging
                  ? 'opacity-40 scale-95 border-dashed bg-muted'
                  : isDragOver
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                    : 'bg-card'
              }`}
            >
              {/* Drop indicator line */}
              {isDragOver && dragIndex !== null && dragIndex !== index && (
                <div className="h-0.5 -mt-2 mb-1 bg-primary rounded-full" />
              )}

              {/* Row 1: Grip + Color + Name + Actions */}
              <div className="flex items-center gap-1.5">
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors" />

                {/* Color picker */}
                <input
                  type="color"
                  value={status.color}
                  onChange={(e) => updateDesignerStatus(status.id, { color: e.target.value })}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 p-0"
                />

                {/* Name */}
                <Input
                  value={status.name}
                  onChange={(e) => updateDesignerStatus(status.id, { name: e.target.value })}
                  className="h-7 min-w-0 flex-1 text-xs font-medium"
                  title={status.name}
                />

                {/* Visible toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() =>
                    updateDesignerStatus(status.id, {
                      visibleInResolution: !status.visibleInResolution,
                    })
                  }
                  title={status.visibleInResolution ? 'Visible dans les résolutions' : 'Masqué'}
                >
                  {status.visibleInResolution ? (
                    <Eye className="h-3 w-3 text-green-600" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-gray-400" />
                  )}
                </Button>

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeDesignerStatus(status.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Row 2: Description (full width) */}
              <Input
                value={status.description}
                onChange={(e) =>
                  updateDesignerStatus(status.id, { description: e.target.value })
                }
                placeholder="Description..."
                className="h-6 w-full text-[11px] text-muted-foreground pl-[34px]"
              />
            </div>
          );
        })}
      </div>

      {/* Add new status */}
      <div className="rounded-lg border border-dashed p-2 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 p-0"
          />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom"
            className="h-7 min-w-0 flex-1 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleAddStatus()}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-xs px-2"
            onClick={handleAddStatus}
            disabled={!newName.trim()}
          >
            <Plus className="mr-1 h-3 w-3" />
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}
