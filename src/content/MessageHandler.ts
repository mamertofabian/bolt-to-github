import type { MessageType } from '$lib/types';

export class MessageHandler {
  private port: chrome.runtime.Port;

  constructor(port: chrome.runtime.Port) {
    this.port = port;
  }

  public updatePort(newPort: chrome.runtime.Port): void {
    this.port = newPort;
  }

  public sendMessage(type: MessageType, data?: any) {
    // console.log('Sending message:', { type, data });
    try {
      this.port.postMessage({ type, data });
    } catch (error) {
      console.error('Error sending message:', error);
    }
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
}
