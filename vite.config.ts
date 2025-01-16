import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' assert { type: 'json' };
import { resolve } from 'path';
import preprocess from 'svelte-preprocess';

// Update manifest with asset paths
const manifestWithAssets = {
  ...manifest,
  icons: {
    '16': 'assets/icons/icon16.png',
    '48': 'assets/icons/icon48.png',
    '128': 'assets/icons/icon128.png',
  },
  action: {
    ...manifest.action,
    default_icon: {
      '16': 'assets/icons/icon16.png',
      '48': 'assets/icons/icon48.png',
      '128': 'assets/icons/icon128.png',
    },
  },
};

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      svelte({
        preprocess: preprocess(),
        compilerOptions: {
          dev: mode === 'development',
        },
      }),
      crx({ manifest: manifestWithAssets }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: mode === 'production',
      sourcemap: mode === 'development',
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background/index.ts'),
          content: resolve(__dirname, 'src/content/index.ts'),
        },
        output: {
          format: 'esm',
          entryFileNames: (chunkInfo) => {
            const folder = chunkInfo.name.includes('background') ? 'background' : 'content';
            return `${folder}/[name].js`;
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.includes('assets/')) {
              return '[name][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
    },
    resolve: {
      alias: {
        $lib: resolve(__dirname, './src/lib'),
        buffer: 'buffer/',
      },
    },
    define: {
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(mode),
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
    publicDir: 'assets',
  };
});
