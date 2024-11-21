import { GitHubService } from './lib/github';
import { injectUploadFeatures } from './services/buttonInjector';
import { processZipFile } from './services/zipHandler';

class BackgroundService {
  private githubService: GitHubService | null = null;
  private activeUploadTabs: Set<number> = new Set();

  constructor() {
    console.log('🚀 Background service initializing...');
    this.initializeGitHubService();
    this.initializeListeners();
    console.log('👂 Listeners initialized');
  }

  private async initializeGitHubService() {
    try {
      const result = await chrome.storage.sync.get(['githubToken']);
      console.log('📦 Retrieved GitHub token from storage:', result.githubToken ? '✅ Token found' : '❌ No token');
      if (result.githubToken) {
        this.githubService = new GitHubService(result.githubToken);
      }
    } catch (error) {
      console.error('Failed to initialize GitHub service:', error);
    }
  }

  private initializeListeners() {
    // Listen for content script ready messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'CONTENT_SCRIPT_READY' && sender.tab?.id) {
        console.log('📝 Content script ready in tab:', sender.tab.id);
        this.activeUploadTabs.add(sender.tab.id);
        sendResponse({ received: true });
      }
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.activeUploadTabs.delete(tabId);
    });
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url?.includes('bolt.new')) {
        console.log('📄 Bolt.new page detected, injecting features...');
    
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: injectUploadFeatures
          });
    
          console.log('✅ Features injected into tab:', tabId);
        } catch (error) {
          console.error('❌ Error injecting features:', error);
        }
      }
    });

    // Handle the ZIP data
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'DEBUG') {
        console.log(`[Content Debug] ${message.message}`);
        sendResponse({ received: true });
        return true;
      }

      if (message.type === 'ZIP_DATA' && message.data) {
        console.log('📦 Received ZIP data, processing...');

        (async () => {
          try {
            // Convert base64 to blob
            const binaryStr = atob(message.data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/zip' });

            if (!this.githubService) {
              throw new Error('GitHub service is not initialized');
            }
            await processZipFile(blob, this.githubService, this.activeUploadTabs);
            console.log('✅ ZIP processing complete');

            // Send success response back to content script
            sendResponse({ success: true });
          } catch (error) {
            console.error('❌ Error processing ZIP:', error);
            sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
          }
        })();

        return true; // Keep the message channel open
      }
    });
  }
}

// Initialize background service
new BackgroundService();
