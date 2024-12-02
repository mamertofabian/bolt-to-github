<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { UploadStatusState } from '../lib/types';

  // Props with default state
  export let status: UploadStatusState = {
    status: 'idle',
    message: '',
    progress: 0
  };
  
  let notificationVisible = false;
  
  // Watch for status changes and update UI accordingly
  $: updateNotificationUI(status);

  function updateNotificationUI(newStatus: UploadStatusState) {
    if (newStatus.status === 'success') {
      console.log('🔄 Success status received, setting notification to auto-hide'); 
    }

    // console.log('🔄 Updating notification:', newStatus);
    
    if (newStatus.status === 'idle') {
      notificationVisible = false;
      return;
    }

    // Update visibility
    notificationVisible = true;

    // Auto-hide for success/error states
    if (newStatus.status === 'success' || newStatus.status === 'error') {
      setTimeout(() => {
        notificationVisible = false;
      }, 5000);
    }
  }

  function closeNotification() {
    console.log('🔄 Closing notification');
    notificationVisible = false;
    // Reset state after animation completes
    setTimeout(() => {
      status = { status: 'idle' };
    }, 300); // Match the CSS transition duration
  }

  // Clean up timers on destroy
  onDestroy(() => {
    console.log('🧹 Cleaning up upload status component');
  });
</script>

<div id="bolt-upload-status">
  {#if status.status !== 'idle'}
    <div
      class="bolt-notification fixed top-4 right-4 w-80 bg-gray-800/100 rounded-lg shadow-lg border border-gray-700 p-4 transition-all duration-300"
      class:hidden={!notificationVisible}
      style="margin-top: 40px; margin-right: 10px;"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium status-text" 
          class:text-gray-100={status.status === 'uploading'} 
          class:text-green-400={status.status === 'success'} 
          class:text-red-400={status.status === 'error'}
        >
          {#if status.status === 'uploading'}
            Pushing to GitHub...
          {:else if status.status === 'success'}
            Push Complete!
          {:else if status.status === 'error'}
            Push Failed
          {/if}
        </span>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-300">{status.progress || 0}%</span>
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
          class:bg-blue-500={status.status === 'uploading'}
          class:bg-green-500={status.status === 'success'}
          class:bg-red-500={status.status === 'error'}
          style="width: {status.progress || 0}%"
        ></div>
      </div>
      
      <p class="text-sm text-gray-300">{status.message || ''}</p>
    </div>
  {/if}
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
