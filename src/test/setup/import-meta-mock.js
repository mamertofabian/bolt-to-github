// Mock import.meta.env before any modules are loaded
if (!global.import) {
  global.import = {};
}
if (!global.import.meta) {
  global.import.meta = {};
}
global.import.meta.env = {
  VITE_GA4_API_SECRET: 'test-api-secret',
};

// Also set process.env for compatibility
process.env.VITE_GA4_API_SECRET = 'test-api-secret';
