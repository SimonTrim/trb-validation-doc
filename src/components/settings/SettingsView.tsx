// ============================================================================
// SETTINGS VIEW — Paramètres globaux de l'extension
// Connexion API, configuration des workflows, préférences
// ============================================================================

import React, { useState } from 'react';
import {
  Settings, Globe, Key, FolderOpen, Bell, Shield,
  RefreshCw, Database, CheckCircle, XCircle, Info,
  ExternalLink, Copy, Eye, EyeOff, Keyboard, Users,
  Check, X as XIcon, Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useAuthStore } from '@/stores/authStore';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useAppStore } from '@/stores/appStore';
import { usePermissionStore, type UserRole } from '@/stores/permissionStore';
import { initializeStores } from '@/api/dataLoader';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkflowSettingsPanel } from '@/components/workflow/WorkflowSettingsPanel';
import { FolderWatcher } from '@/engine';

export function SettingsView() {
  const { isConnected, project, currentUser, accessToken } = useAuthStore();
  const { definitions, instances } = useWorkflowStore();
  const { documents } = useDocumentStore();
  const { notifications, clearNotifications } = useAppStore();
  const { currentUser: permUser, setRole, getAllRoles, permissions } = usePermissionStore();
  const [showToken, setShowToken] = useState(false);

  const activeWorkflow = definitions.find((d) => d.isActive);
  const activeWatchers = FolderWatcher.getActiveWatchers();

  // ── Export functions ───────────────────────────────────────────────────
  const handleExportJSON = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      documents: documents,
      workflowDefinitions: definitions,
      workflowInstances: instances,
      notifications: notifications,
    };
    downloadFile(
      JSON.stringify(exportData, null, 2),
      `validation-export-${new Date().toISOString().split('T')[0]}.json`,
      'application/json'
    );
  };

  const handleExportCSV = () => {
    const headers = [
      'Nom fichier', 'Extension', 'Taille', 'Déposé par', 'Date dépôt',
      'Statut', 'ID Statut', 'Version', 'Chemin', 'Workflow actif',
    ];
    const rows = documents.map((doc) => [
      doc.fileName,
      doc.fileExtension,
      doc.fileSize.toString(),
      doc.uploadedByName,
      doc.uploadedAt,
      doc.currentStatus.name,
      doc.currentStatus.id,
      doc.versionNumber.toString(),
      doc.filePath,
      doc.workflowInstanceId ? 'Oui' : 'Non',
    ]);

    const csv = [
      headers.join(';'),
      ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(';')),
    ].join('\n');

    downloadFile(
      '\uFEFF' + csv, // BOM for Excel UTF-8
      `documents-${new Date().toISOString().split('T')[0]}.csv`,
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Paramètres
        </h2>
        <p className="text-sm text-muted-foreground">
          Configuration de l'extension de validation documentaire
        </p>
      </div>

      <Tabs defaultValue="connection" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connection" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Connexion
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Workflow
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Données
          </TabsTrigger>
          <TabsTrigger value="shortcuts" className="gap-1.5">
            <Keyboard className="h-3.5 w-3.5" />
            Raccourcis
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Permissions
          </TabsTrigger>
        </TabsList>

        {/* ── Onglet Connexion ─────────────────────────────────────────── */}
        <TabsContent value="connection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Statut de connexion
              </CardTitle>
              <CardDescription>
                Connexion à Trimble Connect via le Workspace API
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {isConnected ? 'Connecté à Trimble Connect' : 'Non connecté (mode démo)'}
                  </span>
                </div>
                <Badge variant={isConnected ? 'default' : 'secondary'}>
                  {isConnected ? 'Connecté' : 'Hors ligne'}
                </Badge>
              </div>

              <Separator />

              {/* Projet */}
              <InfoRow label="Projet" value={project?.name || 'Projet démo (proj-1)'} />
              <InfoRow label="ID Projet" value={project?.id || 'proj-1'} copyable />
              <InfoRow label="Région" value={project?.location || 'EU (par défaut)'} />

              <Separator />

              {/* Utilisateur */}
              <InfoRow
                label="Utilisateur"
                value={
                  currentUser
                    ? `${currentUser.firstName} ${currentUser.lastName}`
                    : 'Utilisateur démo'
                }
              />
              <InfoRow label="Email" value={currentUser?.email || 'demo@example.com'} />

              <Separator />

              {/* Token */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Access Token</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {accessToken
                      ? showToken
                        ? accessToken.substring(0, 40) + '...'
                        : '••••••••••••••••••••'
                      : 'Aucun token (mode démo)'}
                  </p>
                </div>
                {accessToken && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Extension Manifest</CardTitle>
              <CardDescription>
                Informations de configuration de l'extension
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Extension ID" value="trb-validation-doc" />
              <InfoRow label="Version" value="1.0.0" />
              <InfoRow
                label="Permissions"
                value="project.read, files.read, files.write, todos.read, todos.write"
              />
              <div className="mt-2">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ExternalLink className="h-3 w-3" />
                  Voir le manifeste
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Onglet Workflow ──────────────────────────────────────────── */}
        <TabsContent value="workflow" className="space-y-4">
          {activeWorkflow ? (
            <WorkflowSettingsPanel definitionId={activeWorkflow.id} />
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <RefreshCw className="mb-4 h-12 w-12 text-muted-foreground/40" />
              <CardTitle className="mb-2">Aucun workflow actif</CardTitle>
              <CardDescription>
                Créez un workflow dans l'éditeur pour configurer ses paramètres ici.
              </CardDescription>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => useAppStore.getState().setCurrentView('workflow-list')}
              >
                Aller aux workflows
              </Button>
            </Card>
          )}

          {/* Watchers status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Surveillance des dossiers</CardTitle>
              <CardDescription>
                Watchers actifs qui surveillent les dossiers source
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeWatchers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun watcher actif. Activez la surveillance dans les paramètres du workflow.
                </p>
              ) : (
                <div className="space-y-2">
                  {activeWatchers.map((w) => (
                    <div key={w.id} className="flex items-center justify-between rounded-lg border p-2.5">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-blue-500" />
                        <div>
                          <span className="text-sm font-medium">Dossier: {w.folderId}</span>
                          <p className="text-xs text-muted-foreground">
                            Dernier scan: {w.lastPoll ? new Date(w.lastPoll).toLocaleTimeString('fr-FR') : 'Jamais'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="default" className="text-xs">Actif</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Onglet Notifications ─────────────────────────────────────── */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Notifications</CardTitle>
                  <CardDescription>
                    {notifications.length} notification(s), {notifications.filter((n) => !n.read).length} non lue(s)
                  </CardDescription>
                </div>
                {notifications.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearNotifications}>
                    Tout effacer
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucune notification
                </p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`rounded-lg border p-3 ${!notif.read ? 'bg-muted/50 border-primary/20' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-2">
                          <NotifIcon type={notif.type} />
                          <div>
                            <p className="text-sm font-medium">{notif.title}</p>
                            <p className="text-xs text-muted-foreground">{notif.message}</p>
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap ml-2">
                          {new Date(notif.timestamp).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Email notification preferences */}
          <EmailNotificationSettings />
        </TabsContent>

        {/* ── Onglet Données ───────────────────────────────────────────── */}
        <TabsContent value="data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" />
                État des données
              </CardTitle>
              <CardDescription>
                Résumé des données chargées dans l'extension
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Documents" value={`${documents.length} document(s)`} />
              <InfoRow label="Workflow Definitions" value={`${definitions.length} workflow(s)`} />
              <InfoRow label="Workflow Instances" value={`${instances.length} instance(s)`} />
              <InfoRow
                label="Reviews totales"
                value={`${instances.reduce((a, i) => a + i.reviews.length, 0)} visa(s)`}
              />
              <InfoRow
                label="Événements historique"
                value={`${instances.reduce((a, i) => a + i.history.length, 0)} entrée(s)`}
              />
              <InfoRow label="Notifications" value={`${notifications.length} notification(s)`} />

              <Separator />

              <div>
                <p className="text-sm font-medium mb-1">Stockage</p>
                <p className="text-xs text-muted-foreground">
                  Les données sont actuellement stockées en mémoire (mode démo).
                  En production, elles seront persistées via Turso/SQLite sur le backend.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions de maintenance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={async () => {
                  try {
                    await initializeStores('production');
                    toast.success('Données rechargées depuis le serveur');
                  } catch (err) {
                    console.error('[Settings] Reload failed:', err);
                    toast.error('Erreur lors du rechargement des données');
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Recharger les données depuis le serveur
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => handleExportJSON()}
              >
                <Database className="h-3.5 w-3.5" />
                Exporter les données (JSON)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => handleExportCSV()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Exporter les documents (CSV)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Onglet Raccourcis clavier ─────────────────────────────────── */}
        <TabsContent value="shortcuts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Keyboard className="h-5 w-5" />
                Raccourcis clavier
              </CardTitle>
              <CardDescription>
                Naviguez rapidement dans l'application avec les raccourcis clavier.
                Les raccourcis sont désactivés quand le curseur est dans un champ de saisie.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_auto] gap-4 py-2 px-1 text-xs font-semibold text-muted-foreground border-b">
                  <span>Action</span>
                  <span>Raccourci</span>
                </div>
                {[
                  { action: 'Tableau de bord', shortcut: 'Alt + D', description: 'Ouvrir la vue du tableau de bord' },
                  { action: 'Documents', shortcut: 'Alt + F', description: 'Ouvrir la liste des documents' },
                  { action: 'Visas', shortcut: 'Alt + V', description: 'Ouvrir le panneau des visas' },
                  { action: 'Workflows', shortcut: 'Alt + W', description: 'Ouvrir la liste des workflows' },
                  { action: 'Historique', shortcut: 'Alt + H', description: 'Ouvrir l\'historique des événements' },
                  { action: 'Paramètres', shortcut: 'Alt + S', description: 'Ouvrir les paramètres' },
                ].map((item) => (
                  <div
                    key={item.shortcut}
                    className="grid grid-cols-[1fr_auto] gap-4 items-center rounded-md px-1 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <kbd className="inline-flex h-7 items-center gap-1 rounded border bg-muted px-2 text-xs font-mono text-muted-foreground shadow-sm">
                      {item.shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Raccourcis du workflow designer</CardTitle>
              <CardDescription>Raccourcis disponibles dans l'éditeur de workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="grid grid-cols-[1fr_auto] gap-4 py-2 px-1 text-xs font-semibold text-muted-foreground border-b">
                  <span>Action</span>
                  <span>Raccourci</span>
                </div>
                {[
                  { action: 'Annuler', shortcut: 'Ctrl + Z', description: 'Annuler la dernière modification' },
                  { action: 'Refaire', shortcut: 'Ctrl + Y', description: 'Refaire la modification annulée' },
                  { action: 'Supprimer', shortcut: 'Suppr / Retour', description: 'Supprimer l\'élément sélectionné' },
                ].map((item) => (
                  <div
                    key={item.shortcut}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-md px-1 py-2.5 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <kbd className="inline-flex h-7 items-center gap-1 rounded border bg-muted px-2 text-xs font-mono text-muted-foreground shadow-sm">
                      {item.shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Onglet Permissions ─────────────────────────────────────── */}
        <TabsContent value="permissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Rôle actuel
              </CardTitle>
              <CardDescription>
                Changez votre rôle pour tester les différents niveaux d'accès
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{permUser.name}</p>
                  <p className="text-xs text-muted-foreground">{permUser.email}</p>
                </div>
                <Select value={permUser.role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getAllRoles().map((r) => (
                      <SelectItem key={r.role} value={r.role}>
                        <span className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${r.info.color.replace('text-', 'bg-')}`} />
                          {r.info.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Matrice des permissions</CardTitle>
              <CardDescription>Droits accordés à chaque rôle</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Permission</th>
                      {getAllRoles().map((r) => (
                        <th key={r.role} className="text-center py-2 px-2 font-medium">
                          <span className={r.info.color}>{r.info.label}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['canCreateWorkflow', 'Créer des workflows'],
                      ['canEditWorkflow', 'Modifier des workflows'],
                      ['canDeleteWorkflow', 'Supprimer des workflows'],
                      ['canSubmitVisa', 'Soumettre un visa'],
                      ['canComment', 'Commenter'],
                      ['canUploadDocument', 'Déposer des documents'],
                      ['canDeleteDocument', 'Supprimer des documents'],
                      ['canExportData', 'Exporter les données'],
                      ['canManageLabels', 'Gérer les labels'],
                      ['canViewAuditTrail', 'Voir l\'audit trail'],
                      ['canManageUsers', 'Gérer les utilisateurs'],
                      ['canConfigureSettings', 'Configurer les paramètres'],
                    ] as [string, string][]).map(([key, label]) => (
                      <tr key={key} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                        {getAllRoles().map((r) => (
                          <td key={r.role} className="text-center py-2 px-2">
                            {r.permissions[key as keyof typeof r.permissions] ? (
                              <Check className="h-3.5 w-3.5 text-green-500 mx-auto" />
                            ) : (
                              <XIcon className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{value}</span>
        {copyable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => navigator.clipboard.writeText(value)}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Email Notification Preferences ───────────────────────────────────────
function EmailNotificationSettings() {
  const [emailPrefs, setEmailPrefs] = useState({
    enabled: true,
    onNewDocument: true,
    onVisaRequested: true,
    onVisaCompleted: true,
    onDocumentRejected: true,
    onDeadlineApproaching: true,
    onCommentAdded: false,
    onWorkflowCompleted: true,
    digestFrequency: 'instant' as 'instant' | 'daily' | 'weekly',
  });

  const toggle = (key: keyof typeof emailPrefs) => {
    if (typeof emailPrefs[key] === 'boolean') {
      setEmailPrefs((p) => ({ ...p, [key]: !p[key] }));
    }
  };

  const NOTIF_OPTIONS: { key: keyof typeof emailPrefs; label: string; desc: string }[] = [
    { key: 'onNewDocument', label: 'Nouveau document déposé', desc: 'Quand un document est ajouté au dépôt' },
    { key: 'onVisaRequested', label: 'Visa demandé', desc: 'Quand un visa vous est assigné' },
    { key: 'onVisaCompleted', label: 'Visa soumis', desc: 'Quand un viseur soumet sa décision' },
    { key: 'onDocumentRejected', label: 'Document rejeté', desc: 'Quand un document est rejeté ou bloqué' },
    { key: 'onDeadlineApproaching', label: 'Échéance proche', desc: '48h avant la date limite' },
    { key: 'onCommentAdded', label: 'Nouveau commentaire', desc: 'Quand un commentaire est ajouté' },
    { key: 'onWorkflowCompleted', label: 'Workflow terminé', desc: 'Quand un workflow est finalisé' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications par email
            </CardTitle>
            <CardDescription>
              Configurez les événements qui déclenchent un email
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Activer</span>
            <Switch checked={emailPrefs.enabled} onCheckedChange={() => toggle('enabled')} />
          </div>
        </div>
      </CardHeader>
      {emailPrefs.enabled && (
        <CardContent className="space-y-4">
          {/* Frequency selector */}
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Fréquence d'envoi</p>
              <p className="text-xs text-muted-foreground">Comment recevoir les notifications</p>
            </div>
            <Select
              value={emailPrefs.digestFrequency}
              onValueChange={(v) => setEmailPrefs((p) => ({ ...p, digestFrequency: v as typeof p.digestFrequency }))}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instant">Immédiat</SelectItem>
                <SelectItem value="daily">Résumé quotidien</SelectItem>
                <SelectItem value="weekly">Résumé hebdomadaire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Toggle list */}
          <div className="space-y-1">
            {NOTIF_OPTIONS.map((opt) => (
              <div
                key={opt.key}
                className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
                <Switch
                  checked={emailPrefs[opt.key] as boolean}
                  onCheckedChange={() => toggle(opt.key)}
                />
              </div>
            ))}
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 inline mr-1" />
            Les emails sont envoyés à l'adresse associée à votre compte Trimble Connect.
            Cette fonctionnalité nécessite la configuration du serveur SMTP côté backend.
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function NotifIcon({ type }: { type: string }) {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />;
    case 'error':
      return <XCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />;
    case 'warning':
      return <Info className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />;
    default:
      return <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />;
  }
}
