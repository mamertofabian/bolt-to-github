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
    // Listen for download events from bolt.new
    chrome.downloads.onCreated.addListener(async (downloadItem) => {
      console.log('⬇️ Download detected:', downloadItem.url);
      if (downloadItem.url.includes('bolt.new')) {
        console.log('🎯 Bolt.new ZIP file detected, intercepting download...');
        try {
          // Inject content script to get the blob data
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          console.log('👀 Active tab found:', tab);          
          if (!tab.id) throw new Error('No active tab found');

          console.log('📡 Injecting content script...');          
          // Inject the content script to handle the blob URL
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (blobUrl) => {
              try {
                const response = await fetch(blobUrl);
                const blob = await response.blob();
                const reader = new FileReader();

                console.log('📡 Injected content script, waiting for blob data...');
                
                return new Promise((resolve, reject) => {
                  reader.onload = () => {
                    const base64Data = reader.result?.toString().split(',')[1];
                    resolve(base64Data);
                  };
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(blob);
                });
              } catch (error) {
                console.error('Error in content script:', error);
                throw error;
              }
            },
            args: [downloadItem.url]
          });

          console.log('📡 Content script injected, waiting for blob data...');

          // Listen for the blob data
          chrome.runtime.onMessage.addListener(async (message) => {
            if (message.type === 'BLOB_DATA') {
              console.log('📨 Received blob data from content script');
              const blob = this.base64ToBlob(message.data);
              console.log('🔄 Converted base64 to blob, size:', blob.size, 'bytes');
              await this.handleDownload(downloadItem, blob);
            }
          });

        } catch (error) {
          console.error('❌ Error processing download:', error);
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
