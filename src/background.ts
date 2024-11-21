import { ZipProcessor } from './lib/zip';
import { GitHubService } from './lib/github';

class BackgroundService {
  private githubService: GitHubService | null = null;
  
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
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url?.includes('bolt.new')) {
        console.log('📄 Bolt.new page detected, injecting interceptor...');
        
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
              const debug = (msg: string) => {
                console.log(`[Content Script] ${msg}`);
                chrome.runtime.sendMessage({ type: 'DEBUG', message: msg });
              };

              debug('Content script starting initialization');

              // Function to handle blob URL
              const handleBlobUrl = async (blobUrl: string) => {
                debug(`Processing blob URL: ${blobUrl}`);
                try {
                  const response = await fetch(blobUrl);
                  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                  
                  const blob = await response.blob();
                  debug(`Fetched blob, size: ${blob.size} bytes`);
                  
                  const reader = new FileReader();
                  reader.onload = () => {
                    const base64data = reader.result?.toString().split(',')[1];
                    if (base64data) {
                      debug('Converting blob to base64 and sending to background');
                      chrome.runtime.sendMessage({
                        type: 'ZIP_DATA',
                        data: base64data
                      }, (response) => {
                        debug(`Background script response: ${JSON.stringify(response)}`);
                      });
                    }
                  };
                  reader.onerror = () => debug(`FileReader error: ${reader.error}`);
                  reader.readAsDataURL(blob);
                } catch (error) {
                  debug(`Error processing blob: ${error}`);
                }
              };

              // Intercept the download click
              document.addEventListener('click', async (e) => {
                const target = e.target as HTMLElement;
                debug(`Click detected on element: ${target.tagName}`);
                
                if (target instanceof HTMLElement) {
                  debug(`Element attributes: ${Array.from(target.attributes)
                    .map(attr => `${attr.name}="${attr.value}"`)
                    .join(', ')}`);
                }

                // Find the closest download link or button
                const downloadElement = target.closest('a[download], button[download]');
                if (downloadElement) {
                  debug('Download element found!');
                  e.preventDefault();
                  e.stopPropagation();

                  // Look for visible or hidden download links
                  const downloadLinks = document.querySelectorAll('a[download][href^="blob:"]');
                  debug(`Found ${downloadLinks.length} download links`);

                  for (const link of Array.from(downloadLinks)) {
                    const blobUrl = (link as HTMLAnchorElement).href;
                    debug(`Found blob URL: ${blobUrl}`);
                    await handleBlobUrl(blobUrl);
                  }
                }
              }, true);

              debug('Content script initialization complete');
            }
          });
          
          console.log('✅ Interceptor injected into tab:', tabId);
        } catch (error) {
          console.error('❌ Error injecting interceptor:', error);
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
            
            // Process the ZIP file
            await this.processZipFile(blob);
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

  private async processZipFile(blob: Blob) {
    if (!this.githubService) {
      throw new Error('GitHub service not initialized. Please set your GitHub token.');
    }

    console.log('🗜️ Processing ZIP file...');
    const files = await ZipProcessor.processZipBlob(blob);
    console.log('📂 ZIP contents:', Array.from(files.keys()));
    
    const { repoOwner, repoName, branch } = await chrome.storage.sync.get([
      'repoOwner',
      'repoName',
      'branch'
    ]);
    
    if (!repoOwner || !repoName) {
      throw new Error('Repository details not configured');
    }

    console.log('📋 Repository details:', { repoOwner, repoName, branch });

    for (const [filename, content] of files.entries()) {
      console.log(`📄 Processing file: ${filename}`);
      
      await this.githubService.pushFile({
        owner: repoOwner,
        repo: repoName,
        path: filename,
        content: btoa(content),
        branch: branch || 'main',
        message: `Add ${filename} from bolt.new`
      });
      
      console.log(`✅ File pushed: ${filename}`);
    }
  }
}

// Initialize background service
new BackgroundService();
