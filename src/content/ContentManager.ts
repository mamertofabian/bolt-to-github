import { MessageHandler } from "./MessageHandler";
import { UIManager } from "./UIManager";

export class ContentManager {
    private uiManager: UIManager;
    private messageHandler: MessageHandler | undefined;
    private port: chrome.runtime.Port;
  
    constructor() {
        this.port = this.initializeConnection();
        this.messageHandler = new MessageHandler(this.port);
        this.uiManager = UIManager.getInstance(this.messageHandler);
        this.setupEventListeners();
    }
  
    private initializeConnection(): chrome.runtime.Port {
        const port = chrome.runtime.connect({ name: 'bolt-content' });
        console.log('🔊 Connected to background service with port:', port);
        this.messageHandler = new MessageHandler(port);
        
        port.onMessage.addListener((message) => {
          this.handleBackgroundMessage(message);
        });
    
        port.onDisconnect.addListener(() => {
          console.log('Port disconnected, attempting reconnection...');
          setTimeout(() => this.reconnect(), 1000);
        });

        return port;
      }

      private reconnect(): void {
        this.port = this.initializeConnection();
        this.messageHandler?.updatePort(this.port);
        this.setupEventListeners();
      }
    
      private setupEventListeners() {
        // Cleanup on navigation
        window.addEventListener('unload', () => {
          this.uiManager.cleanup();
        });
    
        // Handle extension updates
        chrome.runtime.onConnect.addListener(() => {
          this.reinitialize();
        });
      }
    
      private handleBackgroundMessage(message: any) {
        console.log('🔊 Received message from background:', message);
        switch (message.type) {
          case 'UPLOAD_STATUS_UPDATE':
            console.log('🔊 Received upload status update:', message.status);
            this.uiManager.updateUploadStatus(message.status);
            break;
          case 'GITHUB_SETTINGS_CHANGED':
            console.log('🔊 Received GitHub settings changed:', message.isValid);
            this.uiManager.updateButtonState(message.isValid);
            break;
          // Add other message handlers as needed
        }
      }
    
      public reinitialize() {
        console.log('🔊 Reinitializing content script');
        this.uiManager.reinitialize();
        this.messageHandler?.sendMessage('CONTENT_SCRIPT_READY');
      }
  }
  