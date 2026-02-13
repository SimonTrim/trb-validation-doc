// ============================================================================
// DOCUMENT DETAIL — Panneau de propriétés du document (Sheet)
// Labels, métadonnées, visas, commentaires enrichis avec émojis/PJ/réactions
// ============================================================================

import React, { useState, useCallback } from 'react';
import {
  FileText, Download, Clock, User, UserCheck, Calendar,
  FolderOpen, History, Eye, Box, Pen, GitCommit, ArrowUpRight,
} from 'lucide-react';
import { getFileDownloadUrl } from '@/api/trimbleService';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from './StatusBadge';
import { DocumentLabels } from './DocumentLabelBadge';
import { LabelSelector } from './LabelSelector';
import { CommentComposer } from '@/components/comments/CommentComposer';
import { CommentItem } from '@/components/comments/CommentItem';
import { ResubmitDialog, canResubmit } from './ResubmitDialog';
import { VersionCompare } from './VersionCompare';
import { AuditTrail } from './AuditTrail';
import { DocumentPrintView } from './DocumentPrintView';
import { useDocumentStore } from '@/stores/documentStore';
import { useAuthStore } from '@/stores/authStore';
import { openInViewer, openForAnnotation, canOpenInViewer, getViewerType } from '@/lib/viewerIntegration';
import { createDocumentComment } from '@/api/documentApiService';
import { updateValidationDocument, updateDocumentLabels } from '@/api/documentApiService';
import { formatDate, formatDateTime, formatFileSize, generateId } from '@/lib/utils';
import type { CommentAttachment, CommentReaction, DocumentComment, DocumentVersion } from '@/models/document';

export function DocumentDetail() {
  const { selectedDocument, isDetailOpen, setSelectedDocument, updateDocument } = useDocumentStore();

  if (!selectedDocument) return null;

  const doc = selectedDocument;

  const handleClose = () => {
    setSelectedDocument(null);
  };

  // ── Téléchargement ──────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    if (!doc.fileId) return;
    try {
      const { url } = await getFileDownloadUrl(doc.fileId);
      if (url) {
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error('[DocumentDetail] Download failed:', err);
    }
  }, [doc.fileId, doc.fileName]);

  // ── Commentaires ────────────────────────────────────────────────────

  const handleSendComment = (content: string, attachments: CommentAttachment[]) => {
    const { currentUser } = useAuthStore.getState();
    const authorId = currentUser?.id || 'unknown';
    const authorName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Utilisateur';
    const authorEmail = currentUser?.email || '';

    const newComment: DocumentComment = {
      id: generateId(),
      documentId: doc.id,
      authorId,
      authorName,
      authorEmail,
      content,
      createdAt: new Date().toISOString(),
      isSystemMessage: false,
      attachments,
      reactions: [],
    };

    updateDocument(doc.id, {
      comments: [...doc.comments, newComment],
    });

    // Persist to backend (non-blocking)
    createDocumentComment(doc.id, newComment).catch((err) => {
      console.warn('[DocumentDetail] Failed to persist comment:', err);
    });
  };

  const handleReplyComment = (parentId: string, content: string) => {
    const { currentUser } = useAuthStore.getState();
    const authorId = currentUser?.id || 'unknown';
    const authorName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Utilisateur';
    const authorEmail = currentUser?.email || '';

    const reply: DocumentComment = {
      id: generateId(),
      documentId: doc.id,
      authorId,
      authorName,
      authorEmail,
      content,
      createdAt: new Date().toISOString(),
      parentId,
      isSystemMessage: false,
      attachments: [],
      reactions: [],
    };

    updateDocument(doc.id, {
      comments: [...doc.comments, reply],
    });

    // Persist to backend (non-blocking)
    createDocumentComment(doc.id, reply).catch((err) => {
      console.warn('[DocumentDetail] Failed to persist reply:', err);
    });
  };

  // Group comments into threads
  const rootComments = doc.comments.filter((c) => !c.parentId);
  const repliesByParent = doc.comments.reduce<Record<string, DocumentComment[]>>((acc, c) => {
    if (c.parentId) {
      if (!acc[c.parentId]) acc[c.parentId] = [];
      acc[c.parentId].push(c);
    }
    return acc;
  }, {});

  // ── Réactions ─────────────────────────────────────────────────────────

  const handleReaction = (commentId: string, emoji: string) => {
    const { currentUser } = useAuthStore.getState();
    const currentUserId = currentUser?.id || 'unknown';
    const currentUserName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Utilisateur';

    const updatedComments = doc.comments.map((c) => {
      if (c.id !== commentId) return c;

      const reactions = [...(c.reactions || [])];
      const existing = reactions.find((r) => r.emoji === emoji);

      if (existing) {
        const hasReacted = existing.users.some((u) => u.userId === currentUserId);
        if (hasReacted) {
          // Remove user's reaction
          existing.users = existing.users.filter((u) => u.userId !== currentUserId);
          if (existing.users.length === 0) {
            return { ...c, reactions: reactions.filter((r) => r.emoji !== emoji) };
          }
        } else {
          // Add user's reaction
          existing.users.push({ userId: currentUserId, userName: currentUserName });
        }
      } else {
        // New reaction
        reactions.push({
          emoji,
          users: [{ userId: currentUserId, userName: currentUserName }],
        });
      }

      return { ...c, reactions };
    });

    updateDocument(doc.id, { comments: updatedComments });
  };

  // ── Visionneuse ───────────────────────────────────────────────────────

  const handleOpenViewer = () => {
    openInViewer(doc.fileId, doc.fileName, doc.projectId);
  };

  const handleAnnotate = () => {
    openForAnnotation(doc.fileId, doc.fileName, doc.projectId, {
      documentStatus: doc.currentStatus.name,
    });
  };

  return (
    <Sheet open={isDetailOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg !p-0 h-full flex flex-col overflow-hidden">
        {/* Header — fixed, shrinks to fit */}
        <SheetHeader className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base truncate">{doc.fileName}</SheetTitle>
              <SheetDescription>
                {formatFileSize(doc.fileSize)} &middot; Version {doc.versionNumber}
              </SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <StatusBadge
              name={doc.currentStatus.name}
              color={doc.currentStatus.color}
              pulse={!['approved', 'rejected', 'refused', 'vso'].includes(doc.currentStatus.id)}
            />
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Télécharger
            </Button>
            {canOpenInViewer(doc.fileExtension) && (
              <Button variant="outline" size="sm" onClick={handleOpenViewer}>
                {getViewerType(doc.fileExtension) === '3d' ? (
                  <Box className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                )}
                Ouvrir
              </Button>
            )}
            {canOpenInViewer(doc.fileExtension) && (
              <Button variant="outline" size="sm" onClick={handleAnnotate}>
                <Pen className="mr-1.5 h-3.5 w-3.5" />
                Annoter
              </Button>
            )}
            {canResubmit(doc) && (
              <ResubmitDialog document={doc} />
            )}
            <AuditTrail document={doc} />
            <DocumentPrintView document={doc} />
          </div>
        </SheetHeader>

        <Separator className="shrink-0" />

        {/* Tabs — fills remaining height */}
        <Tabs defaultValue="info" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="mx-6 mt-4 mb-0 grid w-[calc(100%-48px)] grid-cols-4 shrink-0">
            <TabsTrigger value="info" className="text-xs">Infos</TabsTrigger>
            <TabsTrigger value="reviews" className="text-xs">
              Visas ({doc.reviewers.length})
            </TabsTrigger>
            <TabsTrigger value="comments" className="text-xs">
              Commentaires ({doc.comments.length})
            </TabsTrigger>
            <TabsTrigger value="versions" className="text-xs">
              Versions ({doc.versionHistory?.length || doc.versionNumber})
            </TabsTrigger>
          </TabsList>

          {/* ── Info tab ─────────────────────────────────────────────────── */}
          <TabsContent value="info" className="flex-1 min-h-0 overflow-auto mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-4 px-6 py-4">
                {/* File info */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Informations
                  </h4>
                  <div className="grid gap-3">
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Déposé par</div>
                        <div className="text-sm font-medium">{doc.uploadedByName}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Date de dépôt</div>
                        <div className="text-sm font-medium">{formatDateTime(doc.uploadedAt)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Emplacement</div>
                        <div className="text-sm font-medium">{doc.filePath}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-xs text-muted-foreground">Dernière modification</div>
                        <div className="text-sm font-medium">{formatDateTime(doc.lastModified)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Workflow progress */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Progression du workflow
                  </h4>
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Statut changé le {formatDateTime(doc.currentStatus.changedAt)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Par {doc.currentStatus.changedBy}
                  </div>
                </div>

                {/* Metadata */}
                {Object.keys(doc.metadata).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Métadonnées
                      </h4>
                      {Object.entries(doc.metadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{key}</span>
                          <span className="font-medium">{value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* ── Labels section ────────────────────────────────────── */}
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Labels
                    </h4>
                    <LabelSelector documentId={doc.id} currentLabels={doc.labels || []} />
                  </div>
                  {(doc.labels && doc.labels.length > 0) ? (
                    <DocumentLabels
                      labels={doc.labels}
                      size="md"
                      removable
                      onRemove={(labelId) => {
                        const newLabels = (doc.labels || []).filter((l) => l.id !== labelId);
                        updateDocument(doc.id, { labels: newLabels });
                        // Persist to backend (non-blocking)
                        updateDocumentLabels(doc.id, newLabels).catch((err) => {
                          console.warn('[DocumentDetail] Failed to persist label removal:', err);
                        });
                      }}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground italic">
                      Aucun label. Cliquez sur « Labels » pour en ajouter.
                    </p>
                  )}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Reviews tab ──────────────────────────────────────────────── */}
          <TabsContent value="reviews" className="flex-1 min-h-0 overflow-auto mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1">
              <div className="space-y-3 px-6 py-4">
                {doc.reviewers.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <UserCheck className="mb-2 h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Aucun réviseur assigné</p>
                  </div>
                ) : (
                  doc.reviewers.map((reviewer) => (
                    <div
                      key={reviewer.userId}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {reviewer.userName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{reviewer.userName}</div>
                          <div className="text-xs text-muted-foreground">{reviewer.role}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {reviewer.decision ? (
                          <Badge variant="outline" className="text-xs">
                            {reviewer.decision}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <Clock className="mr-1 h-3 w-3" />
                            En attente
                          </Badge>
                        )}
                        {reviewer.decidedAt && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            {formatDate(reviewer.decidedAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Comments tab ─────────────────────────────────────────────── */}
          <TabsContent value="comments" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-3 px-6 py-4">
                {rootComments.length === 0 ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <svg className="mb-2 h-8 w-8 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                    </svg>
                    <p className="text-sm text-muted-foreground">Aucun commentaire</p>
                  </div>
                ) : (
                  rootComments.map((comment) => (
                    <CommentItem
                      key={comment.id}
                      comment={comment}
                      replies={repliesByParent[comment.id] || []}
                      currentUserId="user-1"
                      currentUserName="Utilisateur courant"
                      onReaction={handleReaction}
                      onReply={handleReplyComment}
                    />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Comment composer */}
            <div className="border-t p-4 shrink-0">
              <CommentComposer
                onSubmit={handleSendComment}
                compact
              />
            </div>
          </TabsContent>

          {/* ── Versions tab ──────────────────────────────────────────────── */}
          <TabsContent value="versions" className="flex-1 min-h-0 overflow-auto mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ScrollArea className="flex-1">
              <div className="px-6 py-4">
                {/* Compare button */}
                {doc.versionHistory && doc.versionHistory.length >= 2 && (
                  <div className="mb-4">
                    <VersionCompare
                      versions={doc.versionHistory}
                      currentVersionNumber={doc.versionNumber}
                    />
                  </div>
                )}
                <div className="space-y-0">
                  {(doc.versionHistory && doc.versionHistory.length > 0
                    ? [...doc.versionHistory].sort((a, b) => b.versionNumber - a.versionNumber)
                    : [{ versionNumber: doc.versionNumber, versionId: doc.versionId || '', fileName: doc.fileName, fileSize: doc.fileSize, uploadedBy: doc.uploadedBy, uploadedByName: doc.uploadedByName, uploadedAt: doc.uploadedAt }]
                  ).map((ver, idx, arr) => {
                    const isCurrent = ver.versionNumber === doc.versionNumber;
                    const isFirst = idx === arr.length - 1;

                    return (
                      <div key={ver.versionNumber} className="relative flex gap-3">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center">
                          <div className={`h-4 w-4 rounded-full border-2 shrink-0 z-10 ${
                            isCurrent
                              ? 'bg-primary border-primary'
                              : 'bg-background border-muted-foreground/30'
                          }`}>
                            {isCurrent && (
                              <div className="h-full w-full flex items-center justify-center">
                                <GitCommit className="h-2.5 w-2.5 text-primary-foreground" />
                              </div>
                            )}
                          </div>
                          {!isFirst && (
                            <div className="w-0.5 flex-1 bg-muted-foreground/15 min-h-[16px]" />
                          )}
                        </div>

                        {/* Content */}
                        <div className={`flex-1 pb-4 ${isFirst ? '' : ''}`}>
                          <div className={`rounded-lg border p-3 ${
                            isCurrent ? 'border-primary/30 bg-primary/5' : 'bg-card'
                          }`}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">
                                    v{ver.versionNumber}
                                  </span>
                                  {isCurrent && (
                                    <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                                      Actuelle
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {ver.fileName}
                                </p>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {formatFileSize(ver.fileSize)}
                              </span>
                            </div>

                            {ver.comment && (
                              <p className="mt-2 text-xs text-foreground/80 bg-muted/50 rounded px-2 py-1.5 italic">
                                &ldquo;{ver.comment}&rdquo;
                              </p>
                            )}

                            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {ver.uploadedByName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDateTime(ver.uploadedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
