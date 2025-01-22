<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';

  export let type: 'info' | 'error' | 'success' = 'info';
  export let message: string = '';
  export let duration: number = 5000;
  export let onClose: () => void;

  let visible = true;

  onMount(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        visible = false;
        onClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  });

  const getTypeClass = () => `notification-${type}`;

  const handleClose = () => {
    visible = false;
    onClose();
  };
</script>

{#if visible}
  <div transition:fade class="notification {getTypeClass()}" role="alert">
    <div class="notification-content">
      <div class="notification-message">
        {message}
      </div>
      <button on:click={handleClose} class="notification-close" aria-label="Close notification">
        ✕
      </button>
    </div>
  </div>
{/if}

<style>
  .notification {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
    max-width: 24rem;
    padding: 1rem;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }

  .notification-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .notification-message {
    flex-grow: 1;
    margin-right: 1rem;
    color: white;
  }

  .notification-close {
    background: none;
    border: none;
    color: white;
    opacity: 0.75;
    cursor: pointer;
    padding: 4px 8px;
    font-size: 16px;
    transition: opacity 0.2s ease;
  }

  .notification-close:hover {
    opacity: 1;
  }

  /* Type-specific styles */
  .notification-error {
    background-color: #dc3545;
    border: 1px solid #dc3545;
  }

  .notification-success {
    background-color: #28a745;
    border: 1px solid #28a745;
  }

  .notification-info {
    background-color: #0d6efd;
    border: 1px solid #0d6efd;
  }
</style>
