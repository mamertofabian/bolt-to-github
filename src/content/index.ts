// src/content/index.ts
import { ContentManager } from './ContentManager';

console.log('🚀 Content script initializing...');

let manager: ContentManager | null = null;

/**
 * Initialize the content manager when DOM is ready
 */
function initializeContentManager() {
  try {
    // Ensure we have the minimum DOM elements needed
    if (!document.body) {
      console.warn('🔊 document.body not available yet, retrying...');
      setTimeout(initializeContentManager, 100);
      return;
    }

    manager = new ContentManager();
    console.log('🔊 ContentManager initialized successfully');
  } catch (error) {
    console.error('🔊 Error initializing ContentManager:', error);
  }
}

/**
 * Wait for DOM to be ready before initializing
 */
function waitForDOMReady() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeContentManager, { once: true });
  } else {
    // DOM is already ready
    initializeContentManager();
  }
}

// Start initialization
waitForDOMReady();

// Export for extension updates/reloads if needed
export const onExecute = ({ perf }: { perf: { injectTime: number; loadTime: number } }) => {
  console.log('🚀 Content script reinitializing...', perf);
  if (manager) {
    manager.reinitialize();
  } else {
    // If manager wasn't created yet, try to initialize now
    waitForDOMReady();
  }
};
