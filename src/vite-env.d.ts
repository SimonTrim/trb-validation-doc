/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Workspace API global type
declare const TrimbleConnectWorkspace: {
  connect: (
    target: Window | HTMLIFrameElement,
    onEvent: (event: string, data: any) => void,
    timeout?: number
  ) => Promise<any>;
};
