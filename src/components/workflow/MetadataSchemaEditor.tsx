// ============================================================================
// METADATA SCHEMA EDITOR — Configurer les champs de métadonnées personnalisés
// ============================================================================

import React, { useState } from 'react';
import {
  Plus, Trash2, GripVertical, Type, Hash, Calendar,
  List, ToggleLeft, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { MetadataFieldDefinition } from '@/models/workflow';
import { generateId } from '@/lib/utils';

interface MetadataSchemaEditorProps {
  schema: MetadataFieldDefinition[];
  onChange: (schema: MetadataFieldDefinition[]) => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texte', icon: <Type className="h-3 w-3" /> },
  { value: 'number', label: 'Nombre', icon: <Hash className="h-3 w-3" /> },
  { value: 'date', label: 'Date', icon: <Calendar className="h-3 w-3" /> },
  { value: 'select', label: 'Liste', icon: <List className="h-3 w-3" /> },
  { value: 'boolean', label: 'Oui/Non', icon: <ToggleLeft className="h-3 w-3" /> },
];

export function MetadataSchemaEditor({ schema, onChange }: MetadataSchemaEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addField = () => {
    const newField: MetadataFieldDefinition = {
      id: generateId(),
      label: '',
      type: 'text',
      required: false,
      placeholder: '',
      description: '',
    };
    onChange([...schema, newField]);
    setExpandedId(newField.id);
  };

  const updateField = (id: string, updates: Partial<MetadataFieldDefinition>) => {
    onChange(schema.map((f) => (f.id === id ? { ...f, ...updates } : f)));
  };

  const removeField = (id: string) => {
    onChange(schema.filter((f) => f.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">
          Champs de métadonnées ({schema.length})
        </p>
        <Button variant="outline" size="sm" className="h-6 gap-1 text-[10px] px-2" onClick={addField}>
          <Plus className="h-3 w-3" />
          Ajouter
        </Button>
      </div>

      {schema.length === 0 ? (
        <div className="rounded-lg border border-dashed p-3 text-center text-[11px] text-muted-foreground leading-relaxed">
          Aucun champ personnalisé.
          <br />
          Les documents utiliseront les métadonnées standard.
        </div>
      ) : (
        <div className="space-y-1.5">
          {schema.map((field) => {
            const isExpanded = expandedId === field.id;
            const typeInfo = FIELD_TYPES.find((t) => t.value === field.type);
            return (
              <div
                key={field.id}
                className="rounded-lg border bg-card transition-all"
              >
                {/* Header — compact */}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer hover:bg-muted/30"
                  onClick={() => setExpandedId(isExpanded ? null : field.id)}
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground shrink-0 cursor-grab" />
                  {typeInfo?.icon}
                  <span className="text-[11px] font-medium truncate flex-1 min-w-0">
                    {field.label || '(Sans nom)'}
                  </span>
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 shrink-0">
                    {typeInfo?.label}
                  </Badge>
                  {field.required && (
                    <span className="text-[9px] text-red-500 font-bold">*</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                    className="text-muted-foreground/40 hover:text-red-500 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  {isExpanded ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Expanded content — stacked layout */}
                {isExpanded && (
                  <div className="border-t px-2 py-2 space-y-2">
                    {/* Nom du champ */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-0.5 block">Nom du champ</label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        className="h-7 text-[11px]"
                        placeholder="Ex: Discipline"
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-0.5 block">Type</label>
                      <Select
                        value={field.type}
                        onValueChange={(v) => updateField(field.id, { type: v as MetadataFieldDefinition['type'] })}
                      >
                        <SelectTrigger className="h-7 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="flex items-center gap-1.5">
                                {t.icon} {t.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-0.5 block">Description</label>
                      <Input
                        value={field.description || ''}
                        onChange={(e) => updateField(field.id, { description: e.target.value })}
                        className="h-7 text-[11px]"
                        placeholder="Description optionnelle"
                      />
                    </div>

                    {/* Placeholder + default (stacked) */}
                    {field.type !== 'boolean' && (
                      <>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">Placeholder</label>
                          <Input
                            value={field.placeholder || ''}
                            onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                            className="h-7 text-[11px]"
                            placeholder="Texte indicatif"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">Valeur par défaut</label>
                          <Input
                            value={field.defaultValue || ''}
                            onChange={(e) => updateField(field.id, { defaultValue: e.target.value })}
                            className="h-7 text-[11px]"
                            placeholder="Valeur par défaut"
                          />
                        </div>
                      </>
                    )}

                    {/* Options for select type */}
                    {field.type === 'select' && (
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-0.5 block">
                          Options (une par ligne)
                        </label>
                        <textarea
                          value={(field.options || []).join('\n')}
                          onChange={(e) => updateField(field.id, {
                            options: e.target.value.split('\n').filter(Boolean),
                          })}
                          className="w-full rounded-md border bg-transparent px-2 py-1.5 text-[11px] min-h-[50px] resize-y"
                          placeholder="Option 1&#10;Option 2&#10;Option 3"
                        />
                      </div>
                    )}

                    {/* Required toggle */}
                    <div className="flex items-center justify-between pt-1">
                      <label className="text-[11px] text-muted-foreground">Champ obligatoire</label>
                      <Switch
                        checked={field.required}
                        onCheckedChange={(v) => updateField(field.id, { required: v })}
                        className="scale-90"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
