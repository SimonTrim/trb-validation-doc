// ============================================================================
// API Client — Couche d'abstraction pour les appels API
// ============================================================================

import { useAuthStore } from '@/stores/authStore';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '/api';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
}

/** Execute a single fetch with given token */
async function doFetch<T>(endpoint: string, options: RequestOptions, token: string, region: string): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;
  const url = `${BACKEND_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Project-Region': region,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new ApiError(response.status, response.statusText, errorBody);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

/** Client API avec gestion automatique du token, de la région, et refresh sur 401 */
export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, region } = useAuthStore.getState();

  if (!accessToken) {
    // Try refreshing the token before giving up
    const { refreshAccessToken } = await import('./workspaceApi');
    const freshToken = await refreshAccessToken();
    if (!freshToken) {
      throw new Error('No access token available — extension is not connected to Trimble Connect');
    }
    return doFetch<T>(endpoint, options, freshToken, region);
  }

  try {
    return await doFetch<T>(endpoint, options, accessToken, region);
  } catch (error) {
    // On 401, try refreshing the token once
    if (error instanceof ApiError && error.status === 401) {
      console.warn('[apiClient] 401 received, attempting token refresh...');
      const { refreshAccessToken } = await import('./workspaceApi');
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        return doFetch<T>(endpoint, options, freshToken, region);
      }
    }
    throw error;
  }
}

/** Erreur API custom */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: string
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

/** Retry avec backoff exponentiel */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries) throw error;
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw error; // Don't retry client errors
      }
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries reached');
}
