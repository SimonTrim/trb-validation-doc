import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Search, FileText, GitBranch, MessageSquare, Tag, ArrowRight, X, Clock, UserCheck, LayoutDashboard } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAppStore, type AppView } from '@/stores/appStore';
import { cn } from '@/lib/utils';

interface SearchResult {
  id: string;
  type: 'document' | 'workflow' | 'comment' | 'instance';
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  view: AppView;
  data?: unknown;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { documents, setSelectedDocument } = useDocumentStore();
  const { definitions, instances } = useWorkflowStore();
  const { setCurrentView } = useAppStore();

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Build search results
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show quick nav when no query
      return [
        { id: 'nav-dashboard', type: 'document' as const, title: 'Dashboard', subtitle: 'Tableau de bord', icon: <LayoutDashboard className="h-4 w-4" />, view: 'dashboard' as const },
        { id: 'nav-documents', type: 'document' as const, title: 'Documents', subtitle: 'Liste des documents', icon: <FileText className="h-4 w-4" />, view: 'documents' as const },
        { id: 'nav-workflows', type: 'workflow' as const, title: 'Workflows', subtitle: 'Gestion des workflows', icon: <GitBranch className="h-4 w-4" />, view: 'workflow-list' as const },
        { id: 'nav-visas', type: 'instance' as const, title: 'Visas', subtitle: 'Visa et revues', icon: <UserCheck className="h-4 w-4" />, view: 'visa' as const },
        { id: 'nav-history', type: 'document' as const, title: 'Historique', subtitle: 'Activité récente', icon: <Clock className="h-4 w-4" />, view: 'history' as const },
      ];
    }

    const items: SearchResult[] = [];

    // Search documents
    for (const doc of documents) {
      if (
        doc.fileName.toLowerCase().includes(q) ||
        doc.currentStatus.name.toLowerCase().includes(q) ||
        doc.uploadedByName.toLowerCase().includes(q) ||
        (doc.labels || []).some((l) => l.name.toLowerCase().includes(q)) ||
        Object.values(doc.metadata).some((v) => v.toLowerCase().includes(q))
      ) {
        items.push({
          id: `doc-${doc.id}`,
          type: 'document',
          title: doc.fileName,
          subtitle: `${doc.currentStatus.name} — ${doc.uploadedByName}`,
          icon: <FileText className="h-4 w-4 text-blue-500" />,
          view: 'documents',
          data: doc,
        });
      }
    }

    // Search workflow definitions
    for (const wf of definitions) {
      if (
        wf.name.toLowerCase().includes(q) ||
        (wf.description || '').toLowerCase().includes(q)
      ) {
        items.push({
          id: `wf-${wf.id}`,
          type: 'workflow',
          title: wf.name,
          subtitle: wf.description || 'Workflow',
          icon: <GitBranch className="h-4 w-4 text-purple-500" />,
          view: 'workflow-list',
          data: wf,
        });
      }
    }

    // Search workflow instances
    for (const inst of instances) {
      if (
        inst.documentName.toLowerCase().includes(q) ||
        inst.currentStepName?.toLowerCase().includes(q)
      ) {
        items.push({
          id: `inst-${inst.id}`,
          type: 'instance',
          title: inst.documentName,
          subtitle: `Instance — ${inst.currentStepName || inst.status}`,
          icon: <UserCheck className="h-4 w-4 text-green-500" />,
          view: 'visa',
          data: inst,
        });
      }
    }

    // Search comments
    for (const doc of documents) {
      for (const comment of doc.comments || []) {
        if (comment.content.toLowerCase().includes(q)) {
          items.push({
            id: `comment-${doc.id}-${comment.id}`,
            type: 'comment',
            title: `Commentaire sur ${doc.fileName}`,
            subtitle: comment.content.length > 80 ? comment.content.slice(0, 80) + '…' : comment.content,
            icon: <MessageSquare className="h-4 w-4 text-amber-500" />,
            view: 'documents',
            data: doc,
          });
        }
      }
    }

    return items.slice(0, 20);
  }, [query, documents, definitions, instances]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  // Handle keyboard nav in results
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex]);
      }
    },
    [results, selectedIndex]
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = resultsRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      setCurrentView(result.view);
      if (result.type === 'document' || result.type === 'comment') {
        const doc = result.data as import('@/models/document').ValidationDocument;
        if (doc?.id) setTimeout(() => setSelectedDocument(doc), 100);
      }
    },
    [setCurrentView, setSelectedDocument]
  );

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const r of results) {
      const key =
        !query.trim()
          ? 'Navigation rapide'
          : r.type === 'document'
            ? 'Documents'
            : r.type === 'workflow'
              ? 'Workflows'
              : r.type === 'comment'
                ? 'Commentaires'
                : 'Instances';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    }
    return groups;
  }, [results, query]);

  let globalIdx = -1;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Rechercher…</span>
        <kbd className="ml-2 hidden rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline-block">
          Ctrl+K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden [&>button]:hidden">
          {/* Search input */}
          <div className="flex items-center border-b px-4">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher documents, workflows, commentaires…"
              className="flex-1 bg-transparent py-3 px-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Results */}
          <div ref={resultsRef} className="max-h-[360px] overflow-y-auto py-2">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Aucun résultat pour « {query} »</p>
              </div>
            ) : (
              Object.entries(groupedResults).map(([group, items]) => (
                <div key={group}>
                  <div className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group}
                  </div>
                  {items.map((item) => {
                    globalIdx++;
                    const idx = globalIdx;
                    return (
                      <button
                        key={item.id}
                        data-index={idx}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors',
                          selectedIndex === idx
                            ? 'bg-primary/10 text-foreground'
                            : 'text-foreground/80 hover:bg-muted'
                        )}
                      >
                        <div className="shrink-0">{item.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        </div>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><kbd className="rounded border px-1 font-mono">↑↓</kbd> naviguer</span>
            <span className="flex items-center gap-1"><kbd className="rounded border px-1 font-mono">↵</kbd> ouvrir</span>
            <span className="flex items-center gap-1"><kbd className="rounded border px-1 font-mono">esc</kbd> fermer</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
