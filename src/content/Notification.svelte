<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import type { NotificationAction } from './types/UITypes';

  export let type: 'info' | 'error' | 'success' = 'info';
  export let message: string = '';
  export let duration: number = 5000;
  export let onClose: () => void;
  export let actions: NotificationAction[] = [];

  let visible = true;
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    startAutoCloseTimer();
  });

  const startAutoCloseTimer = () => {
    if (duration > 0) {
      autoCloseTimer = setTimeout(() => {
        visible = false;
        onClose();
      }, duration);
    }
  };

  const pauseAutoClose = () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  };

  const resumeAutoClose = () => {
    if (!autoCloseTimer && duration > 0) {
      startAutoCloseTimer();
    }
  };

  const getTypeClass = () => `notification-${type}`;

  const handleClose = () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
    }
    visible = false;
    onClose();
  };

  const handleActionClick = async (action: NotificationAction) => {
    if (action.disabled) return;

    try {
      await action.action();
      // Auto-close notification after successful action unless it's a persistent notification
      if (duration > 0) {
        handleClose();
      }
    } catch (error) {
      console.error('Error executing notification action:', error);
    }
  };

  const getActionButtonClass = (variant: string = 'secondary') => {
    const baseClass = 'notification-action-button';
    switch (variant) {
      case 'primary':
        return `${baseClass} notification-action-primary`;
      case 'secondary':
        return `${baseClass} notification-action-secondary`;
      case 'ghost':
        return `${baseClass} notification-action-ghost`;
      default:
        return `${baseClass} notification-action-secondary`;
    }
  };
</script>

{#if visible}
  <div
    transition:fade
    class="notification {getTypeClass()}"
    role="alert"
    on:mouseenter={pauseAutoClose}
    on:mouseleave={resumeAutoClose}
  >
    <div class="notification-content">
      <div class="notification-message">
        {message}
      </div>

      {#if actions && actions.length > 0}
        <div class="notification-actions">
          {#each actions as action}
            <button
              on:click={() => handleActionClick(action)}
              class={getActionButtonClass(action.variant)}
              disabled={action.disabled}
              aria-label={action.text}
            >
              {action.text}
            </button>
          {/each}
        </div>
      {/if}

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
    max-width: 28rem;
    padding: 1rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.4;
  }

  .notification-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .notification-message {
    flex-grow: 1;
    color: white;
  }

  .notification-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .notification-action-button {
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    font-family: inherit;
  }

  .notification-action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .notification-action-primary {
    background-color: white;
    color: #1f2937;
  }

  .notification-action-primary:hover:not(:disabled) {
    background-color: #f3f4f6;
  }

  .notification-action-secondary {
    background-color: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .notification-action-secondary:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.3);
  }

  .notification-action-ghost {
    background-color: transparent;
    color: white;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .notification-action-ghost:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.1);
    text-decoration: none;
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
    flex-shrink: 0;
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
    background-color: #2563eb;
    border: 1px solid #2563eb;
  }
</style>
