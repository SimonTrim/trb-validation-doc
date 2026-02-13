// ============================================================================
// DOCUMENT LABEL BADGE — Affichage des étiquettes sur les documents
// Style : bordure colorée + fond gris clair (opacité 30%)
// Similaire aux labels Trimble Connect
// ============================================================================

import React from 'react';
import type { DocumentLabel } from '@/models/document';

interface DocumentLabelBadgeProps {
  label: DocumentLabel;
  size?: 'sm' | 'md';
  removable?: boolean;
  onRemove?: () => void;
}

export function DocumentLabelBadge({
  label,
  size = 'sm',
  removable = false,
  onRemove,
}: DocumentLabelBadgeProps) {
  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[11px]'
    : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-md border font-medium
        transition-colors ${sizeClasses}
      `}
      style={{
        borderColor: label.color,
        backgroundColor: `${label.color}1A`, // ~10% opacity
        color: label.color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
      {removable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
        >
          <svg className="h-2.5 w-2.5" viewBox="0 0 8 8" fill="none">
            <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}

/** Affiche une liste de labels avec wrap */
export function DocumentLabels({
  labels,
  size = 'sm',
  max,
  removable = false,
  onRemove,
}: {
  labels: DocumentLabel[];
  size?: 'sm' | 'md';
  max?: number;
  removable?: boolean;
  onRemove?: (labelId: string) => void;
}) {
  const displayed = max ? labels.slice(0, max) : labels;
  const remaining = max ? labels.length - max : 0;

  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {displayed.map((label) => (
        <DocumentLabelBadge
          key={label.id}
          label={label}
          size={size}
          removable={removable}
          onRemove={() => onRemove?.(label.id)}
        />
      ))}
      {remaining > 0 && (
        <span className="text-[11px] text-muted-foreground">
          +{remaining}
        </span>
      )}
    </div>
  );
}
