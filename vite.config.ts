import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' assert { type: 'json' };
import { resolve } from 'path';
import preprocess from 'svelte-preprocess';

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      svelte({
        preprocess: preprocess(),
        compilerOptions: {
          dev: mode === 'development'
        }
      }),
      crx({ manifest }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      minify: mode === 'production',
      sourcemap: mode === 'development',
      rollupOptions: {
        input: {
          background: resolve(__dirname, 'src/background.ts'),
          uploadStatus: resolve(__dirname, 'src/content/upload-status.ts'),
        },
        output: {
          format: 'esm',
          entryFileNames: '[name].js',
          chunkFileNames: 'assets/[name]-[hash].js',
        }
      }
    },
    resolve: {
      alias: {
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
        port: 5173
      }
    }
  };
});
