import { GitHubService } from '../services/GitHubService';
import type { Message, MessageType, Port, UploadStatusState } from '../lib/types';
import { StateManager } from './StateManager';
import { ZipHandler } from '../services/ZipHandler';

export class BackgroundService {
  private stateManager: StateManager;
  private zipHandler: ZipHandler | null;
  private ports: Map<number, Port>;
  private githubService: GitHubService | null;
  private pendingCommitMessage: string;

  constructor() {
    console.log('🚀 Background service initializing...');
    this.stateManager = StateManager.getInstance();
    this.ports = new Map();
    this.githubService = null;
    this.zipHandler = null;
    this.pendingCommitMessage = 'Commit from Bolt to GitHub';
    this.initialize();
  }

    // this.initializeListeners();
    // this.initializeStorageListener();

  private async initialize(): Promise<void> {
    const githubService = await this.initializeGitHubService();
    this.setupZipHandler(githubService!);
    this.setupConnectionHandlers();
    this.setupStorageListener();
    console.log('👂 Background service initialized');
  }

  private async initializeGitHubService(): Promise<GitHubService | null> {
    try {
      const settings = await this.stateManager.getGitHubSettings();
      
      if (settings && settings.gitHubSettings) {
        console.log('✅ Valid settings found, initializing GitHub service', settings);
        this.githubService = new GitHubService(settings.gitHubSettings.githubToken);
      } else {
        console.log('❌ Invalid or incomplete settings');
        this.githubService = null;
      }
    } catch (error) {
      console.error('Failed to initialize GitHub service:', error);
      this.githubService = null;
    }
    return this.githubService;
  }

  private setupZipHandler(githubService: GitHubService) {
    this.zipHandler = new ZipHandler(
      githubService, (status) => this.broadcastStatus(status)
    );
  }

  private broadcastStatus(status: UploadStatusState) {
    for (const [tabId, port] of this.ports) {
      this.sendResponse(port, {
        type: 'UPLOAD_STATUS',
        status
      });
    }
  }

  private setupConnectionHandlers(): void {
    chrome.runtime.onConnect.addListener((port: Port) => {
      const tabId = port.sender?.tab?.id;
      
      if (!tabId || port.name !== 'bolt-content') {
        return;
      }

      console.log('📝 New connection from tab:', tabId);
      this.ports.set(tabId, port);

      port.onDisconnect.addListener(() => {
        console.log('🔌 Port disconnected:', tabId);
        this.ports.delete(tabId);
      });

      port.onMessage.addListener(async (message: Message) => {
        await this.handlePortMessage(tabId, message);
      });
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.ports.delete(tabId);
    });

    // Handle URL updates for project ID
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (tab.url?.includes('bolt.new/~/')) {
        const projectId = tab.url.match(/bolt\.new\/~\/([^\/]+)/)?.[1] || null;
        if (projectId) {
          await this.stateManager.setProjectId(projectId);
        }
      }
    });
  }

  private setupStorageListener(): void {
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

  private async handlePortMessage(tabId: number, message: Message): Promise<void> {
    const port = this.ports.get(tabId);
    if (!port) return;

    try {
      switch (message.type) {
        case 'ZIP_DATA':
          await this.handleZipData(tabId, message.data);
          break;

        case 'SET_COMMIT_MESSAGE':
          console.log('Setting commit message:', message.message);
          if (message.message) {
            this.pendingCommitMessage = message.message;
            this.sendResponse(port, { type: 'UPLOAD_STATUS', status: { status: 'idle', message: 'Commit message updated' }});
          }
          break;

        case 'DEBUG':
          console.log(`[Content Debug] ${message.message}`);
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error(`Error handling message ${message.type}:`, error);
      this.sendResponse(port, { 
        type: 'UPLOAD_STATUS', 
        status: { 
          status: 'error', 
          message: error instanceof Error ? error.message : 'Unknown error occurred' 
        }
      });
    }
  }

  private async handleZipData(tabId: number, base64Data: string): Promise<void> {
    console.log('🔄 Handling ZIP data for tab:', tabId);
    const port = this.ports.get(tabId);
    if (!port) return;

    try {
      if (!this.githubService) {
        throw new Error('GitHub service is not initialized. Please check your GitHub settings.');
      }

      if (!this.zipHandler) {
        throw new Error('Zip handler is not initialized.');
      }

      const projectId = await this.stateManager.getProjectId();
      if (!projectId) {
        throw new Error('Project ID is not set.');
      }

      try {
        // Convert base64 to blob
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/zip' });

        // Process the ZIP file
        await this.zipHandler.processZipFile(
          blob, 
          projectId, 
          this.pendingCommitMessage
        );

        // Reset commit message after successful upload
        this.pendingCommitMessage = 'Commit from Bolt to GitHub';
        
        this.sendResponse(port, { 
          type: 'UPLOAD_STATUS', 
          status: { status: 'success', message: 'Upload completed successfully', progress: 100 }
        });
      } catch (decodeError) {
        throw new Error(`Failed to decode ZIP data: ${decodeError}`);
      }
    } catch (error) {
      console.error('Error processing ZIP:', error);
      this.sendResponse(port, { 
        type: 'UPLOAD_STATUS', 
        status: { 
          status: 'error', 
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      });
    }
  }

  private sendResponse(port: Port, message: { type: MessageType; status?: UploadStatusState }): void {
    try {
      port.postMessage(message);
    } catch (error) {
      console.error('Error sending response:', error);
    }
  }
}
