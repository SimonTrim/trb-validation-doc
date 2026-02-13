// ============================================================================
// COMMENT ITEM — Affichage d'un commentaire avec réactions, PJ et threads
// ============================================================================

import React, { useState } from 'react';
import {
  ExternalLink, FileText, Image, SmilePlus, Download,
  Reply, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuickReactionPicker } from './EmojiPicker';
import { CommentComposer } from './CommentComposer';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from '@/components/ui/tooltip';
import type { DocumentComment, CommentReaction } from '@/models/document';
import { formatDateTime } from '@/lib/utils';

interface CommentItemProps {
  comment: DocumentComment;
  replies?: DocumentComment[];
  currentUserId?: string;
  currentUserName?: string;
  onReaction: (commentId: string, emoji: string) => void;
  onReply?: (parentId: string, content: string, attachments?: any[]) => void;
  depth?: number;
}

export function CommentItem({
  comment,
  replies = [],
  currentUserId = 'user-1',
  currentUserName = 'Utilisateur',
  onReaction,
  onReply,
  depth = 0,
}: CommentItemProps) {
  const [showReactions, setShowReactions] = useState(false);
  const [showReplyComposer, setShowReplyComposer] = useState(false);
  const [showReplies, setShowReplies] = useState(true);

  const handleToggleReaction = (emoji: string) => {
    onReaction(comment.id, emoji);
  };

  const handleReply = (content: string, attachments?: any[]) => {
    if (onReply) {
      onReply(comment.id, content, attachments);
      setShowReplyComposer(false);
    }
  };

  const existingEmojis = (comment.reactions || []).map((r) => r.emoji);
  const maxDepth = 3;

  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-muted pl-3' : ''}>
      <div
        className={`group rounded-lg border p-3 transition-colors hover:border-muted-foreground/20
          ${comment.isSystemMessage ? 'bg-muted/50 border-dashed' : ''}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!comment.isSystemMessage && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {comment.authorName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs font-medium">
              {comment.isSystemMessage ? '⚙️ Système' : comment.authorName}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {formatDateTime(comment.createdAt)}
          </span>
        </div>

        {/* Content */}
        <p className="mt-1.5 text-sm whitespace-pre-wrap">{comment.content}</p>

        {/* Attachments */}
        {comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {comment.attachments.map((att) => (
              <div key={att.id}>
                {att.type === 'image' && att.thumbnailUrl ? (
                  <div className="mt-1">
                    <img
                      src={att.thumbnailUrl}
                      alt={att.name}
                      className="max-h-32 rounded-md border object-cover cursor-pointer hover:opacity-90"
                      onClick={() => window.open(att.url || att.thumbnailUrl, '_blank')}
                    />
                    <span className="text-[10px] text-muted-foreground">{att.name}</span>
                  </div>
                ) : att.type === 'url' ? (
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50
                               px-2.5 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-100
                               dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {att.name}
                  </a>
                ) : (
                  <div className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2.5 py-1 text-xs">
                    <FileText className="h-3 w-3 text-muted-foreground" />
                    <span>{att.name}</span>
                    {att.size && (
                      <span className="text-muted-foreground">
                        ({att.size < 1024 * 1024
                          ? `${(att.size / 1024).toFixed(1)} Ko`
                          : `${(att.size / (1024 * 1024)).toFixed(1)} Mo`}
                        )
                      </span>
                    )}
                    <button className="ml-0.5 text-muted-foreground hover:text-foreground">
                      <Download className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions + Reply button */}
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <TooltipProvider delayDuration={200}>
            {(comment.reactions || []).map((reaction) => (
              <Tooltip key={reaction.emoji}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleToggleReaction(reaction.emoji)}
                    className={`
                      inline-flex items-center gap-1 rounded-full border px-2 py-0.5
                      text-xs transition-all hover:scale-105
                      ${reaction.users.some((u) => u.userId === currentUserId)
                        ? 'border-primary/50 bg-primary/10'
                        : 'border-muted-foreground/20 bg-muted/30 hover:border-muted-foreground/40'}
                    `}
                  >
                    <span className="text-sm">{reaction.emoji}</span>
                    <span className="font-medium text-muted-foreground">
                      {reaction.users.length}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {reaction.users.map((u) => u.userName).join(', ')}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>

          {/* Add reaction button */}
          {!comment.isSystemMessage && (
            <Popover open={showReactions} onOpenChange={setShowReactions}>
              <PopoverTrigger asChild>
                <button
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed
                             border-muted-foreground/20 text-muted-foreground opacity-0 transition-all
                             group-hover:opacity-100 hover:bg-muted hover:border-muted-foreground/40"
                >
                  <SmilePlus className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-auto p-2" align="start">
                <QuickReactionPicker
                  onSelect={(emoji) => {
                    handleToggleReaction(emoji);
                    setShowReactions(false);
                  }}
                  existingReactions={existingEmojis}
                />
              </PopoverContent>
            </Popover>
          )}

          {/* Reply button */}
          {!comment.isSystemMessage && onReply && depth < maxDepth && (
            <button
              onClick={() => setShowReplyComposer(!showReplyComposer)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]
                         text-muted-foreground opacity-0 transition-all
                         group-hover:opacity-100 hover:bg-muted hover:text-foreground"
            >
              <Reply className="h-3 w-3" />
              Répondre
            </button>
          )}
        </div>
      </div>

      {/* Reply composer */}
      {showReplyComposer && (
        <div className="mt-2 ml-4 border-l-2 border-primary/30 pl-3">
          <p className="text-[10px] text-muted-foreground mb-1">
            Réponse à {comment.authorName}
          </p>
          <CommentComposer
            onSubmit={handleReply}
            compact
            placeholder={`Répondre à ${comment.authorName}…`}
          />
          <button
            onClick={() => setShowReplyComposer(false)}
            className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Replies */}
      {replies.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors mb-1"
          >
            {showReplies ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {replies.length} réponse{replies.length > 1 ? 's' : ''}
          </button>
          {showReplies && (
            <div className="space-y-2">
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  replies={[]} // No deeper nesting for now
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  onReaction={onReaction}
                  onReply={depth < maxDepth - 1 ? onReply : undefined}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
