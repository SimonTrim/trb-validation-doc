// ============================================================================
// LABEL SELECTOR — Sélecteur de labels pour les documents
// Affiche les labels prédéfinis + les labels personnalisés (créés)
// Les labels custom sont persistés dans le labelStore
// ============================================================================

import React, { useState } from 'react';
import { Plus, Tag, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DEFAULT_LABELS, type DocumentLabel } from '@/models/document';
import { useDocumentStore } from '@/stores/documentStore';
import { useLabelStore } from '@/stores/labelStore';
import { generateId } from '@/lib/utils';

interface LabelSelectorProps {
  documentId: string;
  currentLabels: DocumentLabel[];
}

export function LabelSelector({ documentId, currentLabels }: LabelSelectorProps) {
  const { updateDocument } = useDocumentStore();
  const { customLabels, addCustomLabel } = useLabelStore();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const currentLabelIds = new Set(currentLabels.map((l) => l.id));

  // Merge default + custom labels for full list
  const allLabels = [...DEFAULT_LABELS, ...customLabels];

  const filteredLabels = allLabels.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleLabel = (label: DocumentLabel) => {
    let newLabels: DocumentLabel[];
    if (currentLabelIds.has(label.id)) {
      newLabels = currentLabels.filter((l) => l.id !== label.id);
    } else {
      newLabels = [...currentLabels, label];
    }
    updateDocument(documentId, { labels: newLabels });
  };

  const handleCreateCustomLabel = () => {
    if (!search.trim()) return;
    const colors = ['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#9333ea', '#0891b2', '#c2410c', '#be123c', '#4f46e5', '#0369a1'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const newLabel: DocumentLabel = {
      id: `custom-${generateId()}`,
      name: search.trim(),
      color,
    };

    // 1. Persist in global label store so it appears for all documents
    addCustomLabel(newLabel);

    // 2. Add to current document
    updateDocument(documentId, { labels: [...currentLabels, newLabel] });
    setSearch('');
  };

  // Check if exact match exists in all labels
  const exactMatchExists = allLabels.some(
    (l) => l.name.toLowerCase() === search.trim().toLowerCase()
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Tag className="h-3 w-3" />
          Labels
          <Plus className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[230px] p-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher ou créer..."
          className="mb-2 h-8 text-xs"
          autoFocus
        />

        <div className="max-h-[240px] overflow-y-auto space-y-0.5">
          {/* Default labels section */}
          {filteredLabels.filter((l) => !l.id.startsWith('custom-')).length > 0 && (
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Labels prédéfinis
            </div>
          )}
          {filteredLabels
            .filter((l) => !l.id.startsWith('custom-'))
            .map((label) => {
              const isSelected = currentLabelIds.has(label.id);
              return (
                <button
                  key={label.id}
                  className={`
                    flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs
                    transition-colors hover:bg-muted
                    ${isSelected ? 'bg-muted/80' : ''}
                  `}
                  onClick={() => handleToggleLabel(label)}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 border"
                    style={{
                      backgroundColor: isSelected ? label.color : 'transparent',
                      borderColor: label.color,
                    }}
                  />
                  <span className="flex-1 text-left">{label.name}</span>
                  {isSelected && <Check className="h-3 w-3 text-primary" />}
                </button>
              );
            })}

          {/* Custom labels section */}
          {filteredLabels.filter((l) => l.id.startsWith('custom-')).length > 0 && (
            <>
              <div className="my-1 border-t" />
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Labels personnalisés
              </div>
            </>
          )}
          {filteredLabels
            .filter((l) => l.id.startsWith('custom-'))
            .map((label) => {
              const isSelected = currentLabelIds.has(label.id);
              return (
                <button
                  key={label.id}
                  className={`
                    flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs
                    transition-colors hover:bg-muted
                    ${isSelected ? 'bg-muted/80' : ''}
                  `}
                  onClick={() => handleToggleLabel(label)}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 border"
                    style={{
                      backgroundColor: isSelected ? label.color : 'transparent',
                      borderColor: label.color,
                    }}
                  />
                  <span className="flex-1 text-left">{label.name}</span>
                  {isSelected && <Check className="h-3 w-3 text-primary" />}
                </button>
              );
            })}
        </div>

        {/* Create new label */}
        {search.trim() && !exactMatchExists && (
          <>
            <div className="my-1 border-t" />
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted"
              onClick={handleCreateCustomLabel}
            >
              <Plus className="h-3 w-3" />
              Créer « {search.trim()} »
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
