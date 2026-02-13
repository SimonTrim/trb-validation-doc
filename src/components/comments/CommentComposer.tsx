// ============================================================================
// COMMENT COMPOSER — Zone de saisie enrichie pour les commentaires
// Supporte : texte, emojis, pièces jointes (images, fichiers, URLs)
// ============================================================================

import React, { useState, useRef } from 'react';
import {
  Send, Paperclip, Image, Link2, X, FileText, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { EmojiPicker } from './EmojiPicker';
import type { CommentAttachment } from '@/models/document';
import { generateId } from '@/lib/utils';

interface CommentComposerProps {
  onSubmit: (content: string, attachments: CommentAttachment[]) => void;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}

export function CommentComposer({
  onSubmit,
  placeholder = 'Ajouter un commentaire...',
  disabled = false,
  compact = false,
}: CommentComposerProps) {
  const [content, setContent] = useState('');
  const [attachments, setAttachments] = useState<CommentAttachment[]>([]);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlName, setUrlName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!content.trim() && attachments.length === 0) return;
    onSubmit(content.trim(), attachments);
    setContent('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInsertEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
  };

  // ── Fichiers ──────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const att: CommentAttachment = {
        id: generateId(),
        type: type === 'image' ? 'image' : 'file',
        name: file.name,
        url: URL.createObjectURL(file),
        mimeType: file.type,
        size: file.size,
      };

      if (type === 'image') {
        att.thumbnailUrl = att.url;
      }

      setAttachments((prev) => [...prev, att]);
    }

    // Reset input
    e.target.value = '';
  };

  // ── URL ───────────────────────────────────────────────────────────────

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    let url = urlInput.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    setAttachments((prev) => [
      ...prev,
      {
        id: generateId(),
        type: 'url',
        name: urlName.trim() || url,
        url,
      },
    ]);
    setUrlInput('');
    setUrlName('');
    setShowUrlInput(false);
  };

  const handleRemoveAttachment = (id: string) => {
    const att = attachments.find((a) => a.id === id);
    if (att?.url.startsWith('blob:')) URL.revokeObjectURL(att.url);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <div className="space-y-2">
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="group relative flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs"
            >
              {att.type === 'image' && att.thumbnailUrl ? (
                <img
                  src={att.thumbnailUrl}
                  alt={att.name}
                  className="h-6 w-6 rounded object-cover"
                />
              ) : att.type === 'url' ? (
                <ExternalLink className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="max-w-[120px] truncate">{att.name}</span>
              {att.size && (
                <span className="text-[10px] text-muted-foreground">
                  ({formatSize(att.size)})
                </span>
              )}
              <button
                onClick={() => handleRemoveAttachment(att.id)}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* URL input inline */}
      {showUrlInput && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
          <div className="flex-1 space-y-1.5">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/..."
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
            <Input
              value={urlName}
              onChange={(e) => setUrlName(e.target.value)}
              placeholder="Nom du lien (optionnel)"
              className="h-7 text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={handleAddUrl}>
              Ajouter
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setShowUrlInput(false);
                setUrlInput('');
                setUrlName('');
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Main input area */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={compact ? 2 : 3}
            className="resize-none"
            disabled={disabled}
          />

          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              {/* Emoji picker */}
              <EmojiPicker onSelect={handleInsertEmoji} />

              {/* Image upload */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                type="button"
                onClick={() => imageInputRef.current?.click()}
              >
                <Image className="h-4 w-4 text-muted-foreground" />
              </Button>

              {/* File upload */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </Button>

              {/* URL link */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                type="button"
                onClick={() => setShowUrlInput(!showUrlInput)}
              >
                <Link2 className="h-4 w-4 text-muted-foreground" />
              </Button>

              {attachments.length > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {attachments.length} pièce(s) jointe(s)
                </span>
              )}
            </div>

            <span className="text-[10px] text-muted-foreground">
              Ctrl+Entrée pour envoyer
            </span>
          </div>
        </div>

        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={disabled || (!content.trim() && attachments.length === 0)}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'image')}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'file')}
      />
    </div>
  );
}
