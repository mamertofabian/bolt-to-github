import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' assert { type: 'json' };

export default defineConfig({
  plugins: [
    svelte(),
    crx({ manifest }),
  ],
  build: {
    target: 'esnext',
    emptyOutDir: true,
    minify: false,
  }
});
