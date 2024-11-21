import { ZipProcessor } from './lib/zip';
import { GitHubService } from './lib/github';

class BackgroundService {
  private githubService: GitHubService | null = null;
  
  constructor() {
    console.log('🚀 Background service initializing...');
    // Initialize with GitHub token from storage
    chrome.storage.sync.get(['githubToken'], (result) => {
      console.log('📦 Retrieved GitHub token from storage:', result.githubToken ? '✅ Token found' : '❌ No token');
      if (result.githubToken) {
        this.githubService = new GitHubService(result.githubToken);
      }
    });

    this.initializeListeners();
    console.log('👂 Listeners initialized');
  }

  private initializeListeners() {
    // Listen for download events from bolt.new
    chrome.downloads.onCreated.addListener(async (downloadItem) => {
      console.log('⬇️ Download detected:', downloadItem.url);
      if (downloadItem.url.includes('bolt.new') && downloadItem.filename.endsWith('.zip')) {
        console.log('🎯 Bolt.new ZIP file detected, intercepting download...');
        try {
          // Intercept the download
          const response = await fetch(downloadItem.url);
          const blob = await response.blob();
          console.log('📥 Successfully fetched ZIP content');
          
          // Process the ZIP file
          await this.processZipFile(blob);
          
          // Cancel the original download
          chrome.downloads.cancel(downloadItem.id);
          console.log('❌ Cancelled original download');
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error('❌ Error processing download:', errorMessage);
        }
      }
    });
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
        
        // Push to GitHub using the GitHub service
        await this.githubService.pushFile({
          owner: repoOwner,
          repo: repoName,
          path: filename,
          content: btoa(content),
          branch,
          message: `Add ${filename} from bolt.new`
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error processing ZIP:', errorMessage);
    }
  }
}

// Initialize background service
new BackgroundService();
