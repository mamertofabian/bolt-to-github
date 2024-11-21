import './polyfills';
import JSZip from 'jszip';
import { Octokit } from '@octokit/rest';

class BackgroundService {
  private octokit: Octokit = new Octokit();
  
  constructor() {
    console.log('🚀 Background service initializing...');
    // Initialize with GitHub token from storage
    chrome.storage.sync.get(['githubToken'], (result) => {
      console.log('📦 Retrieved GitHub token from storage:', result.githubToken ? '✅ Token found' : '❌ No token');
      this.octokit = new Octokit({ auth: result.githubToken });
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
        } catch (error) {
          console.error('❌ Error processing download:', error);
        }
      }
    });
  }

  private async processZipFile(blob: Blob) {
    try {
      console.log('🗜️ Processing ZIP file...');
      const zip = new JSZip();
      const contents = await zip.loadAsync(blob);
      console.log('📂 ZIP contents loaded successfully');
      
      // Get repository details from storage
      const { repoOwner, repoName, branch } = await chrome.storage.sync.get([
        'repoOwner',
        'repoName',
        'branch'
      ]);
      console.log('📋 Repository details:', { repoOwner, repoName, branch });

      // Process each file in the ZIP
      for (const [filename, file] of Object.entries(contents.files)) {
        if (!file.dir) {
          console.log(`📄 Processing file: ${filename}`);
          const content = await file.async('text');
          
          // Push to GitHub
          await this.pushToGitHub({
            owner: repoOwner,
            repo: repoName,
            path: filename,
            content: Buffer.from(content).toString('base64'),
            branch,
            message: `Add ${filename} from bolt.new`
          });
        }
      }
    } catch (error) {
      console.error('Error processing ZIP:', error);
    }
  }

  private async pushToGitHub({
    owner,
    repo,
    path,
    content,
    branch,
    message
  }: {
    owner: string;
    repo: string;
    path: string;
    content: string;
    branch: string;
    message: string;
  }) {
    try {
      // Check if file exists
      let sha: string | undefined;
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path,
          ref: branch
        });
        if (!Array.isArray(data)) {
          sha = data.sha;
        }
      } catch (error) {
        // File doesn't exist, which is fine
      }

      // Create or update file
      await this.octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message,
        content,
        branch,
        sha
      });
    } catch (error) {
      console.error('Error pushing to GitHub:', error);
    }
  }
}

// Initialize background service
new BackgroundService();
