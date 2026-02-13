import React, { useState, useMemo } from 'react';
import {
  ArrowLeftRight, FileText, Calendar, User, HardDrive,
  MessageSquare, ArrowRight, ChevronDown, Check, X as XIcon,
  GitCompare, Equal, Plus, Minus,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, formatDate, formatFileSize } from '@/lib/utils';
import type { DocumentVersion } from '@/models/document';

interface VersionCompareProps {
  versions: DocumentVersion[];
  currentVersionNumber: number;
  trigger?: React.ReactNode;
}

interface ComparisonField {
  label: string;
  icon: React.ReactNode;
  leftValue: string;
  rightValue: string;
  isDifferent: boolean;
}

export function VersionCompare({ versions, currentVersionNumber, trigger }: VersionCompareProps) {
  const [open, setOpen] = useState(false);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => b.versionNumber - a.versionNumber),
    [versions]
  );

  // Default: compare latest two versions
  const [leftVersionNum, setLeftVersionNum] = useState<number>(() => {
    if (sortedVersions.length >= 2) return sortedVersions[1].versionNumber;
    return sortedVersions[0]?.versionNumber || 1;
  });
  const [rightVersionNum, setRightVersionNum] = useState<number>(() => {
    return sortedVersions[0]?.versionNumber || 1;
  });

  const leftVersion = versions.find((v) => v.versionNumber === leftVersionNum);
  const rightVersion = versions.find((v) => v.versionNumber === rightVersionNum);

  const comparisons = useMemo<ComparisonField[]>(() => {
    if (!leftVersion || !rightVersion) return [];

    return [
      {
        label: 'Nom du fichier',
        icon: <FileText className="h-3.5 w-3.5" />,
        leftValue: leftVersion.fileName,
        rightValue: rightVersion.fileName,
        isDifferent: leftVersion.fileName !== rightVersion.fileName,
      },
      {
        label: 'Taille',
        icon: <HardDrive className="h-3.5 w-3.5" />,
        leftValue: formatFileSize(leftVersion.fileSize),
        rightValue: formatFileSize(rightVersion.fileSize),
        isDifferent: leftVersion.fileSize !== rightVersion.fileSize,
      },
      {
        label: 'Déposé par',
        icon: <User className="h-3.5 w-3.5" />,
        leftValue: leftVersion.uploadedByName,
        rightValue: rightVersion.uploadedByName,
        isDifferent: leftVersion.uploadedByName !== rightVersion.uploadedByName,
      },
      {
        label: 'Date',
        icon: <Calendar className="h-3.5 w-3.5" />,
        leftValue: formatDate(leftVersion.uploadedAt),
        rightValue: formatDate(rightVersion.uploadedAt),
        isDifferent: leftVersion.uploadedAt !== rightVersion.uploadedAt,
      },
      {
        label: 'Commentaire',
        icon: <MessageSquare className="h-3.5 w-3.5" />,
        leftValue: leftVersion.comment || '—',
        rightValue: rightVersion.comment || '—',
        isDifferent: (leftVersion.comment || '') !== (rightVersion.comment || ''),
      },
    ];
  }, [leftVersion, rightVersion]);

  const changesCount = comparisons.filter((c) => c.isDifferent).length;

  const sizeDiff = useMemo(() => {
    if (!leftVersion || !rightVersion) return 0;
    return rightVersion.fileSize - leftVersion.fileSize;
  }, [leftVersion, rightVersion]);

  if (versions.length < 2) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <GitCompare className="h-3.5 w-3.5" />
            Comparer les versions
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Comparaison de versions
          </DialogTitle>
          <DialogDescription>
            Comparez deux versions côte à côte pour voir les changements
          </DialogDescription>
        </DialogHeader>

        {/* Version selectors */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Version ancienne</label>
            <Select
              value={String(leftVersionNum)}
              onValueChange={(v) => setLeftVersionNum(Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortedVersions.map((v) => (
                  <SelectItem key={v.versionNumber} value={String(v.versionNumber)}>
                    v{v.versionNumber} — {v.fileName}
                    {v.versionNumber === currentVersionNumber && ' (actuelle)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end pb-1">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Version récente</label>
            <Select
              value={String(rightVersionNum)}
              onValueChange={(v) => setRightVersionNum(Number(v))}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortedVersions.map((v) => (
                  <SelectItem key={v.versionNumber} value={String(v.versionNumber)}>
                    v{v.versionNumber} — {v.fileName}
                    {v.versionNumber === currentVersionNumber && ' (actuelle)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1 text-xs">
            {changesCount === 0 ? (
              <><Equal className="h-3 w-3" /> Identique</>
            ) : (
              <><ArrowLeftRight className="h-3 w-3" /> {changesCount} différence{changesCount > 1 ? 's' : ''}</>
            )}
          </Badge>
          {sizeDiff !== 0 && (
            <Badge
              variant="outline"
              className={cn(
                'gap-1 text-xs',
                sizeDiff > 0 ? 'text-green-600 border-green-200' : 'text-red-600 border-red-200'
              )}
            >
              {sizeDiff > 0 ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {sizeDiff > 0 ? '+' : ''}{formatFileSize(Math.abs(sizeDiff))}
            </Badge>
          )}
        </div>

        <Separator />

        {/* Comparison table */}
        <ScrollArea className="flex-1 max-h-[400px]">
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[160px_1fr_1fr] gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
              <span>Propriété</span>
              <span>v{leftVersionNum}</span>
              <span>v{rightVersionNum}</span>
            </div>

            {/* Rows */}
            {comparisons.map((field) => (
              <div
                key={field.label}
                className={cn(
                  'grid grid-cols-[160px_1fr_1fr] gap-2 px-3 py-2.5 rounded-md text-sm transition-colors',
                  field.isDifferent ? 'bg-amber-50 dark:bg-amber-950/20' : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2 text-muted-foreground font-medium text-xs">
                  {field.icon}
                  {field.label}
                </div>
                <div className={cn(
                  'break-words',
                  field.isDifferent && 'text-red-600 dark:text-red-400 line-through opacity-60'
                )}>
                  {field.leftValue}
                </div>
                <div className={cn(
                  'break-words',
                  field.isDifferent && 'text-green-600 dark:text-green-400 font-medium'
                )}>
                  {field.rightValue}
                  {field.isDifferent && (
                    <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0 border-amber-300 text-amber-600">
                      modifié
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
