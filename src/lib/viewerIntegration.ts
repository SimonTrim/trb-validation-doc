// ============================================================================
// VIEWER INTEGRATION — Ouverture de fichiers dans la visionneuse TC
// Supporte la visionneuse 2D (PDF, DOC, XLS) et 3D (IFC, RVT, SKP)
// + annotations pour indiquer les problèmes sur les documents
// ============================================================================

import { getWorkspaceApi, isInTrimbleConnect } from '@/api/workspaceApi';

// ─── TYPES ──────────────────────────────────────────────────────────────────

/** Extensions supportées par la visionneuse 2D */
const VIEWER_2D_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'dwg', 'dxf', 'dwf', 'dgn',
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'svg',
];

/** Extensions supportées par la visionneuse 3D */
const VIEWER_3D_EXTENSIONS = [
  'ifc', 'rvt', 'rfa', 'skp', 'nwd', 'nwc', 'nwf',
  '3ds', 'obj', 'fbx', 'dae', 'stl', 'step', 'stp', 'iges', 'igs',
  'catpart', 'catproduct', 'sldprt', 'sldasm',
  'prt', 'asm', 'par', 'psm',
];

export type ViewerType = '2d' | '3d' | 'none';

/** Détermine le type de visionneuse approprié pour un fichier */
export function getViewerType(extension: string): ViewerType {
  const ext = extension.toLowerCase().replace('.', '');
  if (VIEWER_3D_EXTENSIONS.includes(ext)) return '3d';
  if (VIEWER_2D_EXTENSIONS.includes(ext)) return '2d';
  return 'none';
}

/** Retourne un label humain pour le type de visionneuse */
export function getViewerLabel(extension: string): string {
  const type = getViewerType(extension);
  switch (type) {
    case '3d':
      return 'Ouvrir dans la visionneuse 3D';
    case '2d':
      return 'Ouvrir dans la visionneuse 2D';
    default:
      return 'Aperçu non disponible';
  }
}

// ─── OUVRIR UN FICHIER DANS LA VISIONNEUSE ──────────────────────────────────

/**
 * Ouvre un fichier dans la visionneuse Trimble Connect.
 * Utilise le Workspace API pour naviguer vers le fichier.
 * Si hors de TC, ouvre la page web de TC dans un nouvel onglet.
 */
export async function openInViewer(
  fileId: string,
  fileName: string,
  projectId: string
): Promise<boolean> {
  const api = getWorkspaceApi();

  if (api && isInTrimbleConnect()) {
    try {
      // Méthode 1: Utiliser le Workspace API pour ouvrir le fichier
      // L'API TC gère automatiquement 2D vs 3D selon le type de fichier
      await api.viewer.openFile(fileId);
      return true;
    } catch (error) {
      console.warn('[Viewer] Workspace API openFile failed, trying alternative:', error);

      try {
        // Méthode 2: Naviguer vers la vue du fichier
        await api.ui.navigate({
          type: 'file',
          id: fileId,
        });
        return true;
      } catch (err2) {
        console.error('[Viewer] Navigation failed:', err2);
      }
    }
  }

  // Fallback: ouvrir dans un nouvel onglet (hors iframe TC)
  const tcBaseUrl = 'https://web.connect.trimble.com';
  const viewerUrl = `${tcBaseUrl}/projects/${projectId}/files/${fileId}`;
  window.open(viewerUrl, '_blank');
  return true;
}

// ─── ANNOTATIONS / MARKUPS ──────────────────────────────────────────────────

/**
 * Ouvre un fichier dans la visionneuse avec le mode annotation activé.
 * Permet au reviewer de placer des marqueurs sur le document.
 */
export async function openForAnnotation(
  fileId: string,
  fileName: string,
  projectId: string,
  context?: {
    reviewerName?: string;
    documentStatus?: string;
    comment?: string;
  }
): Promise<boolean> {
  const api = getWorkspaceApi();

  if (api && isInTrimbleConnect()) {
    try {
      // Ouvrir le fichier
      await api.viewer.openFile(fileId);

      // Activer les annotations / markups si disponible
      // Note: L'API exacte dépend de la version du Workspace API
      try {
        await api.viewer.enableMarkups?.();
      } catch {
        // Markups API non disponible dans cette version
      }

      // Créer un BCF topic si en mode 3D (IFC)
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      if (getViewerType(ext) === '3d') {
        try {
          // Créer un topic BCF pour les observations
          await api.bcf?.createTopic?.({
            title: `[Review] ${fileName} — ${context?.documentStatus || 'En revue'}`,
            description: context?.comment || `Annotations de ${context?.reviewerName || 'réviseur'}`,
            type: 'Issue',
            priority: 'Normal',
          });
        } catch {
          // BCF API non disponible
        }
      }

      return true;
    } catch (error) {
      console.error('[Viewer] Open for annotation failed:', error);
    }
  }

  // Fallback: ouvrir dans un nouvel onglet
  return openInViewer(fileId, fileName, projectId);
}

/**
 * Vérifie si un fichier peut être ouvert dans la visionneuse.
 */
export function canOpenInViewer(extension: string): boolean {
  return getViewerType(extension) !== 'none';
}

/**
 * Vérifie si les annotations sont supportées pour ce type de fichier.
 */
export function supportsAnnotations(extension: string): boolean {
  const ext = extension.toLowerCase().replace('.', '');
  // Annotations supportées pour les fichiers 2D (markup) et 3D (BCF)
  return VIEWER_2D_EXTENSIONS.includes(ext) || VIEWER_3D_EXTENSIONS.includes(ext);
}

/**
 * Retourne l'icône appropriée pour le type de visionneuse.
 */
export function getViewerIcon(extension: string): 'cube' | 'file-text' | 'eye' {
  const type = getViewerType(extension);
  switch (type) {
    case '3d':
      return 'cube';
    case '2d':
      return 'file-text';
    default:
      return 'eye';
  }
}
