import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import { resolve } from 'path';
import preprocess from 'svelte-preprocess';
import { assertAnalyticsSecretNotBundled } from './src/lib/utils/analyticsReleasePolicy';

export function manifestWithAssets() {
  return {
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
}

export namespace manifestWithAssets {
  export const artifact = 'manifestWithAssets';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_GA4_API_SECRET');
  assertAnalyticsSecretNotBundled(process.env.VITE_GA4_API_SECRET || env.VITE_GA4_API_SECRET);
  return {
    plugins: [
      svelte({
        preprocess: preprocess(),
        compilerOptions: {
          dev: mode === 'development',
        },
      }),
      crx({ manifest: manifestWithAssets() }),
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
          logs: resolve(__dirname, 'src/pages/logs.html'),
        },
        output: {
          format: 'esm',
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'logs') {
              return 'pages/[name].js';
            }
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
