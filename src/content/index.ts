// src/content/index.ts
import { ContentManager } from './ContentManager';
import { createLogger } from '$lib/utils/logger';

const logger = createLogger('ContentScript');
logger.info('🚀 Content script initializing...');

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
    logger.info('📊 Analytics initialized in content script');
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

    // Check if chrome runtime is available to avoid context invalidation errors
    if (!chrome.runtime?.id) {
      console.warn('🔊 Chrome runtime not available, extension context may be invalidated');
      return;
    }

    manager = new ContentManager();
    logger.info('🔊 ContentManager initialized successfully');

    // Initialize analytics after content manager is ready
    initializeAnalytics();
  } catch (error) {
    console.error('🔊 Error initializing ContentManager:', error);

    // Check if this is an extension context error
    if (
      error instanceof Error &&
      (error.message.includes('Extension context invalidated') ||
        error.message.includes('chrome-extension://invalid/'))
    ) {
      logger.info(
        '🔊 Extension context invalidated during initialization - user should refresh page'
      );
    }
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

// Handle page visibility changes which can cause extension context issues
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && manager) {
    // Check if extension context is still valid when page becomes visible
    try {
      if (!chrome.runtime?.id) {
        console.warn(
          '🔊 Extension context invalid after visibility change - manager needs refresh'
        );
        manager = null;
        initializeContentManager();
      }
    } catch (error) {
      console.warn('🔊 Extension context check failed after visibility change:', error);
    }
  }
});

// Listen for extension lifecycle events
if (chrome.runtime?.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    logger.info('🔊 Extension startup detected, reinitializing...');
    manager = null;
    initializeContentManager();
  });
}

// Handle browser focus events which can indicate service worker restart
window.addEventListener('focus', () => {
  if (!manager) {
    logger.info('🔊 Window focus detected without manager, reinitializing...');
    initializeContentManager();
  }
});

// Export for extension updates/reloads if needed
export const onExecute = ({ perf }: { perf: { injectTime: number; loadTime: number } }) => {
  logger.info('🚀 Content script reinitializing...', perf);
  if (manager) {
    manager.reinitialize();
  } else {
    // If manager wasn't created yet, try to initialize now
    waitForDOMReady();
  }
};
