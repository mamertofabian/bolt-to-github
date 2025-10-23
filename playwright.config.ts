import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Chrome extension E2E testing
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  // Maximum time one test can run (increased for extension operations)
  timeout: 60 * 1000,

  // Timeout for expect() assertions
  expect: {
    timeout: 10 * 1000,
  },

  // Run tests in parallel (disabled for Chrome extensions due to resource constraints)
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry failed tests for better stability
  // Chrome extensions can be flaky due to timing issues
  retries: process.env.CI ? 2 : 1,

  // Use single worker for stability (Chrome extensions are resource intensive)
  workers: 1,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
    // Add JSON reporter for CI/CD integration
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],

  // Global test setup and teardown
  globalTimeout: process.env.CI ? 60 * 60 * 1000 : 30 * 60 * 1000, // 1 hour in CI, 30 min locally

  // Shared settings for all the projects below
  use: {
    // Base URL for page.goto() calls
    baseURL: 'chrome://extensions',

    // Collect trace on first retry and on failure
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',

    // Screenshot on failure for debugging
    screenshot: 'only-on-failure',

    // Video on failure for debugging
    video: 'retain-on-failure',

    // Longer action timeout for extension interactions
    actionTimeout: 15 * 1000,

    // Navigation timeout for page loads
    navigationTimeout: 30 * 1000,

    // Slower actions for more stability
    actionDelay: process.env.CI ? 100 : 0,
  },

  // Configure projects for Chrome extension testing
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chrome-specific launch options for extension testing
        launchOptions: {
          // Extensions require headed mode
          headless: false,
          args: [
            '--disable-extensions-except=./dist',
            '--load-extension=./dist',
            // Additional stability flags
            '--disable-dev-shm-usage', // Overcome limited resource problems
            '--disable-gpu', // Disable GPU hardware acceleration
            '--no-sandbox', // Required for some CI environments
            '--disable-setuid-sandbox',
            // Performance flags
            '--disable-web-security', // Allow CORS for testing
            '--disable-features=IsolateOrigins,site-per-process',
            // Notification permissions
            '--enable-features=EnableNotificationPermissions',
          ],
          // Slow down to improve stability
          slowMo: process.env.CI ? 100 : 0,
        },
        // Viewport size
        viewport: { width: 1280, height: 720 },
        // Locale
        locale: 'en-US',
        // Timezone
        timezoneId: 'America/New_York',
      },
    },
  ],

  // Output directory for test artifacts
  outputDir: 'test-results/',

  // Web server to run before tests (optional)
  // Use this if you need to run a local server for testing
  // webServer: {
  //   command: 'npm run dev',
  //   port: 3000,
  //   timeout: 120 * 1000,
  //   reuseExistingServer: !process.env.CI,
  // },
});
