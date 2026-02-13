import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      external: ['trimble-connect-workspace-api'],
      output: {
        globals: {
          'trimble-connect-workspace-api': 'TrimbleConnectWorkspace',
        },
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'react-flow': ['@xyflow/react'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-dropdown-menu'],
          'table': ['@tanstack/react-table'],
          'pdf-export': ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
