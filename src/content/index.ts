// src/content/index.ts
import { ContentManager } from './ContentManager';

console.log('🚀 Content script initializing...');

let manager: ContentManager | null = null;
let analyticsInitialized = false;

/**
 * Send analytics event to background script
 */
function sendAnalyticsToBackground(eventType: string, eventData: any) {
  try {
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      eventType,
      eventData,
    });
  } catch (error) {
    console.error('Failed to send analytics to background:', error);
  }
}

/**
 * Initialize analytics tracking
 */
async function initializeAnalytics() {
  if (analyticsInitialized) return;

  try {
    // Track that content script was loaded on bolt.new
    sendAnalyticsToBackground('extension_opened', { context: 'content_script' });

    // Check if this is a Bolt project page
    if (window.location.href.includes('bolt.new/~/')) {
      sendAnalyticsToBackground('bolt_project_event', {
        eventType: 'detected',
        projectMetadata: {
          projectName: window.location.pathname.split('/').pop() || 'unknown',
        },
      });
    }

    analyticsInitialized = true;
    console.log('📊 Analytics initialized in content script');
  } catch (error) {
    console.error('Failed to initialize analytics:', error);
  }
}

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

    // Initialize analytics after content manager is ready
    initializeAnalytics();
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
