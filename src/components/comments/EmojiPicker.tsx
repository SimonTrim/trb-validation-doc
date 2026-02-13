// ============================================================================
// EMOJI PICKER — Sélecteur d'emojis simple et léger (pas de dépendance externe)
// ============================================================================

import React, { useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';

const EMOJI_CATEGORIES = [
  {
    name: 'Fréquents',
    emojis: ['👍', '👎', '❤️', '😀', '😂', '🎉', '🔥', '👀', '✅', '❌', '⚠️', '💡'],
  },
  {
    name: 'Visages',
    emojis: ['😊', '😄', '😁', '🤩', '😎', '🤔', '😐', '😕', '😟', '😢', '😤', '🤯'],
  },
  {
    name: 'Gestes',
    emojis: ['👍', '👎', '👏', '🤝', '✋', '🙌', '💪', '🫡', '🤞', '✌️', '🫶', '👋'],
  },
  {
    name: 'Symboles',
    emojis: ['✅', '❌', '⚠️', '🔴', '🟢', '🔵', '⭐', '💯', '🏗️', '📐', '🔧', '📋'],
  },
  {
    name: 'BIM/Construction',
    emojis: ['🏗️', '🏠', '🧱', '🔩', '⚙️', '📐', '📏', '🔧', '🪛', '🔨', '💡', '🔌'],
  },
  {
    name: 'Documents',
    emojis: ['📄', '📁', '📎', '📝', '✏️', '🖊️', '📌', '🗂️', '📊', '📈', '🗓️', '📋'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger?: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function EmojiPicker({ onSelect, trigger, side = 'top' }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  const handleSelectEmoji = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="icon" className="h-8 w-8" type="button">
            <Smile className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} className="w-[280px] p-2" align="start">
        {/* Category tabs */}
        <div className="flex gap-1 border-b pb-1.5 mb-1.5 overflow-x-auto">
          {EMOJI_CATEGORIES.map((cat, i) => (
            <button
              key={cat.name}
              onClick={() => setActiveCategory(i)}
              className={`
                shrink-0 rounded px-2 py-0.5 text-[10px] font-medium transition-colors
                ${activeCategory === i
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'}
              `}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Emoji grid */}
        <div className="grid grid-cols-6 gap-0.5">
          {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              onClick={() => handleSelectEmoji(emoji)}
              className="flex h-9 w-9 items-center justify-center rounded text-lg
                         transition-colors hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Emojis rapides pour les réactions */
export const QUICK_REACTIONS = ['👍', '❤️', '🎉', '😀', '👀', '✅', '⚠️', '🔧'];

export function QuickReactionPicker({
  onSelect,
  existingReactions,
}: {
  onSelect: (emoji: string) => void;
  existingReactions?: string[];
}) {
  return (
    <div className="flex items-center gap-0.5">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className={`
            flex h-7 w-7 items-center justify-center rounded text-sm
            transition-all hover:bg-muted hover:scale-110
            ${existingReactions?.includes(emoji) ? 'bg-muted' : ''}
          `}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
