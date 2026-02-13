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

/** Client API avec gestion automatique du token et de la région */
export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken, region } = useAuthStore.getState();
  const { method = 'GET', body, headers = {} } = options;

  if (!accessToken) {
    throw new Error('No access token available');
  }

  const url = `${BACKEND_URL}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
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
