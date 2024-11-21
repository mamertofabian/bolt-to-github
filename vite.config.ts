import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    svelte(),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        background: 'src/background.ts',
        popup: 'src/popup/index.html',
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});