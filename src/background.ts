import { ZipProcessor } from './lib/zip';
import { GitHubService } from './lib/github';

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
                  // Uncomment to prevent the default download behavior
                  // e.preventDefault();
                  // e.stopPropagation();

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

  // Safely converts a string to base64, handling Unicode characters
  private toBase64(str: string): string {
    const utf8Bytes = new TextEncoder().encode(str);
    let binaryString = '';
    utf8Bytes.forEach(byte => {
      binaryString += String.fromCharCode(byte);
    });
    return btoa(binaryString);
  }

  private async updateStatus(status: 'uploading' | 'success' | 'error', progress: number = 0, message: string = '') {
    console.log('📊 Updating status:', { status, progress, message });

    try {
      // Send status to active tabs
      const statusUpdate = {
        type: 'UPLOAD_STATUS',
        status,
        progress,
        message
      };

      // Send to all active upload tabs
      for (const tabId of this.activeUploadTabs) {
        try {
          await chrome.tabs.sendMessage(tabId, statusUpdate).catch(() => {
            // If sending fails, remove the tab from active tabs
            this.activeUploadTabs.delete(tabId);
          });
        } catch (error) {
          console.log(`Failed to send to tab ${tabId}:`, error);
        }
      }

      // Also send to popup if it's open
      try {
        await chrome.runtime.sendMessage(statusUpdate);
      } catch (error) {
        // Ignore errors when popup is closed
        if (!error.toString().includes('Receiving end does not exist')) {
          console.error('Error sending to popup:', error);
        }
      }
    } catch (error) {
      console.error('Error in updateStatus:', error);
    }
  }

  private async processZipFile(blob: Blob) {
    if (!this.githubService) {
      await this.updateStatus('error', 0, 'GitHub service not initialized. Please set your GitHub token.');
      throw new Error('GitHub service not initialized. Please set your GitHub token.');
    }

    try {
      await this.updateStatus('uploading', 0, 'Processing ZIP file...');

      console.log('🗜️ Processing ZIP file...');
      const files = await ZipProcessor.processZipBlob(blob);

      await this.updateStatus('uploading', 10, 'Preparing files...');

      const { repoOwner, repoName, branch } = await chrome.storage.sync.get([
        'repoOwner',
        'repoName',
        'branch'
      ]);

      if (!repoOwner || !repoName) {
        throw new Error('Repository details not configured');
      }

      const targetBranch = branch || 'main';
      console.log('📋 Repository details:', { repoOwner, repoName, targetBranch });

      // Process files
      const processedFiles = new Map<string, string>();
      for (const [path, content] of files.entries()) {
        if (path.endsWith('/') || !content.trim()) {
          console.log(`📁 Skipping entry: ${path}`);
          continue;
        }

        const normalizedPath = path.startsWith('project/') ? path.slice(8) : path;
        processedFiles.set(normalizedPath, content);
      }

      await this.updateStatus('uploading', 20, 'Getting repository information...');

      // Get the current commit SHA
      const baseRef = await this.githubService.request('GET', `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`);
      const baseSha = baseRef.object.sha;

      const baseCommit = await this.githubService.request('GET', `/repos/${repoOwner}/${repoName}/git/commits/${baseSha}`);
      const baseTreeSha = baseCommit.tree.sha;

      await this.updateStatus('uploading', 30, 'Creating file blobs...');

      // Create blobs for all files
      const totalFiles = processedFiles.size;
      let completedFiles = 0;

      const treeItems = await Promise.all(
        Array.from(processedFiles.entries()).map(async ([path, content]) => {
          const blobData = await this.githubService!.request('POST', `/repos/${repoOwner}/${repoName}/git/blobs`, {
            content: this.toBase64(content),
            encoding: 'base64'
          });

          completedFiles++;
          const progress = 30 + Math.floor((completedFiles / totalFiles) * 30);
          await this.updateStatus('uploading', progress, `Creating blob ${completedFiles}/${totalFiles}...`);

          return {
            path,
            mode: '100644',
            type: 'blob',
            sha: blobData.sha
          };
        })
      );

      await this.updateStatus('uploading', 70, 'Creating tree...');

      // Create a new tree
      const newTree = await this.githubService.request('POST', `/repos/${repoOwner}/${repoName}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeItems
      });

      await this.updateStatus('uploading', 80, 'Creating commit...');

      // Create a new commit
      const newCommit = await this.githubService.request('POST', `/repos/${repoOwner}/${repoName}/git/commits`, {
        message: `Add/update files from bolt.new\n\nUploaded ${treeItems.length} files`,
        tree: newTree.sha,
        parents: [baseSha]
      });

      await this.updateStatus('uploading', 90, 'Updating branch...');

      // Update the reference
      await this.githubService.request('PATCH', `/repos/${repoOwner}/${repoName}/git/refs/heads/${targetBranch}`, {
        sha: newCommit.sha,
        force: false
      });

      await this.updateStatus('success', 100, `Successfully uploaded ${processedFiles.size} files to GitHub`);

      // Clear the status after a delay
      setTimeout(() => {
        this.updateStatus('idle', 0, '');
      }, 5000);

    } catch (error) {
      console.error('❌ Error uploading files:', error);
      await this.updateStatus(
        'error',
        0,
        `Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      throw error;
    }
  }
}

// Initialize background service
new BackgroundService();
