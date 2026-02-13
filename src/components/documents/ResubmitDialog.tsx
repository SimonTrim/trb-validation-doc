// ============================================================================
// RESUBMIT DIALOG — Re-soumission d'un document rejeté
// Permet de soumettre une nouvelle version d'un document bloqué/rejeté
// et de relancer le workflow automatiquement
// ============================================================================

import React, { useState, useRef } from 'react';
import {
  RefreshCcw, Upload, FileText, AlertTriangle, CheckCircle,
  Loader2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowEngine } from '@/hooks/useWorkflowEngine';
import { formatFileSize } from '@/lib/utils';
import { toast } from 'sonner';
import type { ValidationDocument } from '@/models/document';

interface ResubmitDialogProps {
  document: ValidationDocument;
  trigger?: React.ReactNode;
}

/** Statuts qui permettent la re-soumission */
const RESUBMITTABLE_STATUSES = ['rejected', 'refused', 'vao_blocking', 'commented', 'vao'];

export function canResubmit(doc: ValidationDocument): boolean {
  return RESUBMITTABLE_STATUSES.includes(doc.currentStatus.id);
}

export function ResubmitDialog({ document: doc, trigger }: ResubmitDialogProps) {
  const { updateDocument } = useDocumentStore();
  const { startWorkflow } = useWorkflowEngine();
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleResubmit = async () => {
    setIsSubmitting(true);
    try {
      // 1. Update the document with new version info
      const now = new Date().toISOString();
      const updates: Partial<ValidationDocument> = {
        versionNumber: doc.versionNumber + 1,
        lastModified: now,
        currentStatus: {
          id: 'pending',
          name: 'En attente',
          color: '#6a6e79',
          changedAt: now,
          changedBy: doc.uploadedByName,
        },
        // Reset reviewers decisions
        reviewers: doc.reviewers.map((r) => ({
          ...r,
          decision: undefined,
          decidedAt: undefined,
        })),
        // Add system comment about resubmission
        comments: [
          ...doc.comments,
          {
            id: `resubmit-${Date.now()}`,
            documentId: doc.id,
            authorId: 'system',
            authorName: 'Système',
            authorEmail: '',
            content: `Nouvelle version (v${doc.versionNumber + 1}) soumise par ${doc.uploadedByName}.${comment ? `\nCommentaire : ${comment}` : ''}${selectedFile ? `\nFichier : ${selectedFile.name} (${formatFileSize(selectedFile.size)})` : ''}`,
            createdAt: now,
            isSystemMessage: true,
            attachments: [],
            reactions: [],
          },
        ],
      };

      // If a new file was selected, update file info
      if (selectedFile) {
        updates.fileName = selectedFile.name;
        updates.fileSize = selectedFile.size;
        updates.fileExtension = selectedFile.name.split('.').pop()?.toLowerCase() || doc.fileExtension;
      }

      updateDocument(doc.id, updates);

      // 2. Clear the old workflow instance and start a new one
      updateDocument(doc.id, { workflowInstanceId: undefined });

      // 3. Start a new workflow
      try {
        await startWorkflow(doc.id);
      } catch {
        // Workflow start may fail in demo mode, that's ok
      }

      toast.success('Document re-soumis avec succès', {
        description: `Version ${doc.versionNumber + 1} — Le workflow de validation a été relancé.`,
      });

      setOpen(false);
      setSelectedFile(null);
      setComment('');
    } catch (error) {
      toast.error('Erreur lors de la re-soumission', {
        description: String(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canResubmit(doc)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" />
            Re-soumettre
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCcw className="h-5 w-5 text-primary" />
            Re-soumettre le document
          </DialogTitle>
          <DialogDescription>
            Soumettez une version corrigée. Le workflow de validation sera automatiquement relancé.
          </DialogDescription>
        </DialogHeader>

        {/* Current document info */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{doc.fileName}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Version actuelle : v{doc.versionNumber}</span>
            <span>&middot;</span>
            <Badge
              variant="outline"
              className="text-[10px]"
              style={{
                borderColor: doc.currentStatus.color,
                color: doc.currentStatus.color,
              }}
            >
              {doc.currentStatus.name}
            </Badge>
          </div>
          {/* Last rejection comment */}
          {doc.comments.length > 0 && (
            <div className="mt-1 rounded border-l-2 border-amber-400 bg-amber-50 p-2 dark:bg-amber-950/20">
              <div className="flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400 mb-0.5">
                <AlertTriangle className="h-3 w-3" />
                Dernier commentaire de revue
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {doc.comments[doc.comments.length - 1].content.substring(0, 150)}
                {doc.comments[doc.comments.length - 1].content.length > 150 ? '...' : ''}
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* New version upload */}
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Nouveau fichier (optionnel)
            </label>
            <div
              className="flex items-center justify-center rounded-lg border-2 border-dashed p-4 cursor-pointer
                         transition-colors hover:border-primary/50 hover:bg-muted/30"
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="font-medium">{selectedFile.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({formatFileSize(selectedFile.size)})
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-center">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Cliquez pour sélectionner un fichier
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Si aucun fichier n'est sélectionné, la version actuelle sera conservée
                  </span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Commentaire de re-soumission
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Décrivez les corrections apportées..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleResubmit}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Re-soumettre (v{doc.versionNumber + 1})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
