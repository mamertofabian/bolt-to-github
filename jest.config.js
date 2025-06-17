export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          verbatimModuleSyntax: false,
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^\\$lib/fileUtils$': '<rootDir>/src/test/setup/fileUtils-mock.js',
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    '\\.svelte$': '<rootDir>/src/test/setup/svelte-mock.js',
    'svelte/store': '<rootDir>/src/test/setup/svelte-store-mock.js',
  },
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setup/fetch-mocks.js',
    '<rootDir>/src/test/setup/chrome-mocks.js',
    '<rootDir>/src/test/setup/dom-mocks.js',
    '<rootDir>/src/test/setup/console-mocks.js',
  ],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.*/__tests__/.*test-fixtures/.*'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coveragePathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/background/test-fixtures/',
    '<rootDir>/src/content/test-fixtures/',
    '<rootDir>/src/services/__tests__/test-fixtures/',
  ],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  // Temporary disabled until the threshold is met
  // coverageThreshold: {
  //   global: {
  //     branches: 60,
  //     functions: 60,
  //     lines: 60,
  //     statements: 60,
  //   },
  // },
};
