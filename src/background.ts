import type { GitHubSettingsInterface } from '$lib/types';
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
    this.initializeStorageListener();
    console.log('👂 Listeners initialized');
  }

  private async initializeGitHubService() {
    try {
      const result = await chrome.storage.sync.get([
        'githubToken',
        'repoOwner',
        'projectSettings'
      ]);
      
      if (this.isValidSettings(result)) {
        console.log('✅ Valid settings found, initializing GitHub service');
        this.githubService = new GitHubService(result.githubToken);
      } else {
        console.log('❌ Invalid or incomplete settings');
        this.githubService = null;
      }
    } catch (error) {
      console.error('Failed to initialize GitHub service:', error);
      this.githubService = null;
    }
  }

  private isValidSettings(settings: Partial<GitHubSettingsInterface>): settings is GitHubSettingsInterface {
    return Boolean(
      settings.githubToken &&
      settings.repoOwner
    );
  }

  private initializeStorageListener() {
    // Listen for changes to the storage
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync') {
        const settingsChanged = ['githubToken', 'repoOwner', 'repoName', 'branch']
          .some(key => key in changes);

        if (settingsChanged) {
          console.log('🔄 GitHub settings changed, reinitializing service...');
          this.initializeGitHubService();
        }
      }
    });
  }

  private initializeListeners() {
    // Listen for content script ready messages and other types of messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'CONTENT_SCRIPT_READY' && sender.tab?.id) {
        console.log('📝 Content script ready in tab:', sender.tab.id);
        this.activeUploadTabs.add(sender.tab.id);
        sendResponse({ received: true });
      }

      // Handle settings popup open request
      if (message.type === 'OPEN_SETTINGS') {
        console.log('📝 Opening settings popup');
        chrome.action.openPopup();
        sendResponse({ received: true });
      }

      if (message.type === 'DEBUG') {
        // console.log(`[Content Debug] ${message.message}`);
        sendResponse({ received: true });
        return true;
      }

      if (message.type === 'ZIP_DATA' && message.data) {
        console.log('📦 Received ZIP data, processing...');

        (async () => {
          try {
            const projectId = await chrome.storage.sync.get('projectId');
            console.log('📦 Project ID:', projectId);

            if (!projectId?.projectId) {
              throw new Error('Project ID is not set. Please check your Bolt.new settings.');
            }

            if (!this.githubService) {
              throw new Error('GitHub service is not initialized. Please check your GitHub settings.');
            }

            // Convert base64 to blob
            const binaryStr = atob(message.data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'application/zip' });

            await processZipFile(blob, this.githubService, this.activeUploadTabs, projectId.projectId);
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

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.activeUploadTabs.delete(tabId);
    });
    
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (tab.url?.includes('bolt.new/~/')) {
        const parsedProjectId = tab.url?.match(/bolt\.new\/~\/([^\/]+)/)?.[1] || null;
        await chrome.storage.sync.set({ projectId: parsedProjectId });

        if (changeInfo.status === 'complete') {
          console.log(`📄 Bolt.new page detected, injecting features... ${parsedProjectId}`);
      
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
      }
    });
  }
}

// Initialize background service
new BackgroundService();
