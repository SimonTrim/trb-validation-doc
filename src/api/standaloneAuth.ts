// ============================================================================
// STANDALONE AUTH — OAuth 2.0 Authorization Code flow
// Utilisé quand l'extension est lancée en dehors de Trimble Connect (dev/test)
// ============================================================================

import { useAuthStore } from '@/stores/authStore';
import { getRegionCode } from '@/models/trimble';

const CLIENT_ID = import.meta.env.VITE_TRIMBLE_CLIENT_ID || '';
const REDIRECT_URI = import.meta.env.VITE_TRIMBLE_REDIRECT_URI || `${window.location.origin}/auth/callback`;
const TRIMBLE_ENV = import.meta.env.VITE_TRIMBLE_ENVIRONMENT || 'production';

/** URLs OAuth en fonction de l'environnement */
function getOAuthUrls() {
  if (TRIMBLE_ENV === 'staging') {
    return {
      authorize: 'https://stage.id.trimble.com/oauth/authorize',
      token: 'https://stage.id.trimble.com/oauth/token',
    };
  }
  return {
    authorize: 'https://id.trimble.com/oauth/authorize',
    token: 'https://id.trimble.com/oauth/token',
  };
}

/** Démarre le flux OAuth (redirige vers Trimble Identity) */
export function startOAuthFlow(): void {
  if (!CLIENT_ID) {
    console.error('[StandaloneAuth] No TRIMBLE_CLIENT_ID configured');
    useAuthStore.getState().setError('Configuration OAuth manquante (TRIMBLE_CLIENT_ID)');
    return;
  }

  const { authorize } = getOAuthUrls();
  const state = crypto.randomUUID();
  sessionStorage.setItem('oauth_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid',
    state,
  });

  window.location.href = `${authorize}?${params.toString()}`;
}

/** Gère le callback OAuth (échange code → token via le backend) */
export async function handleOAuthCallback(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    useAuthStore.getState().setError(`OAuth error: ${error}`);
    return false;
  }

  if (!code) return false;

  // Vérifier state CSRF
  const savedState = sessionStorage.getItem('oauth_state');
  if (state !== savedState) {
    useAuthStore.getState().setError('OAuth state mismatch — possible CSRF attack');
    return false;
  }
  sessionStorage.removeItem('oauth_state');

  try {
    const store = useAuthStore.getState();
    store.setLoading(true);

    // Échanger le code via le backend (qui détient le client_secret)
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';
    const response = await fetch(`${BACKEND_URL}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: REDIRECT_URI }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`);
    }

    const tokenData = await response.json();

    store.setAccessToken(tokenData.access_token);
    store.setConnected(true);

    // Stocker le refresh token pour le renouvellement
    if (tokenData.refresh_token) {
      sessionStorage.setItem('refresh_token', tokenData.refresh_token);
    }

    // Nettoyer l'URL (enlever les paramètres OAuth)
    window.history.replaceState({}, '', window.location.pathname);

    return true;
  } catch (err) {
    console.error('[StandaloneAuth] Token exchange failed:', err);
    useAuthStore.getState().setError('Échec de l\'authentification OAuth');
    return false;
  }
}

/** Rafraîchit le token d'accès */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = sessionStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';
    const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) return false;

    const tokenData = await response.json();
    useAuthStore.getState().setAccessToken(tokenData.access_token);

    if (tokenData.refresh_token) {
      sessionStorage.setItem('refresh_token', tokenData.refresh_token);
    }

    return true;
  } catch {
    return false;
  }
}

/** Déconnexion (mode standalone) */
export function logout(): void {
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('oauth_state');
  useAuthStore.getState().reset();
}

/** Vérifie si un callback OAuth est en cours */
export function isOAuthCallback(): boolean {
  const url = new URL(window.location.href);
  return url.searchParams.has('code') || url.searchParams.has('error');
}

/** Configure le renouvellement automatique du token */
export function setupTokenRefresh(expiresInSeconds: number = 3600): void {
  // Renouveler 5 minutes avant l'expiration
  const refreshIn = Math.max((expiresInSeconds - 300) * 1000, 60000);

  setTimeout(async () => {
    const success = await refreshAccessToken();
    if (success) {
      setupTokenRefresh(expiresInSeconds);
    } else {
      console.warn('[StandaloneAuth] Token refresh failed, redirecting to login');
      startOAuthFlow();
    }
  }, refreshIn);
}
