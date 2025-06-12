/**
 * Content script for bolt2github.com welcome page
 *
 * This script facilitates communication between the welcome page and the extension,
 * allowing the page to check extension status and interact with the extension.
 */

import { createLogger } from '../lib/utils/logger';

const logger = createLogger('WelcomePageContentScript');

// Initialize content script
logger.info('Welcome page content script initialized', {
  url: window.location.href,
  extensionId: chrome.runtime.id,
});

// Inject a script to make extension ID available to the page
const script = document.createElement('script');
script.setAttribute('data-extension-id', chrome.runtime.id);
script.textContent = `
  window.BOLT2GITHUB_EXTENSION_ID = '${chrome.runtime.id}';
`;
document.documentElement.appendChild(script);

// Listen for messages from the welcome page
window.addEventListener('message', async (event) => {
  // Only accept messages from the same origin
  if (event.origin !== 'https://bolt2github.com') {
    return;
  }

  // Only accept messages from the same window
  if (event.source !== window) {
    return;
  }

  // Check if message is from our welcome page
  if (!event.data || event.data.source !== 'bolt2github-welcome') {
    return;
  }

  logger.info('Received message from welcome page', { type: event.data.type });

  try {
    switch (event.data.type) {
      case 'getExtensionStatus':
        // Forward to background script
        chrome.runtime.sendMessage({ type: 'getExtensionStatus' }, (response) => {
          if (chrome.runtime.lastError) {
            logger.error('Error getting extension status:', chrome.runtime.lastError);
            window.postMessage(
              {
                source: 'bolt2github-extension',
                type: 'error',
                error: chrome.runtime.lastError.message,
              },
              'https://bolt2github.com'
            );
            return;
          }

          if (response && response.success) {
            window.postMessage(
              {
                source: 'bolt2github-extension',
                type: 'extensionStatus',
                data: response.data,
              },
              'https://bolt2github.com'
            );
          } else {
            window.postMessage(
              {
                source: 'bolt2github-extension',
                type: 'error',
                error: response?.error || 'Failed to get extension status',
              },
              'https://bolt2github.com'
            );
          }
        });
        break;

      case 'completeOnboardingStep':
        // Forward to background script
        chrome.runtime.sendMessage(
          {
            type: 'completeOnboardingStep',
            step: event.data.step,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              logger.error('Error completing onboarding step:', chrome.runtime.lastError);
              window.postMessage(
                {
                  source: 'bolt2github-extension',
                  type: 'error',
                  error: chrome.runtime.lastError.message,
                },
                'https://bolt2github.com'
              );
              return;
            }

            window.postMessage(
              {
                source: 'bolt2github-extension',
                type: 'onboardingStepCompleted',
                success: response?.success || false,
              },
              'https://bolt2github.com'
            );
          }
        );
        break;

      case 'initiateGitHubAuth':
        // Forward to background script
        chrome.runtime.sendMessage(
          {
            type: 'initiateGitHubAuth',
            method: event.data.method,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              logger.error('Error initiating GitHub auth:', chrome.runtime.lastError);
              window.postMessage(
                {
                  source: 'bolt2github-extension',
                  type: 'error',
                  error: chrome.runtime.lastError.message,
                },
                'https://bolt2github.com'
              );
              return;
            }

            window.postMessage(
              {
                source: 'bolt2github-extension',
                type: 'authInitiated',
                success: response?.success || false,
                authUrl: response?.authUrl,
              },
              'https://bolt2github.com'
            );
          }
        );
        break;

      case 'getExtensionCapabilities':
        // Get capabilities from storage
        chrome.storage.local.get(['extensionCapabilities'], (result) => {
          const capabilities = result.extensionCapabilities || [
            'zip_upload',
            'issue_management',
            'branch_management',
          ];

          window.postMessage(
            {
              source: 'bolt2github-extension',
              type: 'extensionCapabilities',
              capabilities,
            },
            'https://bolt2github.com'
          );
        });
        break;

      default:
        logger.warn('Unknown message type from welcome page:', event.data.type);
    }
  } catch (error) {
    logger.error('Error handling welcome page message:', error);
    window.postMessage(
      {
        source: 'bolt2github-extension',
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'https://bolt2github.com'
    );
  }
});
