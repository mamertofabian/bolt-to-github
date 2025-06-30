import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { defineConfig, mergeConfig } from 'vite';
import { defineConfig as defineTestConfig } from 'vitest/config';

export default mergeConfig(
  defineConfig({
    plugins: [
      svelte({
        hot: !process.env.VITEST,
        compilerOptions: {
          dev: true,
        },
      }),
    ],
    resolve: {
      alias: {
        $lib: resolve(__dirname, './src/lib'),
      },
    },
  }),
  defineTestConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup/vitest-setup.ts'],
      coverage: {
        reporter: ['text', 'json', 'html'],
        exclude: [
          'node_modules/',
          'src/test/',
          'src/**/*.test.ts',
          'src/**/*.spec.ts',
          'src/**/__tests__/**',
          'src/**/__mocks__/**',
        ],
      },
      include: ['src/**/*.{test,spec}.{js,ts}'],
      deps: {
        optimizer: {
          web: {
            include: ['svelte'],
          },
        },
      },
      server: {
        deps: {
          inline: ['svelte'],
        },
      },
    },
  })
);
