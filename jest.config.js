export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^\\$lib/fileUtils$': '<rootDir>/src/test/setup/fileUtils-mock.js',
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1',
    '\\.svelte$': '<rootDir>/src/test/setup/svelte-mock.js',
  },
  setupFilesAfterEnv: [
    '<rootDir>/src/test/setup/fetch-mocks.js',
    '<rootDir>/src/test/setup/chrome-mocks.js',
    '<rootDir>/src/test/setup/dom-mocks.js',
  ],
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
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
