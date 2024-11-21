<script lang="ts">
  import { onMount } from 'svelte';

  type StatusType = 'uploading' | 'success' | 'error';
  
  let notificationVisible = false;
  let status: StatusType = 'uploading';
  let progress = 0;
  let statusMessage = '';

  onMount(() => {
    console.log('🏗️ Initializing upload status UI...');
    initializeMessageListener();
    announceReady();

    // Clean up listener on component destruction
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  });

  function handleMessage(message: any, sender: any, sendResponse: (response: { received: boolean }) => void) {
    console.log('📨 Received message:', message);
    if (message.type === 'UPLOAD_STATUS') {
      updateNotificationUI(
        message.status as StatusType,
        message.progress || 0,
        message.message || ''
      );
      sendResponse({ received: true });
    }
    return true;
  }

  function initializeMessageListener() {
    console.log('👂 Initializing message listener...');
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  async function announceReady() {
    try {
      await chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
      console.log('✅ Content script registered with background service');
    } catch (error) {
      console.error('❌ Failed to register content script:', error);
    }
  }

  function updateNotificationUI(newStatus: StatusType, newProgress: number, message: string) {
    console.log('🔄 Updating notification:', { newStatus, newProgress, message });
    
    status = newStatus;
    progress = newProgress;
    statusMessage = message;
    notificationVisible = true;

    // Hide notification after success or error
    if (newStatus === 'success' || newStatus === 'error') {
      setTimeout(() => {
        notificationVisible = false;
      }, 5000);
    }
  }

  function closeNotification() {
    notificationVisible = false;
  }
</script>

<div id="bolt-upload-status">
  <div
    class="bolt-notification fixed top-4 right-4 w-80 bg-gray-800/100 rounded-lg shadow-lg border border-gray-700 p-4 z-50 transition-all duration-300"
    class:hidden={!notificationVisible}
    style="margin-top: 40px; margin-right: 10px; z-index: 10;"
  >
    <div class="flex items-center justify-between mb-2">
      <span class="font-medium status-text" class:text-gray-100={status === 'uploading'} class:text-green-400={status === 'success'} class:text-red-400={status === 'error'}>
        {#if status === 'uploading'}
          Pushing to GitHub...
        {:else if status === 'success'}
          Push Complete!
        {:else if status === 'error'}
          Push Failed
        {/if}
      </span>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-300">{progress}%</span>
        <button
          class="close-button text-gray-400 hover:text-gray-200 transition-colors p-0.5 rounded hover:bg-white/10"
          on:click={closeNotification}
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
    
    <div class="w-full bg-gray-700 rounded-full h-2.5 mb-2">
      <div
        class="h-2.5 rounded-full transition-all duration-300"
        class:bg-blue-500={status === 'uploading'}
        class:bg-green-500={status === 'success'}
        class:bg-red-500={status === 'error'}
        style="width: {progress}%"
      ></div>
    </div>
    
    <p class="text-sm text-gray-300">{statusMessage}</p>
  </div>
</div>

<style>
  .bolt-notification {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    backdrop-filter: none;
    background-color: rgb(31, 41, 55);
  }
  
  .bolt-notification.hidden {
    transform: translateY(-150%);
    opacity: 0;
  }

  :global(#bolt-upload-status) {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 9999;
  }
</style>
