import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // Rapier WASM must not be pre-bundled by Vite
    exclude: ['@dimforge/rapier3d-compat'],
  },
  build: {
    // Required for top-level await used in Rapier init
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vrm: ['@pixiv/three-vrm'],
        },
      },
    },
  },
  // Ensures WASM MIME type is served correctly in dev
  assetsInclude: ['**/*.wasm'],
});
