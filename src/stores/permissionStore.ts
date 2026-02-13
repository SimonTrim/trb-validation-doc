import { create } from 'zustand';

export type UserRole = 'admin' | 'manager' | 'reviewer' | 'depositor' | 'viewer';

export interface Permission {
  canCreateWorkflow: boolean;
  canEditWorkflow: boolean;
  canDeleteWorkflow: boolean;
  canSubmitVisa: boolean;
  canComment: boolean;
  canUploadDocument: boolean;
  canDeleteDocument: boolean;
  canExportData: boolean;
  canManageLabels: boolean;
  canViewAuditTrail: boolean;
  canManageUsers: boolean;
  canConfigureSettings: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

const ROLE_PERMISSIONS: Record<UserRole, Permission> = {
  admin: {
    canCreateWorkflow: true, canEditWorkflow: true, canDeleteWorkflow: true,
    canSubmitVisa: true, canComment: true, canUploadDocument: true,
    canDeleteDocument: true, canExportData: true, canManageLabels: true,
    canViewAuditTrail: true, canManageUsers: true, canConfigureSettings: true,
  },
  manager: {
    canCreateWorkflow: true, canEditWorkflow: true, canDeleteWorkflow: false,
    canSubmitVisa: true, canComment: true, canUploadDocument: true,
    canDeleteDocument: true, canExportData: true, canManageLabels: true,
    canViewAuditTrail: true, canManageUsers: false, canConfigureSettings: true,
  },
  reviewer: {
    canCreateWorkflow: false, canEditWorkflow: false, canDeleteWorkflow: false,
    canSubmitVisa: true, canComment: true, canUploadDocument: false,
    canDeleteDocument: false, canExportData: true, canManageLabels: false,
    canViewAuditTrail: true, canManageUsers: false, canConfigureSettings: false,
  },
  depositor: {
    canCreateWorkflow: false, canEditWorkflow: false, canDeleteWorkflow: false,
    canSubmitVisa: false, canComment: true, canUploadDocument: true,
    canDeleteDocument: false, canExportData: false, canManageLabels: true,
    canViewAuditTrail: false, canManageUsers: false, canConfigureSettings: false,
  },
  viewer: {
    canCreateWorkflow: false, canEditWorkflow: false, canDeleteWorkflow: false,
    canSubmitVisa: false, canComment: false, canUploadDocument: false,
    canDeleteDocument: false, canExportData: false, canManageLabels: false,
    canViewAuditTrail: false, canManageUsers: false, canConfigureSettings: false,
  },
};

const ROLE_LABELS: Record<UserRole, { label: string; description: string; color: string }> = {
  admin: { label: 'Administrateur', description: 'Accès complet à toutes les fonctionnalités', color: 'text-red-500' },
  manager: { label: 'Responsable', description: 'Gestion des workflows et des documents', color: 'text-blue-500' },
  reviewer: { label: 'Viseur', description: 'Peut viser et commenter les documents', color: 'text-green-500' },
  depositor: { label: 'Déposant', description: 'Peut déposer des documents et commenter', color: 'text-amber-500' },
  viewer: { label: 'Lecteur', description: 'Consultation uniquement', color: 'text-gray-500' },
};

interface PermissionState {
  currentUser: UserProfile;
  permissions: Permission;

  setCurrentUser: (user: UserProfile) => void;
  setRole: (role: UserRole) => void;
  hasPermission: (key: keyof Permission) => boolean;
  getRoleLabel: (role: UserRole) => typeof ROLE_LABELS[UserRole];
  getAllRoles: () => { role: UserRole; info: typeof ROLE_LABELS[UserRole]; permissions: Permission }[];
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  currentUser: {
    id: 'user-1',
    name: 'Marie Dupont',
    email: 'marie.dupont@example.com',
    role: 'admin',
  },
  permissions: ROLE_PERMISSIONS.admin,

  setCurrentUser: (user) => set({
    currentUser: user,
    permissions: ROLE_PERMISSIONS[user.role],
  }),

  setRole: (role) => set((s) => ({
    currentUser: { ...s.currentUser, role },
    permissions: ROLE_PERMISSIONS[role],
  })),

  hasPermission: (key) => get().permissions[key],

  getRoleLabel: (role) => ROLE_LABELS[role],

  getAllRoles: () => (Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((role) => ({
    role,
    info: ROLE_LABELS[role],
    permissions: ROLE_PERMISSIONS[role],
  })),
}));
