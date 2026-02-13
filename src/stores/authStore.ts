import { create } from 'zustand';
import type { ConnectProject, ConnectUser } from '@/models/trimble';

interface AuthState {
  // State
  accessToken: string | null;
  project: ConnectProject | null;
  currentUser: ConnectUser | null;
  region: string;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  setAccessToken: (token: string) => void;
  setProject: (project: ConnectProject) => void;
  setCurrentUser: (user: ConnectUser) => void;
  setRegion: (region: string) => void;
  setConnected: (connected: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  project: null,
  currentUser: null,
  region: 'eu',
  isConnected: false,
  isLoading: true,
  error: null,

  setAccessToken: (token) => set({ accessToken: token }),
  setProject: (project) => set({ project }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setRegion: (region) => set({ region }),
  setConnected: (connected) => set({ isConnected: connected, isLoading: false }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () =>
    set({
      accessToken: null,
      project: null,
      currentUser: null,
      isConnected: false,
      isLoading: false,
      error: null,
    }),
}));
