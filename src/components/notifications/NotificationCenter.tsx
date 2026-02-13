// ============================================================================
// NOTIFICATION CENTER — Centre de notifications dédié
// ============================================================================

import React, { useState, useMemo } from 'react';
import {
  Bell, CheckCircle, XCircle, AlertTriangle, Info, Trash2,
  Check, Filter, FileText, GitBranch, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { useAppStore, type AppNotification } from '@/stores/appStore';
import { useDocumentStore } from '@/stores/documentStore';

type FilterType = 'all' | 'unread' | 'info' | 'success' | 'warning' | 'error';

export function NotificationCenter() {
  const {
    notifications, removeNotification, markAsRead, markAllAsRead, clearNotifications, setCurrentView,
  } = useAppStore();
  const { setSelectedDocument, documents } = useDocumentStore();
  const [filter, setFilter] = useState<FilterType>('all');
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  const handleClickNotification = (notif: AppNotification) => {
    markAsRead(notif.id);
    if (notif.documentId) {
      const doc = documents.find((d) => d.id === notif.documentId);
      if (doc) {
        setSelectedDocument(doc);
        setCurrentView('documents');
        setOpen(false);
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const formatTimeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-[380px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                {unreadCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1" onClick={markAllAsRead}>
                <Check className="h-3 w-3" />
                Tout lire
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-[11px] gap-1 text-muted-foreground" onClick={clearNotifications}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto">
          {([
            { key: 'all', label: 'Toutes' },
            { key: 'unread', label: 'Non lues' },
            { key: 'success', label: 'Succès' },
            { key: 'warning', label: 'Attention' },
            { key: 'error', label: 'Erreurs' },
            { key: 'info', label: 'Info' },
          ] as { key: FilterType; label: string }[]).map((f) => (
            <Badge
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              className="cursor-pointer text-[10px] px-2 py-0.5 shrink-0"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Badge>
          ))}
        </div>

        {/* Notifications list */}
        <ScrollArea className="max-h-[400px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">
                {filter === 'all' ? 'Aucune notification' : 'Aucun résultat pour ce filtre'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/50
                    ${!notif.read ? 'bg-primary/5' : ''}`}
                  onClick={() => handleClickNotification(notif)}
                >
                  <div className="shrink-0 mt-0.5">{getIcon(notif.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notif.read ? 'font-medium' : ''}`}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {notif.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-muted-foreground">
                        {formatTimeAgo(notif.timestamp)}
                      </span>
                      {notif.documentId && (
                        <span className="flex items-center gap-0.5 text-[10px] text-primary">
                          <FileText className="h-2.5 w-2.5" />
                          Voir le document
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeNotification(notif.id); }}
                    className="shrink-0 text-muted-foreground/30 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t px-4 py-2">
            <button
              onClick={() => { setCurrentView('settings'); setOpen(false); }}
              className="text-[11px] text-primary hover:underline"
            >
              Gérer les notifications →
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
