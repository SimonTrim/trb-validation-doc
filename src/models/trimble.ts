// ============================================================================
// TRIMBLE CONNECT — Types pour les API Trimble Connect
// ============================================================================

/** Projet Trimble Connect */
export interface ConnectProject {
  id: string;
  name: string;
  location: string;   // 'europe' | 'northAmerica' | 'asia' | 'australia'
  rootId: string;
}

/** Fichier Trimble Connect */
export interface ConnectFile {
  id: string;
  name: string;
  extension: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  lastModified: string;
  parentId: string;
  versionId?: string;
  path?: string;
}

/** Dossier Trimble Connect */
export interface ConnectFolder {
  id: string;
  name: string;
  parentId: string;
  path?: string;
}

/** Utilisateur du projet */
export interface ConnectUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  status?: string;
}

/** Mapping region → host */
export function getRegionCode(location: string): string {
  const loc = location.toLowerCase();
  if (loc === 'northamerica' || loc === 'us') return 'us';
  if (loc === 'europe' || loc === 'eu') return 'eu';
  if (loc === 'asia' || loc === 'ap') return 'ap';
  if (loc === 'australia' || loc === 'ap-au') return 'ap-au';
  return 'us';
}

/** Obtenir l'URL de base Core API */
export function getCoreApiBaseUrl(region: string): string {
  const hosts: Record<string, string> = {
    us: 'app.connect.trimble.com',
    eu: 'app21.connect.trimble.com',
    ap: 'app31.connect.trimble.com',
    'ap-au': 'app32.connect.trimble.com',
  };
  const host = hosts[region] || hosts.us;
  return `https://${host}/tc/api/2.0`;
}

/** Obtenir l'URL de base BCF API */
export function getBcfApiBaseUrl(region: string): string {
  const hosts: Record<string, string> = {
    us: 'open11.connect.trimble.com',
    eu: 'open21.connect.trimble.com',
    ap: 'open31.connect.trimble.com',
    'ap-au': 'open32.connect.trimble.com',
  };
  const host = hosts[region] || hosts.us;
  return `https://${host}`;
}
