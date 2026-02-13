import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  FileText, Search, Filter, ChevronLeft, ChevronRight,
  ArrowUpDown, Eye, MoreVertical, Download, MessageSquare,
  UserCheck, RefreshCw, Play, GitBranch, Loader2, Tag,
  Box, Pen, X, CalendarDays, SlidersHorizontal, Trash2,
  CheckSquare, Square, MinusSquare, Upload, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { StatusBadge } from './StatusBadge';
import { DocumentLabels } from './DocumentLabelBadge';
import { LabelSelector } from './LabelSelector';
import { ResubmitDialog, canResubmit } from './ResubmitDialog';
import { useDocumentStore } from '@/stores/documentStore';
import { useLabelStore } from '@/stores/labelStore';
import { useWorkflowEngine } from '@/hooks/useWorkflowEngine';
import { openInViewer, openForAnnotation, canOpenInViewer, getViewerType } from '@/lib/viewerIntegration';
import { getFileDownloadUrl, uploadFile } from '@/api/trimbleService';
import { createValidationDocument } from '@/api/documentApiService';
import { useAuthStore } from '@/stores/authStore';
import { formatDate, formatFileSize } from '@/lib/utils';
import { toast } from 'sonner';
import type { ValidationDocument } from '@/models/document';

/** Status definitions for filter display */
const STATUS_OPTIONS = [
  { id: 'pending', name: 'En attente', color: '#6a6e79' },
  { id: 'approved', name: 'Approuvé', color: '#1e8a44' },
  { id: 'commented', name: 'Commenté', color: '#e49325' },
  { id: 'rejected', name: 'Rejeté', color: '#da212c' },
  { id: 'vao', name: 'VAO', color: '#f0c040' },
  { id: 'vao_blocking', name: 'VAO Bloquantes', color: '#d4760a' },
  { id: 'vso', name: 'VSO', color: '#4caf50' },
  { id: 'refused', name: 'Refusé', color: '#8b0000' },
];

export function DocumentList() {
  const { documents, filters, setFilters, setSelectedDocument, removeDocuments, bulkUpdateDocuments, addDocument, favoriteIds, toggleFavorite } = useDocumentStore();
  const { getAllLabels } = useLabelStore();
  const { startWorkflow, isProcessing } = useWorkflowEngine();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  // ── Drag-and-drop file handling ────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    dragCounter.current = 0;

    const { project, currentUser } = useAuthStore.getState();
    const projectId = project?.id || '';
    const userId = currentUser?.id || 'unknown';
    const userName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : 'Inconnu';
    const userEmail = currentUser?.email || '';

    const droppedFiles = Array.from(e.dataTransfer.files);

    for (const file of droppedFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const now = new Date().toISOString();

      // Try to upload to TC and register in Turso
      try {
        // Attempt to upload to TC if a source folder is configured
        // For now, create a local document entry and persist to backend
        const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const newDoc: ValidationDocument = {
          id: docId,
          fileId: `file-${Date.now()}`,
          fileName: file.name,
          fileExtension: ext,
          fileSize: file.size,
          filePath: `/${file.name}`,
          uploadedBy: userId,
          uploadedByName: userName,
          uploadedByEmail: userEmail,
          uploadedAt: now,
          lastModified: now,
          versionNumber: 1,
          projectId,
          currentStatus: { id: 'pending', name: 'En attente', color: '#6a6e79', changedAt: now, changedBy: 'Système' },
          reviewers: [],
          comments: [],
          labels: [],
          versionHistory: [{
            versionNumber: 1,
            versionId: `v-${Date.now()}`,
            fileName: file.name,
            fileSize: file.size,
            uploadedBy: userId,
            uploadedByName: userName,
            uploadedAt: now,
          }],
          metadata: {},
        };

        addDocument(newDoc);

        // Persist to backend (non-blocking)
        createValidationDocument(newDoc).catch((err) => {
          console.warn('[DocumentList] Failed to persist document:', err);
        });

        toast.success('Document ajouté', { description: `"${file.name}" est en attente de validation.` });
      } catch (err) {
        console.error('[DocumentList] Upload failed:', err);
        toast.error('Erreur d\'upload', { description: `Impossible d'uploader "${file.name}".` });
      }
    }
  }, [addDocument]);

  const allLabels = getAllLabels();

  // Status counts for quick filters
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const doc of documents) {
      counts[doc.currentStatus.id] = (counts[doc.currentStatus.id] || 0) + 1;
    }
    return counts;
  }, [documents]);

  // Filtered documents (apply label + date filters before passing to table)
  const filteredDocuments = useMemo(() => {
    let result = documents;

    // Label filter
    if (selectedLabelIds.length > 0) {
      result = result.filter((doc) =>
        doc.labels?.some((l) => selectedLabelIds.includes(l.id))
      );
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((doc) => new Date(doc.uploadedAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((doc) => new Date(doc.uploadedAt) <= to);
    }

    // Favorites filter
    if (showFavoritesOnly) {
      result = result.filter((doc) => favoriteIds.includes(doc.id));
    }

    return result;
  }, [documents, selectedLabelIds, dateFrom, dateTo, showFavoritesOnly, favoriteIds]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.statusIds && filters.statusIds.length > 0) count++;
    if (selectedLabelIds.length > 0) count++;
    if (dateFrom || dateTo) count++;
    return count;
  }, [filters.statusIds, selectedLabelIds, dateFrom, dateTo]);

  const handleClearAllFilters = useCallback(() => {
    setFilters({ search: '', statusIds: [] });
    setSelectedLabelIds([]);
    setDateFrom('');
    setDateTo('');
    setColumnFilters([]);
  }, [setFilters]);

  const toggleLabelFilter = useCallback((labelId: string) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    );
  }, []);

  const handleStartWorkflow = async (doc: ValidationDocument) => {
    if (doc.workflowInstanceId) return; // Déjà dans un workflow
    try {
      await startWorkflow(doc.id);
    } catch (err) {
      console.error('Failed to start workflow:', err);
    }
  };

  // ── Bulk actions helpers ────────────────────────────────────────────
  const selectedRowCount = Object.keys(rowSelection).length;
  const selectedDocs = useMemo(() => {
    return Object.keys(rowSelection)
      .map((idx) => filteredDocuments[Number(idx)])
      .filter(Boolean);
  }, [rowSelection, filteredDocuments]);

  const handleBulkDelete = useCallback(() => {
    const ids = selectedDocs.map((d) => d.id);
    removeDocuments(ids);
    setRowSelection({});
  }, [selectedDocs, removeDocuments]);

  const handleBulkStatusChange = useCallback((statusId: string, statusName: string, statusColor: string) => {
    const ids = selectedDocs.map((d) => d.id);
    bulkUpdateDocuments(ids, {
      currentStatus: {
        id: statusId,
        name: statusName,
        color: statusColor,
        changedAt: new Date().toISOString(),
        changedBy: 'user-1',
      },
    });
    setRowSelection({});
  }, [selectedDocs, bulkUpdateDocuments]);

  const handleBulkAddLabel = useCallback((label: { id: string; name: string; color: string }) => {
    for (const doc of selectedDocs) {
      if (!doc.labels?.some((l) => l.id === label.id)) {
        bulkUpdateDocuments([doc.id], {
          labels: [...(doc.labels || []), label],
        });
      }
    }
    setRowSelection({});
  }, [selectedDocs, bulkUpdateDocuments]);

  const columns: ColumnDef<ValidationDocument>[] = useMemo(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Tout sélectionner"
            className="translate-y-[2px]"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Sélectionner"
            className="translate-y-[2px]"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: 'fileName',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Document
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const doc = row.original;
          const isFav = favoriteIds.includes(doc.id);
          return (
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); toggleFavorite(doc.id); }}
                className="shrink-0 text-muted-foreground/40 hover:text-amber-500 transition-colors"
                title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              >
                <Star className={`h-3.5 w-3.5 ${isFav ? 'fill-amber-500 text-amber-500' : ''}`} />
              </button>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium text-sm">{doc.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatFileSize(doc.fileSize)} &middot; v{doc.versionNumber}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'currentStatus',
        header: 'Statut',
        cell: ({ row }) => {
          const status = row.original.currentStatus;
          return <StatusBadge name={status.name} color={status.color} />;
        },
        filterFn: (row, id, value) => {
          return value.includes(row.original.currentStatus.id);
        },
      },
      {
        id: 'labels',
        header: 'Labels',
        cell: ({ row }) => {
          const doc = row.original;
          return (
            <div className="flex items-center gap-1">
              <DocumentLabels labels={doc.labels || []} size="sm" max={2} />
              <LabelSelector documentId={doc.id} currentLabels={doc.labels || []} />
            </div>
          );
        },
      },
      {
        accessorKey: 'uploadedByName',
        header: 'Déposé par',
        cell: ({ row }) => {
          // Guard against uploadedByName/uploadedByEmail being objects (TC API can return user objects)
          const name = typeof row.original.uploadedByName === 'object'
            ? (row.original.uploadedByName as any)?.firstName || (row.original.uploadedByName as any)?.email || ''
            : String(row.original.uploadedByName || '');
          const email = typeof row.original.uploadedByEmail === 'object'
            ? (row.original.uploadedByEmail as any)?.email || ''
            : String(row.original.uploadedByEmail || '');
          return (
            <div className="text-sm">
              <div>{name}</div>
              {email && <div className="text-xs text-muted-foreground">{email}</div>}
            </div>
          );
        },
      },
      {
        accessorKey: 'reviewers',
        header: 'Réviseurs',
        cell: ({ row }) => {
          const reviewers = row.original.reviewers;
          if (reviewers.length === 0) {
            return <span className="text-xs text-muted-foreground">Aucun</span>;
          }
          return (
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-xs">
                <UserCheck className="mr-1 h-3 w-3" />
                {reviewers.filter((r) => r.decision).length}/{reviewers.length}
              </Badge>
            </div>
          );
        },
      },
      {
        id: 'workflow',
        header: 'Workflow',
        cell: ({ row }) => {
          const doc = row.original;
          if (!doc.workflowInstanceId) {
            return (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartWorkflow(doc);
                }}
                disabled={isProcessing}
              >
                <Play className="h-3 w-3" />
                Démarrer
              </Button>
            );
          }
          return (
            <Badge variant="outline" className="gap-1 text-xs">
              <GitBranch className="h-3 w-3" />
              Actif
            </Badge>
          );
        },
      },
      {
        accessorKey: 'uploadedAt',
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(row.original.uploadedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => {
          const doc = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedDocument(doc)}>
                  <Eye className="mr-2 h-4 w-4" />
                  Voir les détails
                </DropdownMenuItem>
                {canOpenInViewer(doc.fileExtension) && (
                  <DropdownMenuItem onClick={() => openInViewer(doc.fileId, doc.fileName, doc.projectId)}>
                    {getViewerType(doc.fileExtension) === '3d' ? (
                      <Box className="mr-2 h-4 w-4" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    {getViewerType(doc.fileExtension) === '3d' ? 'Visionneuse 3D' : 'Visionneuse 2D'}
                  </DropdownMenuItem>
                )}
                {canOpenInViewer(doc.fileExtension) && (
                  <DropdownMenuItem onClick={() => openForAnnotation(doc.fileId, doc.fileName, doc.projectId, { documentStatus: doc.currentStatus.name })}>
                    <Pen className="mr-2 h-4 w-4" />
                    Annoter le document
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={async () => {
                  try {
                    const { url } = await getFileDownloadUrl(doc.fileId);
                    if (url) window.open(url, '_blank');
                  } catch (err) {
                    console.error('[DocumentList] Download failed:', err);
                  }
                }}>
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSelectedDocument(doc)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Commenter
                </DropdownMenuItem>
                {canResubmit(doc) && (
                  <>
                    <DropdownMenuSeparator />
                    <ResubmitDialog
                      document={doc}
                      trigger={
                        <button className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground">
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Re-soumettre (v{doc.versionNumber + 1})
                        </button>
                      }
                    />
                  </>
                )}
                <DropdownMenuSeparator />
                {!doc.workflowInstanceId ? (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartWorkflow(doc);
                    }}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Démarrer un workflow
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartWorkflow(doc);
                    }}
                    disabled={isProcessing}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Relancer le workflow
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [setSelectedDocument, favoriteIds, toggleFavorite]
  );

  const table = useReactTable({
    data: filteredDocuments,
    columns,
    state: { sorting, columnFilters, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: { pageSize: 15 },
    },
  });

  return (
    <div
      className="relative space-y-4 p-6"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-primary/5 border-2 border-dashed border-primary rounded-lg backdrop-blur-sm animate-in fade-in-0 duration-150">
          <div className="flex flex-col items-center gap-3 rounded-xl bg-card/90 px-8 py-6 shadow-lg border">
            <Upload className="h-10 w-10 text-primary animate-bounce" />
            <p className="text-lg font-semibold text-primary">Déposez vos fichiers ici</p>
            <p className="text-sm text-muted-foreground">Les documents seront ajoutés en attente de validation</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Documents</h2>
          <p className="text-sm text-muted-foreground">
            {documents.length} document(s) en cours de validation
          </p>
        </div>
      </div>

      {/* Status quick filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant={!filters.statusIds || filters.statusIds.length === 0 ? 'default' : 'outline'}
          className="cursor-pointer text-xs h-7 px-2.5"
          onClick={() => {
            setFilters({ statusIds: [] });
            setShowFavoritesOnly(false);
            table.getColumn('currentStatus')?.setFilterValue(undefined);
          }}
        >
          Tous
          <span className="ml-1 text-[10px] opacity-70">{documents.length}</span>
        </Badge>
        {favoriteIds.length > 0 && (
          <Badge
            variant="outline"
            className={`cursor-pointer text-xs h-7 px-2.5 gap-1 transition-colors ${
              showFavoritesOnly ? 'bg-amber-500 text-white border-amber-500' : 'text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20'
            }`}
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
          >
            <Star className={`h-3 w-3 ${showFavoritesOnly ? 'fill-white' : 'fill-amber-500'}`} />
            Favoris
            <span className="text-[10px] opacity-70">{favoriteIds.length}</span>
          </Badge>
        )}
        {STATUS_OPTIONS.map((s) => {
          const count = statusCounts[s.id] || 0;
          if (count === 0) return null;
          const isActive = filters.statusIds?.includes(s.id);
          return (
            <Badge
              key={s.id}
              variant="outline"
              className={`cursor-pointer text-xs h-7 px-2.5 transition-colors ${
                isActive ? 'ring-2 ring-offset-1' : 'hover:bg-muted'
              }`}
              style={{
                borderColor: s.color,
                color: isActive ? '#fff' : s.color,
                backgroundColor: isActive ? s.color : 'transparent',
              }}
              onClick={() => {
                const statusIds = isActive ? [] : [s.id];
                setFilters({ statusIds });
                table.getColumn('currentStatus')?.setFilterValue(statusIds.length ? statusIds : undefined);
              }}
            >
              {s.name}
              <span className="ml-1 text-[10px] opacity-70">{count}</span>
            </Badge>
          );
        })}
      </div>

      {/* Search bar + advanced filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un document..."
            value={filters.search || ''}
            onChange={(e) => {
              setFilters({ search: e.target.value });
              table.getColumn('fileName')?.setFilterValue(e.target.value);
            }}
            className="pl-9 pr-8"
          />
          {filters.search && (
            <button
              onClick={() => {
                setFilters({ search: '' });
                table.getColumn('fileName')?.setFilterValue('');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Label filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Labels
              {selectedLabelIds.length > 0 && (
                <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[10px]">
                  {selectedLabelIds.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground px-1 mb-1.5">Filtrer par label</p>
              {allLabels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => toggleLabelFilter(label.id)}
                  className={`flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs transition-colors hover:bg-muted ${
                    selectedLabelIds.includes(label.id) ? 'bg-muted font-medium' : ''
                  }`}
                >
                  <div
                    className="h-3 w-3 rounded-sm border"
                    style={{
                      borderColor: label.color,
                      backgroundColor: selectedLabelIds.includes(label.id) ? label.color : 'transparent',
                    }}
                  />
                  {label.name}
                </button>
              ))}
              {selectedLabelIds.length > 0 && (
                <button
                  onClick={() => setSelectedLabelIds([])}
                  className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground pt-1"
                >
                  Effacer les filtres labels
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Date filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Date
              {(dateFrom || dateTo) && (
                <Badge className="ml-1 h-4 min-w-[16px] px-1 text-[10px]">1</Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <p className="text-xs font-medium text-muted-foreground mb-2">Filtrer par date de dépôt</p>
            <div className="space-y-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Du</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Au</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                >
                  Effacer les dates
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear all filters */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleClearAllFilters}
          >
            <X className="h-3.5 w-3.5" />
            Effacer ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selectedRowCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-primary/5 border-primary/20 px-4 py-2.5 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckSquare className="h-4 w-4 text-primary" />
            {selectedRowCount} document{selectedRowCount > 1 ? 's' : ''} sélectionné{selectedRowCount > 1 ? 's' : ''}
          </div>
          <div className="h-4 w-px bg-border mx-1" />

          {/* Bulk status change */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                Changer le statut
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {STATUS_OPTIONS.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onClick={() => handleBulkStatusChange(s.id, s.name, s.color)}
                >
                  <div className="mr-2 h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bulk add label */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
                <Tag className="h-3 w-3" />
                Ajouter un label
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
              {allLabels.map((label) => (
                <DropdownMenuItem
                  key={label.id}
                  onClick={() => handleBulkAddLabel(label)}
                >
                  <div
                    className="mr-2 h-3 w-3 rounded-sm border"
                    style={{ borderColor: label.color, backgroundColor: label.color + '30' }}
                  />
                  {label.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Bulk delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                <Trash2 className="h-3 w-3" />
                Supprimer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer {selectedRowCount} document{selectedRowCount > 1 ? 's' : ''} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Les documents sélectionnés seront supprimés définitivement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Supprimer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => setRowSelection({})}
          >
            Désélectionner tout
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/50">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="h-10 px-4 text-left align-middle text-xs font-medium text-muted-foreground">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedDocument(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  Aucun document trouvé
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} sur {table.getPageCount()}
          {' '}&middot;{' '}
          {table.getFilteredRowModel().rows.length} résultat(s)
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
