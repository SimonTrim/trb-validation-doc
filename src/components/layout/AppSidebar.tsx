import React from 'react';
import {
  LayoutDashboard, FileText, GitBranch, UserCheck,
  History, Settings, Bell, ChevronLeft, ChevronRight,
  FileCheck, Sun, Moon, Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppStore, type AppView } from '@/stores/appStore';
import { useDocumentStore } from '@/stores/documentStore';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { cn } from '@/lib/utils';

interface NavItem {
  id: AppView;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  shortcut?: string; // Keyboard shortcut hint
}

export function AppSidebar() {
  const { currentView, sidebarCollapsed, setCurrentView, toggleSidebar, notifications, theme, setTheme } = useAppStore();
  const { documents } = useDocumentStore();

  const pendingCount = documents.filter((d) => d.currentStatus.id === 'pending').length;
  const pendingVisas = documents.filter((d) => d.reviewers.some((r) => !r.decision)).length;
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  const mainNav: NavItem[] = [
    { id: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard className="h-5 w-5" />, shortcut: 'Alt+D' },
    { id: 'documents', label: 'Documents', icon: <FileText className="h-5 w-5" />, badge: pendingCount, shortcut: 'Alt+F' },
    { id: 'visa', label: 'Visas', icon: <UserCheck className="h-5 w-5" />, badge: pendingVisas, shortcut: 'Alt+V' },
    { id: 'workflow-list', label: 'Workflows', icon: <GitBranch className="h-5 w-5" />, shortcut: 'Alt+W' },
    { id: 'history', label: 'Historique', icon: <History className="h-5 w-5" />, shortcut: 'Alt+H' },
  ];

  const bottomNav: NavItem[] = [
    { id: 'settings', label: 'Paramètres', icon: <Settings className="h-5 w-5" />, shortcut: 'Alt+S' },
  ];

  const NavButton = ({ item }: { item: NavItem }) => {
    const isActive = currentView === item.id;
    const button = (
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'relative justify-start gap-3 transition-all',
          sidebarCollapsed ? 'h-10 w-10 p-0 justify-center' : 'h-10 w-full px-3',
          isActive && 'bg-primary/10 text-primary font-medium'
        )}
        onClick={() => setCurrentView(item.id)}
      >
        <span className={cn(isActive && 'text-primary')}>{item.icon}</span>
        {!sidebarCollapsed && (
          <span className="flex-1 text-left text-sm">{item.label}</span>
        )}
        {item.badge && item.badge > 0 && (
          <Badge
            variant="destructive"
            className={cn(
              'h-5 min-w-[20px] text-[10px] px-1.5',
              sidebarCollapsed && 'absolute -right-1 -top-1 h-4 min-w-[16px] text-[9px] px-1'
            )}
          >
            {item.badge}
          </Badge>
        )}
      </Button>
    );

    // Tooltip: always show (collapsed = full label + shortcut, expanded = shortcut only)
    return (
      <Tooltip delayDuration={sidebarCollapsed ? 0 : 400}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right">
          {sidebarCollapsed && <span>{item.label}</span>}
          {sidebarCollapsed && item.badge && item.badge > 0 && (
            <span className="ml-2 text-destructive">({item.badge})</span>
          )}
          {item.shortcut && (
            <kbd className={`text-[10px] text-primary-foreground/60 ${sidebarCollapsed ? 'ml-2' : ''}`}>{item.shortcut}</kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          'flex h-full flex-col border-r bg-sidebar transition-all duration-300',
          sidebarCollapsed ? 'w-[56px]' : 'w-[220px]'
        )}
      >
        {/* Header */}
        <div className={cn(
          'flex items-center border-b px-3 py-3',
          sidebarCollapsed ? 'justify-center' : 'justify-between'
        )}>
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              <span className="text-sm font-bold text-primary">Validation</span>
            </div>
          )}
          {sidebarCollapsed && (
            <FileCheck className="h-5 w-5 text-primary" />
          )}
        </div>

        {/* Toggle button */}
        <div className={cn('flex px-2 py-2', sidebarCollapsed ? 'justify-center' : 'justify-end')}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleSidebar}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Main navigation */}
        <nav className="flex-1 space-y-1 px-2">
          {mainNav.map((item) => (
            <NavButton key={item.id} item={item} />
          ))}
        </nav>

        <Separator className="mx-2" />

        {/* Theme toggle */}
        <div className={cn('px-2 py-1.5', sidebarCollapsed ? 'flex justify-center' : '')}>
          {sidebarCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center rounded-lg border bg-muted/50 p-0.5">
              {([
                { value: 'light' as const, icon: <Sun className="h-3.5 w-3.5" />, label: 'Clair' },
                { value: 'dark' as const, icon: <Moon className="h-3.5 w-3.5" />, label: 'Sombre' },
                { value: 'system' as const, icon: <Monitor className="h-3.5 w-3.5" />, label: 'Auto' },
              ]).map((opt) => (
                <Tooltip key={opt.value} delayDuration={300}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-all',
                        theme === opt.value
                          ? 'bg-background text-foreground shadow-sm font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {opt.icon}
                      <span className="sr-only lg:not-sr-only">{opt.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{opt.label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>

        {/* Notification Center */}
        <div className={cn('px-2 py-1', sidebarCollapsed ? 'flex justify-center' : '')}>
          <NotificationCenter />
        </div>

        {/* Bottom navigation */}
        <nav className="space-y-1 px-2 py-2">
          {bottomNav.map((item) => (
            <NavButton key={item.id} item={item} />
          ))}
        </nav>
      </div>
    </TooltipProvider>
  );
}
