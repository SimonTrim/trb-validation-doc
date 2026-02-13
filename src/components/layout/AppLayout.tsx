import React, { useMemo } from 'react';
import { FileText, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { AppSidebar } from './AppSidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkflowNotifications } from '@/hooks/useWorkflowNotifications';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { GlobalSearch } from '@/components/search/GlobalSearch';
import { useDocumentStore } from '@/stores/documentStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { DocumentList } from '@/components/documents/DocumentList';
import { DocumentDetail } from '@/components/documents/DocumentDetail';
import { WorkflowList } from '@/components/workflow/WorkflowList';
import { WorkflowDesigner } from '@/components/workflow/WorkflowDesigner';
import { VisaPanel } from '@/components/visa/VisaPanel';
import { HistoryView } from '@/components/history/HistoryView';
import { SettingsView } from '@/components/settings/SettingsView';
import { useAppStore, type AppView } from '@/stores/appStore';

function ViewRenderer({ view }: { view: AppView }) {
  switch (view) {
    case 'dashboard':
      return <Dashboard />;
    case 'documents':
      return (
        <>
          <DocumentList />
          <DocumentDetail />
        </>
      );
    case 'workflow-list':
      return <WorkflowList />;
    case 'workflow-designer':
      return <WorkflowDesigner />;
    case 'visa':
      return <VisaPanel />;
    case 'history':
      return <HistoryView />;
    case 'settings':
      return <SettingsView />;
    default:
      return <Dashboard />;
  }
}

function MiniStats() {
  const { documents } = useDocumentStore();
  const { instances } = useWorkflowStore();

  const stats = useMemo(() => {
    const pending = documents.filter((d) => d.currentStatus.id === 'pending').length;
    const approved = documents.filter((d) => ['approved', 'vso'].includes(d.currentStatus.id)).length;
    const rejected = documents.filter((d) => ['rejected', 'vao_blocking'].includes(d.currentStatus.id)).length;
    const active = instances.filter((i) => i.status === 'active').length;
    return { total: documents.length, pending, approved, rejected, active };
  }, [documents, instances]);

  const items = [
    { label: 'Documents', value: stats.total, icon: <FileText className="h-3 w-3" />, color: 'text-muted-foreground' },
    { label: 'En attente', value: stats.pending, icon: <Clock className="h-3 w-3" />, color: 'text-amber-500' },
    { label: 'Approuvés', value: stats.approved, icon: <CheckCircle className="h-3 w-3" />, color: 'text-green-500' },
    { label: 'Rejetés', value: stats.rejected, icon: <AlertTriangle className="h-3 w-3" />, color: 'text-red-500' },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-3">
        {items.map((item) => (
          <Tooltip key={item.label}>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1 ${item.color}`}>
                {item.icon}
                <span className="text-xs font-semibold">{item.value}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {item.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

export function AppLayout() {
  const { currentView } = useAppStore();
  const isDesigner = currentView === 'workflow-designer';

  // Active les notifications toast pour les événements workflow
  useWorkflowNotifications();
  // Active les raccourcis clavier globaux
  useKeyboardShortcuts();

  return (
    <div className="flex h-full w-full overflow-hidden">
      <AppSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar with global search + mini stats */}
        {!isDesigner && (
          <div className="flex items-center justify-between border-b bg-background/80 backdrop-blur-sm px-6 py-2 shrink-0">
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium text-muted-foreground capitalize">
                {currentView === 'workflow-list' ? 'Workflows' : currentView === 'visa' ? 'Visas & Revues' : String(currentView)}
              </div>
              <div className="h-4 w-px bg-border" />
              <MiniStats />
            </div>
            <GlobalSearch />
          </div>
        )}
        <main className="flex-1 overflow-hidden">
          {isDesigner ? (
            <ViewRenderer view={currentView} />
          ) : (
            <ScrollArea className="h-full">
              <ViewRenderer view={currentView} />
            </ScrollArea>
          )}
        </main>
      </div>
    </div>
  );
}
