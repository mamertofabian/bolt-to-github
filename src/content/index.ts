// src/content/index.ts
import { ContentManager } from './ContentManager';

console.log('🚀 Content script initializing...');
const manager = new ContentManager();

// Export for extension updates/reloads if needed
export const onExecute = ({ perf }: { perf: { injectTime: number; loadTime: number } }) => {
  console.log('🚀 Content script reinitializing...', perf);
  manager.reinitialize();
};
