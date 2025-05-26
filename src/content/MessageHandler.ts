import type { MessageType } from '$lib/types';

export class MessageHandler {
  private port: chrome.runtime.Port | null;
  private messageQueue: { type: MessageType; data?: any }[] = [];
  private isConnected = false;

  constructor(port: chrome.runtime.Port) {
    this.port = port;
    this.isConnected = true;
    this.setupPortListeners();
  }

  private setupPortListeners(): void {
    if (!this.port) return;

    this.port.onDisconnect.addListener(() => {
      this.isConnected = false;
      console.log('🔌 MessageHandler: Port disconnected');
    });
  }

  public updatePort(newPort: chrome.runtime.Port): void {
    this.port = newPort;
    this.isConnected = true;
    this.setupPortListeners();
    console.log('🔄 MessageHandler: Port updated, processing queued messages');

    // Process any queued messages
    this.processQueuedMessages();
  }

  private processQueuedMessages(): void {
    const queuedMessages = [...this.messageQueue];
    this.messageQueue = [];

    for (const message of queuedMessages) {
      this.sendMessage(message.type, message.data);
    }

    if (queuedMessages.length > 0) {
      console.log(`📤 MessageHandler: Processed ${queuedMessages.length} queued messages`);
    }
  }

  private isPortConnected(): boolean {
    if (!this.port) {
      console.debug('🔌 MessageHandler: No port available');
      return false;
    }

    try {
      // Check if chrome runtime is available
      if (!chrome.runtime?.id) {
        console.debug('🔌 MessageHandler: Chrome runtime not available');
        this.isConnected = false;
        return false;
      }

      // Additional check for port validity by trying to access port properties
      const portName = this.port.name;
      if (!portName) {
        console.debug('🔌 MessageHandler: Port appears to be invalid');
        this.isConnected = false;
        return false;
      }

      return this.isConnected;
    } catch (error) {
      console.debug('🔌 MessageHandler: Port connection check failed:', error);
      this.isConnected = false;
      return false;
    }
  }

  public sendMessage(type: MessageType, data?: any) {
    const message = { type, data };

    // If port is not connected, queue the message
    if (!this.isPortConnected()) {
      console.warn(`⏳ MessageHandler: Port disconnected, queuing message: ${type}`);
      this.messageQueue.push(message);
      return;
    }

    try {
      this.port!.postMessage(message);
      // console.log('📤 MessageHandler: Message sent:', { type, data });
    } catch (error) {
      console.error('❌ MessageHandler: Error sending message:', error);

      // If sending failed, mark as disconnected and queue the message
      this.isConnected = false;
      this.messageQueue.push(message);

      // Try to notify ContentManager about the connection issue
      this.notifyConnectionIssue();
    }
  }

  private notifyConnectionIssue(): void {
    // Dispatch a custom event to notify ContentManager about connection issues
    window.dispatchEvent(
      new CustomEvent('messageHandlerDisconnected', {
        detail: { reason: 'Port connection failed' },
      })
    );
  }

  public sendZipData(data: string) {
    this.sendMessage('ZIP_DATA', data);
  }

  public sendDebugMessage(message: string) {
    this.sendMessage('DEBUG', { message });
  }

  public sendCommitMessage(message: string) {
    this.sendMessage('SET_COMMIT_MESSAGE', { message });
  }

  public getConnectionStatus(): { connected: boolean; queuedMessages: number } {
    return {
      connected: this.isPortConnected(),
      queuedMessages: this.messageQueue.length,
    };
  }

  public clearQueue(): void {
    this.messageQueue = [];
    console.log('🗑️ MessageHandler: Message queue cleared');
  }
}
