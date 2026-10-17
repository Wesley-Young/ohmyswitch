import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

import { fileURLToPath } from 'node:url';

const devPort = 5173;

export default defineConfig({
  main: {
    build: {
      // Bundle runtime dependencies into out/main instead of shipping node_modules inside app.asar.
      externalizeDeps: false,
      rollupOptions: { input: { index: fileURLToPath(new URL('src/main/index.ts', import.meta.url)) } },
    },
  },
  renderer: {
    root: 'src/renderer',
    publicDir: fileURLToPath(new URL('assets/brand', import.meta.url)),
    resolve: { alias: { '@': fileURLToPath(new URL('src/renderer', import.meta.url)) } },
    plugins: [react(), tailwindcss()],
    build: {
      minify: true,
      // Loaded from local disk, so one larger chunk costs nothing over the network.
      chunkSizeWarningLimit: 1024,
      rollupOptions: { input: { index: fileURLToPath(new URL('src/renderer/index.html', import.meta.url)) } },
    },
    // In development the main process proxies app://ohmyswitch/* to this server, so the page origin is
    // app://ohmyswitch and the HMR client cannot infer the socket address from it.
    server: {
      host: 'localhost',
      port: devPort,
      strictPort: true,
      hmr: { protocol: 'ws', host: 'localhost', port: devPort },
    },
  },
});
