<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import type { NotificationAction } from './types/UITypes';
  import {
    getRotatingMessage,
    getContextualMessage,
    resetMessageRotation,
    type ReassuringMessageContext,
  } from '../lib/utils/reassuringMessages';

  export let type: 'info' | 'error' | 'success' = 'info';
  export let message: string = '';
  export let duration: number = 5000;
  export let onClose: () => void;
  export let actions: NotificationAction[] = [];
  export let progress: number | null = null;
  export let operation: 'analyzing' | 'uploading' | 'loading' | 'importing' | 'cloning' | null =
    null;
  export let filename: string | null = null;
  export let filesCount: number | null = null;

  let visible = true;
  let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let mounted = false;
  let animationClass = '';
  let showStartTime = 0;
  let reassuringMessage = '';
  let contextualMessage = '';
  let messageUpdateInterval: number | null = null;

  // Respect user's motion preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Minimum duration to ensure readability (1.5 seconds)
  const MINIMUM_DURATION = 1500;

  // Check if this is a reminder notification (should be persistent)
  const isReminderNotification =
    message.includes('unsaved changes') || message.includes('Consider pushing to GitHub');

  // Update messages when progress changes
  $: if (progress !== null && operation && mounted) {
    updateReassuringMessages();
  }

  onMount(() => {
    mounted = true;
    showStartTime = Date.now();
    animationClass = 'notification-enter';

    // Only start auto-close timer if it's not a reminder notification
    if (!isReminderNotification) {
      startAutoCloseTimer();
    }

    // Setup reassuring messages for long-running operations
    if (operation && progress !== null) {
      updateReassuringMessages();

      // Set up interval to check for stale progress
      messageUpdateInterval = window.setInterval(() => {
        updateReassuringMessages();
      }, 500); // Check every 500ms for more responsive updates
    }

    // Remove enter animation class after animation completes
    setTimeout(
      () => {
        animationClass = '';
      },
      prefersReducedMotion ? 0 : 400
    );
  });

  onDestroy(() => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
    }
    if (messageUpdateInterval) {
      clearInterval(messageUpdateInterval);
    }
  });

  const startAutoCloseTimer = () => {
    if (duration > 0 && !isReminderNotification) {
      // Use the longer of the specified duration or minimum duration
      const effectiveDuration = Math.max(duration, MINIMUM_DURATION);

      autoCloseTimer = setTimeout(() => {
        handleClose();
      }, effectiveDuration);
    }
  };

  const pauseAutoClose = () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      autoCloseTimer = null;
    }
  };

  const resumeAutoClose = () => {
    if (!autoCloseTimer && duration > 0 && !isReminderNotification) {
      // Calculate remaining time, ensuring minimum duration is respected
      const elapsedTime = Date.now() - showStartTime;
      const effectiveDuration = Math.max(duration, MINIMUM_DURATION);
      const remainingTime = Math.max(effectiveDuration - elapsedTime, 500); // At least 500ms remaining

      autoCloseTimer = setTimeout(() => {
        handleClose();
      }, remainingTime);
    }
  };

  const handleClose = () => {
    // For reminder notifications, close immediately when user clicks X
    if (isReminderNotification) {
      performClose();
      return;
    }

    // Ensure minimum duration has passed before allowing close
    const elapsedTime = Date.now() - showStartTime;
    const minimumTimeRemaining = MINIMUM_DURATION - elapsedTime;

    if (minimumTimeRemaining > 0) {
      // If minimum time hasn't passed, delay the close
      setTimeout(() => {
        performClose();
      }, minimumTimeRemaining);
    } else {
      performClose();
    }
  };

  const performClose = () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
    }
    if (messageUpdateInterval) {
      clearInterval(messageUpdateInterval);
      messageUpdateInterval = null;
    }
    animationClass = 'notification-exit';

    // Call onClose after animation completes
    setTimeout(
      () => {
        visible = false;
        onClose();
        reassuringMessage = '';
        contextualMessage = '';
        resetMessageRotation();
      },
      prefersReducedMotion ? 0 : 300
    );
  };

  function updateReassuringMessages() {
    if (!operation) return;

    const context: ReassuringMessageContext = {
      operation,
      progress: progress ?? undefined,
      filename: filename ?? undefined,
      filesCount: filesCount ?? undefined,
    };

    reassuringMessage = getRotatingMessage(context);
    contextualMessage = getContextualMessage(context);
  }

  const handleActionClick = async (action: NotificationAction) => {
    if (action.disabled) return;

    try {
      await action.action();
      // Auto-close notification after successful action unless it's a persistent notification
      if (duration > 0 || isReminderNotification) {
        handleClose();
      }
    } catch (error) {
      console.error('Error executing notification action:', error);
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
    }
  };

  // Get status icon based on type
  function getTypeIcon(notificationType: string) {
    switch (notificationType) {
      case 'success':
        return '✅';
      case 'error':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible}
  <div
    class="enhanced-notification {animationClass}"
    class:notification-visible={mounted}
    class:notification-info={type === 'info'}
    class:notification-success={type === 'success'}
    class:notification-error={type === 'error'}
    class:notification-reminder={isReminderNotification}
    role="alert"
    aria-live="polite"
    aria-atomic="true"
    tabindex="-1"
    on:mouseenter={pauseAutoClose}
    on:mouseleave={resumeAutoClose}
    transition:fly={{ x: 100, duration: prefersReducedMotion ? 0 : 400 }}
  >
    <div class="enhanced-notification-content">
      <!-- Top row: Icon, message, and close button -->
      <div class="enhanced-notification-top">
        <div class="enhanced-status-info">
          <span class="enhanced-status-icon" aria-hidden="true">
            {getTypeIcon(type)}
          </span>
          <div class="enhanced-message-content">
            <span class="enhanced-notification-message">
              {message}
            </span>
          </div>
        </div>

        <button
          on:click={handleClose}
          class="enhanced-close-button"
          aria-label="Close notification"
          type="button"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="enhanced-close-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <!-- Progress bar for long-running operations -->
      {#if progress !== null && operation}
        <div class="enhanced-progress-container">
          <div class="enhanced-progress-track">
            <div class="enhanced-progress-bar" style="width: {progress}%">
              <div class="enhanced-progress-shimmer"></div>
            </div>
          </div>
          <span class="enhanced-progress-percentage">{progress}%</span>
        </div>
      {/if}

      <!-- Reassuring messages -->
      {#if reassuringMessage || contextualMessage}
        <div class="enhanced-reassuring-messages">
          {#if reassuringMessage}
            <p class="enhanced-reassuring-message primary">{reassuringMessage}</p>
          {/if}
          {#if contextualMessage}
            <p class="enhanced-reassuring-message secondary">{contextualMessage}</p>
          {/if}
        </div>
      {/if}

      <!-- Bottom row: Action buttons (if any) -->
      {#if actions && actions.length > 0}
        <div class="enhanced-notification-actions">
          {#each actions as action}
            <button
              on:click={() => handleActionClick(action)}
              class="enhanced-action-button enhanced-action-{action.variant || 'secondary'}"
              disabled={action.disabled}
              aria-label={action.text}
            >
              {action.text}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* CSS Custom Properties for theming - matching UploadStatus */
  :root {
    --notification-info: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    --notification-success: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
    --notification-error: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
    --notification-background: rgba(17, 24, 39, 0.95);
    --notification-border: rgba(255, 255, 255, 0.1);
    --notification-text-primary: rgba(255, 255, 255, 0.95);
    --notification-text-secondary: rgba(255, 255, 255, 0.7);
    --notification-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .enhanced-notification {
    position: relative;
    width: 26rem;
    max-width: calc(100vw - 2rem);
    min-width: 20rem;
    background: var(--notification-background);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--notification-border);
    border-radius: 0.75rem;
    box-shadow: var(--notification-shadow);
    pointer-events: auto;
    transform: translateX(100%) scale(0.9);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    font-family:
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      Roboto,
      'Helvetica Neue',
      Arial,
      'Noto Sans',
      sans-serif;
  }

  .enhanced-notification.notification-visible {
    transform: translateX(0) scale(1);
    opacity: 1;
  }

  /* Special styling for reminder notifications */
  .enhanced-notification.notification-reminder {
    width: 28rem;
    border-color: rgba(251, 191, 36, 0.4);
    background: rgba(17, 24, 39, 0.97);
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.6),
      0 0 0 1px rgba(251, 191, 36, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 0 20px rgba(251, 191, 36, 0.1);
  }

  .notification-enter {
    animation: slideInScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .notification-exit {
    animation: slideOutScale 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes slideInScale {
    0% {
      transform: translateX(100%) scale(0.9);
      opacity: 0;
    }
    100% {
      transform: translateX(0) scale(1);
      opacity: 1;
    }
  }

  @keyframes slideOutScale {
    0% {
      transform: translateX(0) scale(1);
      opacity: 1;
    }
    100% {
      transform: translateX(100%) scale(0.95);
      opacity: 0;
    }
  }

  .enhanced-notification-content {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .enhanced-notification-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    min-height: 2.5rem;
  }

  .enhanced-status-info {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .enhanced-status-icon {
    font-size: 1.125rem;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .enhanced-message-content {
    flex: 1;
    min-width: 0;
  }

  .enhanced-notification-message {
    font-weight: 500;
    font-size: 0.875rem;
    color: var(--notification-text-primary);
    line-height: 1.5;
    word-wrap: break-word;
    word-break: break-word;
    display: block;
    white-space: pre-wrap;
  }

  .enhanced-notification-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-top: 0.25rem;
  }

  .enhanced-action-button {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    font-family: inherit;
    backdrop-filter: blur(8px);
    min-width: auto;
    text-align: center;
  }

  .enhanced-action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .enhanced-action-primary {
    background: rgba(255, 255, 255, 0.9);
    color: #1f2937;
  }

  .enhanced-action-primary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 1);
    transform: scale(1.02);
  }

  .enhanced-action-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: var(--notification-text-primary);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .enhanced-action-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.02);
  }

  .enhanced-action-ghost {
    background: transparent;
    color: var(--notification-text-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .enhanced-action-ghost:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    text-decoration: none;
    transform: scale(1.02);
  }

  .enhanced-close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: var(--notification-text-secondary);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
    flex-shrink: 0;
  }

  .enhanced-close-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: var(--notification-text-primary);
    transform: scale(1.05);
  }

  .enhanced-close-button:focus {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }

  .enhanced-close-icon {
    width: 1rem;
    height: 1rem;
  }

  /* Type-specific styling with enhanced glassmorphism */
  .notification-info {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(59, 130, 246, 0.3);
  }

  .notification-success {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(74, 222, 128, 0.3);
  }

  .notification-error {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(248, 113, 113, 0.3);
  }

  /* Progress bar styling */
  .enhanced-progress-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.75rem 0;
  }

  .enhanced-progress-track {
    flex: 1;
    height: 0.375rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.375rem;
    overflow: hidden;
    position: relative;
  }

  .enhanced-progress-bar {
    height: 100%;
    border-radius: 0.375rem;
    position: relative;
    overflow: hidden;
    transition: width 0.3s ease;
    background: var(--notification-info);
    background-size: 200% 100%;
    animation: shimmer 2s infinite;
  }

  .notification-success .enhanced-progress-bar {
    background: var(--notification-success);
  }

  .notification-error .enhanced-progress-bar {
    background: var(--notification-error);
  }

  .enhanced-progress-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    animation: slide 1.5s infinite;
  }

  .enhanced-progress-percentage {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--notification-text-secondary);
    min-width: 2.5rem;
    text-align: right;
  }

  /* Reassuring messages styling */
  .enhanced-reassuring-messages {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 0.5rem 0;
  }

  .enhanced-reassuring-message {
    font-size: 0.8125rem;
    line-height: 1.3;
    margin: 0;
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
    animation: fadeInUp 0.4s ease-out;
  }

  .enhanced-reassuring-message.primary {
    color: var(--notification-text-primary);
    font-weight: 500;
    opacity: 0.95;
  }

  .enhanced-reassuring-message.secondary {
    color: var(--notification-text-secondary);
    font-weight: 400;
    opacity: 0.85;
    font-style: italic;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @keyframes slide {
    0% {
      left: -100%;
    }
    100% {
      left: 100%;
    }
  }

  @keyframes fadeInUp {
    0% {
      opacity: 0;
      transform: translateY(4px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Type-specific animations */
  .notification-success .enhanced-notification-content {
    animation: success-celebration 0.6s ease-out;
  }

  .notification-error .enhanced-notification-content {
    animation: error-shake 0.5s ease-out;
  }

  @keyframes success-celebration {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.02);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes error-shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-2px);
    }
    75% {
      transform: translateX(2px);
    }
  }

  /* Accessibility: Respect reduced motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .enhanced-notification,
    .enhanced-action-button,
    .enhanced-close-button,
    .enhanced-notification-content {
      animation: none !important;
      transition: none !important;
    }
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .enhanced-notification {
      width: calc(100vw - 2rem);
      min-width: unset;
      margin: 0;
    }

    .enhanced-notification.notification-reminder {
      width: calc(100vw - 2rem);
    }

    .enhanced-notification-content {
      padding: 1rem;
      gap: 0.75rem;
    }

    .enhanced-notification-top {
      gap: 0.75rem;
    }

    .enhanced-notification-message {
      font-size: 0.8125rem;
      line-height: 1.4;
    }

    .enhanced-close-button {
      width: 1.5rem;
      height: 1.5rem;
    }

    .enhanced-close-icon {
      width: 0.875rem;
      height: 0.875rem;
    }

    .enhanced-action-button {
      padding: 0.375rem 0.75rem;
      font-size: 0.6875rem;
    }

    .enhanced-notification-actions {
      gap: 0.5rem;
      justify-content: center;
      margin-top: 0.5rem;
    }

    .enhanced-progress-container {
      gap: 0.5rem;
      margin: 0.5rem 0;
    }

    .enhanced-progress-track {
      height: 0.3125rem;
    }

    .enhanced-progress-percentage {
      font-size: 0.6875rem;
      min-width: 2rem;
    }

    .enhanced-reassuring-message {
      font-size: 0.75rem;
      line-height: 1.2;
    }

    .enhanced-reassuring-messages {
      gap: 0.125rem;
      margin: 0.375rem 0;
    }
  }

  /* Tablet and medium screens */
  @media (max-width: 1024px) and (min-width: 641px) {
    .enhanced-notification {
      width: 24rem;
    }

    .enhanced-notification.notification-reminder {
      width: 26rem;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .enhanced-notification {
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid white;
    }

    .enhanced-notification-message {
      color: white;
    }

    .enhanced-close-button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.5);
    }

    .enhanced-action-button {
      border: 1px solid rgba(255, 255, 255, 0.5);
    }
  }

  /* Focus management for keyboard navigation */
  .enhanced-notification:focus-within {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }
</style>
