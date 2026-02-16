import React, { useState, useEffect } from 'react';
import { X, Trash2, Plus, UserPlus, Users, UserCheck, Shield, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useWorkflowStore } from '@/stores/workflowStore';
import { useAuthStore } from '@/stores/authStore';
import { getProjectUsers } from '@/api/trimbleService';
import type { WorkflowNodeData } from '@/models/workflow';
import type { ConnectUser } from '@/models/trimble';

/** Structure d'un reviewer assigné à un noeud review */
interface NodeReviewer {
  id: string;
  name: string;
  email: string;
  role: 'reviewer' | 'approver' | 'validator';
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  reviewer: { label: 'Réviseur', color: 'bg-blue-100 text-blue-700' },
  approver: { label: 'Approbateur', color: 'bg-amber-100 text-amber-700' },
  validator: { label: 'Valideur', color: 'bg-green-100 text-green-700' },
};

export function NodeConfigPanel() {
  const {
    selectedNodeId,
    designerNodes,
    designerStatuses,
    setSelectedNodeId,
    updateDesignerNode,
    removeDesignerNode,
  } = useWorkflowStore();

  const selectedNode = designerNodes.find((n) => n.id === selectedNodeId);
  if (!selectedNode) return null;

  const nodeData = selectedNode.data;

  const updateData = (updates: Partial<WorkflowNodeData>) => {
    updateDesignerNode(selectedNode.id, {
      data: { ...nodeData, ...updates },
    });
  };

  const handleDelete = () => {
    removeDesignerNode(selectedNode.id);
    setSelectedNodeId(null);
  };

  return (
    <div className="absolute right-0 top-0 z-10 h-full w-[300px] border-l bg-background shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Configuration du noeud</h3>
        <Button variant="ghost" size="icon" onClick={() => setSelectedNodeId(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="space-y-4 overflow-y-auto p-4" style={{ maxHeight: 'calc(100% - 120px)' }}>
        {/* Label */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Nom
          </label>
          <Input
            value={nodeData.label || ''}
            onChange={(e) => updateData({ label: e.target.value })}
            placeholder="Nom du noeud"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Description
          </label>
          <Textarea
            value={nodeData.description || ''}
            onChange={(e) => updateData({ description: e.target.value })}
            placeholder="Description optionnelle"
            rows={2}
          />
        </div>

        {/* Status-specific config */}
        {selectedNode.type === 'status' && (
          <>
            <Separator />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Statut associé
              </label>
              <Select
                value={nodeData.statusId || ''}
                onValueChange={(value) => {
                  const status = designerStatuses.find((s) => s.id === value);
                  updateData({
                    statusId: value,
                    color: status?.color,
                    label: status?.name || nodeData.label,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un statut" />
                </SelectTrigger>
                <SelectContent>
                  {designerStatuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Couleur
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={nodeData.color || '#6a6e79'}
                  onChange={(e) => updateData({ color: e.target.value })}
                  className="h-9 w-9 cursor-pointer rounded border"
                />
                <Input
                  value={nodeData.color || '#6a6e79'}
                  onChange={(e) => updateData({ color: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </>
        )}

        {/* Review-specific config — Reviewer management */}
        {selectedNode.type === 'review' && (
          <ReviewerConfigSection nodeData={nodeData} updateData={updateData} />
        )}

        {/* Action-specific config */}
        {selectedNode.type === 'action' && (
          <>
            <Separator />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Type d'action
              </label>
              <Select
                value={nodeData.autoActions?.[0]?.type || 'notify_user'}
                onValueChange={(value) =>
                  updateData({
                    autoActions: [
                      {
                        id: 'action-1',
                        type: value as any,
                        config: {},
                        label: value,
                      },
                    ],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="move_file">Déplacer le fichier</SelectItem>
                  <SelectItem value="copy_file">Copier le fichier</SelectItem>
                  <SelectItem value="notify_user">Notifier l'utilisateur</SelectItem>
                  <SelectItem value="send_comment">Envoyer un commentaire</SelectItem>
                  <SelectItem value="update_metadata">Mettre à jour les métadonnées</SelectItem>
                  <SelectItem value="webhook">Webhook externe</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* Node type indicator */}
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Type: <strong>{selectedNode.type}</strong>
          </span>
          <span className="text-xs text-muted-foreground">ID: {selectedNode.id}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-3">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={handleDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer le noeud
        </Button>
      </div>
    </div>
  );
}

// ─── REVIEWER CONFIG SECTION (for review nodes) ─────────────────────────────

function ReviewerConfigSection({
  nodeData,
  updateData,
}: {
  nodeData: WorkflowNodeData;
  updateData: (updates: Partial<WorkflowNodeData>) => void;
}) {
  const [showAddUser, setShowAddUser] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [projectUsers, setProjectUsers] = useState<NodeReviewer[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load real project users
  useEffect(() => {
    const { project, accessToken } = useAuthStore.getState();
    if (!project?.id || !accessToken) return;

    setLoadingUsers(true);
    getProjectUsers(project.id)
      .then((users: ConnectUser[]) => {
        const mapped: NodeReviewer[] = users.map((u) => ({
          id: u.id,
          name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
          email: u.email,
          role: 'reviewer' as const,
        }));
        setProjectUsers(mapped);
      })
      .catch((err) => {
        console.warn('[NodeConfigPanel] Failed to load project users:', err);
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  // reviewerDetails is the single source of truth for assigned reviewers
  // Do NOT fall back to nodeData.assignees — those may contain stale demo IDs
  const reviewerDetails: NodeReviewer[] = (nodeData.reviewerDetails as unknown as NodeReviewer[]) || [];
  const assignees: string[] = reviewerDetails.map((r) => r.id);

  const addReviewer = (user: NodeReviewer) => {
    if (reviewerDetails.some((r) => r.id === user.id)) return;
    const newDetails = [...reviewerDetails, user];
    const newAssignees = newDetails.map((r) => r.id);
    updateData({
      assignees: newAssignees,
      reviewerDetails: newDetails as unknown as string[],
    });
    setShowAddUser(false);
    setSearchUser('');
  };

  const removeReviewer = (userId: string) => {
    const newDetails = reviewerDetails.filter((r) => r.id !== userId);
    updateData({
      assignees: newDetails.map((r) => r.id),
      reviewerDetails: newDetails as unknown as string[],
    });
  };

  const updateReviewerRole = (userId: string, role: 'reviewer' | 'approver' | 'validator') => {
    updateData({
      reviewerDetails: reviewerDetails.map((r) =>
        r.id === userId ? { ...r, role } : r
      ) as unknown as string[],
    });
  };

  const filteredUsers = projectUsers.filter(
    (u) =>
      !assignees.includes(u.id) &&
      (u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
        u.email.toLowerCase().includes(searchUser.toLowerCase()))
  );

  return (
    <>
      <Separator />

      {/* Reviewers list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Réviseurs assignés
          </label>
          <span className="text-[10px] text-muted-foreground">{assignees.length} personne(s)</span>
        </div>

        {reviewerDetails.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">
            Aucun réviseur assigné. Ajoutez des utilisateurs.
          </p>
        ) : (
          <div className="space-y-1.5">
            {reviewerDetails.map((reviewer) => {
              const roleInfo = ROLE_LABELS[reviewer.role] || ROLE_LABELS.reviewer;
              return (
                <div
                  key={reviewer.id}
                  className="flex items-center gap-2 rounded-md border p-2 bg-card"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold shrink-0">
                    {reviewer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{reviewer.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{reviewer.email}</div>
                  </div>
                  <Select
                    value={reviewer.role}
                    onValueChange={(v) => updateReviewerRole(reviewer.id, v as any)}
                  >
                    <SelectTrigger className="h-6 w-auto min-w-0 text-[10px] px-1.5 border-none shadow-none">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reviewer">
                        <span className="flex items-center gap-1.5 text-xs">
                          <UserCheck className="h-3 w-3 text-blue-600" />
                          Réviseur
                        </span>
                      </SelectItem>
                      <SelectItem value="approver">
                        <span className="flex items-center gap-1.5 text-xs">
                          <Shield className="h-3 w-3 text-amber-600" />
                          Approbateur
                        </span>
                      </SelectItem>
                      <SelectItem value="validator">
                        <span className="flex items-center gap-1.5 text-xs">
                          <UserCheck className="h-3 w-3 text-green-600" />
                          Valideur
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeReviewer(reviewer.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add user */}
        {showAddUser ? (
          <div className="mt-2 space-y-1.5 rounded-md border border-dashed p-2">
            <Input
              value={searchUser}
              onChange={(e) => setSearchUser(e.target.value)}
              placeholder="Rechercher un utilisateur..."
              className="h-7 text-xs"
              autoFocus
            />
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {loadingUsers ? (
                <div className="flex items-center justify-center py-2 text-[10px] text-muted-foreground">
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Chargement...
                </div>
              ) : filteredUsers.length === 0 ? (
                <p className="text-[10px] text-muted-foreground text-center py-2">
                  Aucun utilisateur trouvé
                </p>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => addReviewer(user)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs hover:bg-muted transition-colors"
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                      {user.name.charAt(0)}
                    </div>
                    <div className="text-left min-w-0">
                      <div className="font-medium truncate">{user.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-full text-[10px]"
              onClick={() => { setShowAddUser(false); setSearchUser(''); }}
            >
              Annuler
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full h-7 text-xs gap-1"
            onClick={() => setShowAddUser(true)}
          >
            <UserPlus className="h-3 w-3" />
            Ajouter un réviseur
          </Button>
        )}
      </div>

      <Separator />

      {/* Required approvals */}
      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Nombre de visas requis
        </label>
        <Input
          type="number"
          min={1}
          max={Math.max(1, assignees.length)}
          value={nodeData.requiredApprovals || 1}
          onChange={(e) =>
            updateData({ requiredApprovals: parseInt(e.target.value) || 1 })
          }
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          {assignees.length > 0
            ? `${nodeData.requiredApprovals || 1} sur ${assignees.length} réviseur(s) doivent approuver`
            : 'Ajoutez des réviseurs pour configurer les approbations'}
        </p>
      </div>
    </>
  );
}
