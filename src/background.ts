import { ZipProcessor } from './lib/zip';
import { GitHubService } from './lib/github';

class BackgroundService {
  // Store active downloads to handle them when blob data arrives
  private activeDownloads: Map<string, chrome.downloads.DownloadItem> = new Map();
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
    // Listen for download events from bolt.new
    chrome.downloads.onCreated.addListener(async (downloadItem) => {
      console.log('⬇️ Download detected:', downloadItem.url);
      if (downloadItem.url.includes('bolt.new')) {
        console.log('🎯 Bolt.new ZIP file detected, intercepting download...');
        
        // Store the download item with a unique identifier (download ID)
        this.activeDownloads.set(downloadItem.id.toString(), downloadItem);
        
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          console.log('👀 Active tab found:', tab);          
          if (!tab.id) throw new Error('No active tab found');

          console.log('📡 Injecting content script...');          
          
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (blobUrl, downloadId) => {
              try {
                console.log('Content script executing, fetching:', blobUrl);
                const response = await fetch(blobUrl.toString());
                const blob = await response.blob();
                const reader = new FileReader();

                return new Promise((resolve, reject) => {
                  reader.onload = () => {
                    const base64Data = reader.result?.toString().split(',')[1];
                    if (!base64Data) {
                      reject(new Error('Failed to read blob data'));
                      return;
                    }
                    // Send message with download ID
                    chrome.runtime.sendMessage({
                      type: 'BLOB_DATA',
                      downloadId: downloadId,
                      data: base64Data
                    });
                    resolve('Blob data sent to background script');
                  };
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(blob);
                });
              } catch (error) {
                console.error('Error in content script:', error);
                throw error;
              }
            },
            args: [downloadItem.url, downloadItem.id]
          });

          console.log('📡 Content script executed with results:', results);

        } catch (error) {
          console.error('❌ Error processing download:', error);
          // Clean up failed download
          this.activeDownloads.delete(downloadItem.id.toString());
        }
      }
    });

    // Message listener for blob data
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'BLOB_DATA' && message.downloadId) {
        console.log('📨 Received blob data from content script for download:', message.downloadId);
        
        // Retrieve the download item
        const downloadItem = this.activeDownloads.get(message.downloadId.toString());
        
        if (!downloadItem) {
          console.error('❌ No matching download found for ID:', message.downloadId);
          sendResponse({ success: false, error: 'Download not found' });
          return true;
        }

        try {
          const blob = this.base64ToBlob(message.data);
          console.log('🔄 Converted base64 to blob, size:', blob.size, 'bytes');
          
          // Handle the download
          this.handleDownload(downloadItem, blob)
            .then(() => {
              sendResponse({ success: true });
              // Clean up completed download
              this.activeDownloads.delete(message.downloadId.toString());
            })
            .catch(error => {
              console.error('Error handling download:', error);
              sendResponse({ success: false, error: error.message });
              // Clean up failed download
              this.activeDownloads.delete(message.downloadId.toString());
            });
          
          return true; // Keep the message channel open
        } catch (error) {
          console.error('Error processing blob data:', error);
          sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
          // Clean up failed download
          this.activeDownloads.delete(message.downloadId.toString());
          return true;
        }
      }
    });
  }

  private base64ToBlob(base64Data: string): Blob {
    const byteCharacters = atob(base64Data);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: 'application/zip' });
  }

  private async handleDownload(downloadItem: chrome.downloads.DownloadItem, blob: Blob) {
    try {
      console.log('📥 Processing ZIP content', {
        filename: downloadItem.filename,
        blobSize: blob.size,
        downloadId: downloadItem.id
      });
      
      // Process the ZIP file
      await this.processZipFile(blob);
      
      // Cancel the original download
      await chrome.downloads.cancel(downloadItem.id);
      console.log('✅ Download handled successfully:', {
        originalFilename: downloadItem.filename,
        downloadId: downloadItem.id
      });
    } catch (error) {
      throw new Error(`Failed to handle download: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processZipFile(blob: Blob) {
    try {
      if (!this.githubService) {
        throw new Error('GitHub service not initialized. Please set your GitHub token.');
      }

      console.log('🗜️ Processing ZIP file...');
      const files = await ZipProcessor.processZipBlob(blob);
      console.log('📂 ZIP contents loaded successfully');
      
      // Get repository details from storage
      const { repoOwner, repoName, branch } = await chrome.storage.sync.get([
        'repoOwner',
        'repoName',
        'branch'
      ]);
      console.log('📋 Repository details:', { repoOwner, repoName, branch });

      // Process each file in the ZIP
      for (const [filename, content] of files.entries()) {
        console.log(`📄 Processing file: ${filename}`);
        
        await this.githubService.pushFile({
          owner: repoOwner,
          repo: repoName,
          path: filename,
          content: btoa(content),
          branch,
          message: `Add ${filename} from bolt.new`
        });
      }
    } catch (error) {
      throw new Error(`Failed to process ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Initialize background service
new BackgroundService();
