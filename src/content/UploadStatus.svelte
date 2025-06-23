<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createLogger } from '$lib/utils/logger';
  import type { UploadStatusState } from '../lib/types';
  import {
    getRotatingMessage,
    getContextualMessage,
    resetMessageRotation,
    type ReassuringMessageContext,
  } from '../lib/utils/reassuringMessages';

  const logger = createLogger('UploadStatus');

  // Props with default state
  export let status: UploadStatusState = {
    status: 'idle',
    message: '',
    progress: 0,
  };

  let notificationVisible = false;
  let mounted = false;
  let hideTimeout: number | null = null;
  let animationClass = '';
  let progressBarRef: HTMLElement;
  let reassuringMessage = '';
  let contextualMessage = '';
  let messageUpdateInterval: number | null = null;

  // Watch for status changes and update UI accordingly
  $: if (mounted) updateNotificationUI(status);

  // Update messages when progress changes
  $: if (
    status.progress !== undefined &&
    (status.status === 'uploading' || status.status === 'loading' || status.status === 'analyzing')
  ) {
    updateReassuringMessages(status);
  }

  // Respect user's motion preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    logger.info('🔄 UploadStatus component mounted');
    mounted = true;
    // Process any status that might have been set before mounting
    updateNotificationUI(status);
  });

  function updateNotificationUI(newStatus: UploadStatusState) {
    logger.info('🔄 Updating notification:', newStatus);

    // Clear any existing timeout to prevent race conditions
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    // Clear message update interval
    if (messageUpdateInterval) {
      clearInterval(messageUpdateInterval);
      messageUpdateInterval = null;
    }

    if (newStatus.status === 'idle') {
      animationClass = 'notification-exit';
      setTimeout(
        () => {
          notificationVisible = false;
          animationClass = '';
          reassuringMessage = '';
          contextualMessage = '';
        },
        prefersReducedMotion ? 0 : 300
      );
      return;
    }

    // Always make visible for non-idle states
    notificationVisible = true;
    animationClass = 'notification-enter';

    // Remove enter animation class after animation completes
    setTimeout(
      () => {
        animationClass = '';
      },
      prefersReducedMotion ? 0 : 400
    );

    // Setup reassuring messages for long-running operations
    if (
      newStatus.status === 'uploading' ||
      newStatus.status === 'loading' ||
      newStatus.status === 'analyzing'
    ) {
      updateReassuringMessages(newStatus);

      // Set up interval to check for stale progress
      messageUpdateInterval = window.setInterval(() => {
        updateReassuringMessages(status);
      }, 500); // Check every 500ms for more responsive updates
    } else {
      reassuringMessage = '';
      contextualMessage = '';
    }

    // Auto-hide for success/error/complete states
    if (
      newStatus.status === 'success' ||
      newStatus.status === 'error' ||
      newStatus.status === 'complete'
    ) {
      logger.info(`🔄 Setting auto-hide for ${newStatus.status} status`);
      hideTimeout = window.setTimeout(() => {
        logger.info('🔄 Auto-hiding notification');
        closeNotification('Auto-hide');
        hideTimeout = null;
      }, 5000);
    }
  }

  function updateReassuringMessages(currentStatus: UploadStatusState) {
    const context: ReassuringMessageContext = {
      operation:
        currentStatus.status === 'success' ||
        currentStatus.status === 'error' ||
        currentStatus.status === 'complete'
          ? 'uploading'
          : (currentStatus.status as
              | 'uploading'
              | 'loading'
              | 'analyzing'
              | 'importing'
              | 'cloning'),
      progress: currentStatus.progress,
      // You can add filename and filesCount if available in the status
    };

    reassuringMessage = getRotatingMessage(context);
    contextualMessage = getContextualMessage(context);
  }

  function closeNotification(source?: string) {
    logger.info('🔄 Closing notification', source);
    animationClass = 'notification-exit';

    // Clear message update interval
    if (messageUpdateInterval) {
      clearInterval(messageUpdateInterval);
      messageUpdateInterval = null;
    }

    // Reset state after animation completes
    setTimeout(
      () => {
        notificationVisible = false;
        animationClass = '';
        status = { status: 'idle' };
        reassuringMessage = '';
        contextualMessage = '';
        resetMessageRotation();
      },
      prefersReducedMotion ? 0 : 300
    );
  }

  // This causes premature closing of the notification
  // function handleKeydown(event: KeyboardEvent) {
  //   if (event.key === 'Escape') {
  //     closeNotification();
  //   }
  // }

  // Clean up timers on destroy
  onDestroy(() => {
    logger.info('🧹 Cleaning up upload status component');
    if (hideTimeout) {
      clearTimeout(hideTimeout);
    }
    if (messageUpdateInterval) {
      clearInterval(messageUpdateInterval);
    }
  });

  // Get status icon
  function getStatusIcon(status: string) {
    switch (status) {
      case 'uploading':
        return '⬆️';
      case 'loading':
        return '📁';
      case 'analyzing':
        return '🔍';
      case 'success':
      case 'complete':
        return '✅';
      case 'error':
        return '⚠️';
      default:
        return '';
    }
  }
</script>

<!-- <svelte:window on:keydown={handleKeydown} /> -->

<div id="bolt-upload-status">
  <div
    class="bolt-notification {animationClass}"
    class:notification-visible={notificationVisible && status.status !== 'idle'}
    class:status-uploading={status.status === 'uploading'}
    class:status-loading={status.status === 'loading'}
    class:status-analyzing={status.status === 'analyzing'}
    class:status-success={status.status === 'success'}
    class:status-complete={status.status === 'complete'}
    class:status-error={status.status === 'error'}
    role="alert"
    aria-live="polite"
    aria-atomic="true"
    tabindex="-1"
  >
    <div class="notification-content">
      <div class="notification-header">
        <div class="status-info">
          <span class="status-icon" aria-hidden="true">
            {getStatusIcon(status.status)}
          </span>
          <span class="status-text">
            {#if status.status === 'uploading'}
              Pushing to GitHub...
            {:else if status.status === 'loading'}
              Loading files...
            {:else if status.status === 'analyzing'}
              Analyzing changes...
            {:else if status.status === 'success'}
              Push Complete!
            {:else if status.status === 'complete'}
              Analysis Complete!
            {:else if status.status === 'error'}
              Operation Failed
            {/if}
          </span>
        </div>
        <div class="notification-controls">
          <span class="progress-percentage" aria-label="Progress: {status.progress || 0} percent">
            {status.progress || 0}%
          </span>
          {#if status.status === 'success' || status.status === 'error' || status.status === 'complete'}
            <button
              class="close-button"
              on:click={() => closeNotification('Close button')}
              aria-label="Close notification"
              type="button"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="close-icon"
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
          {/if}
        </div>
      </div>

      <div
        class="progress-container"
        role="progressbar"
        aria-valuenow={status.progress || 0}
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="progress-track">
          <div
            bind:this={progressBarRef}
            class="progress-bar"
            style="width: {status.progress || 0}%"
          >
            <div class="progress-shimmer"></div>
          </div>
        </div>
      </div>

      {#if reassuringMessage || contextualMessage}
        <div class="reassuring-messages">
          {#if reassuringMessage}
            <p class="reassuring-message primary">{reassuringMessage}</p>
          {/if}
          {#if contextualMessage}
            <p class="reassuring-message secondary">{contextualMessage}</p>
          {/if}
        </div>
      {/if}

      {#if status.message}
        <p class="status-message">{status.message}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  /* CSS Custom Properties for theming */
  :root {
    --upload-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --upload-success: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
    --upload-error: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
    --upload-background: rgba(17, 24, 39, 0.95);
    --upload-border: rgba(255, 255, 255, 0.1);
    --upload-text-primary: rgba(255, 255, 255, 0.95);
    --upload-text-secondary: rgba(255, 255, 255, 0.7);
    --upload-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  #bolt-upload-status {
    position: relative;
    width: 100%;
    height: 100%;
    pointer-events: none;
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

  .bolt-notification {
    position: relative;
    width: 22rem;
    max-width: calc(100vw - 2rem);
    background: var(--upload-background);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--upload-border);
    border-radius: 0.75rem;
    box-shadow: var(--upload-shadow);
    pointer-events: auto;
    transform: translateX(100%) scale(0.9);
    opacity: 0;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .bolt-notification.notification-visible {
    transform: translateX(0) scale(1);
    opacity: 1;
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

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }

  @keyframes success-celebration {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
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

  .notification-content {
    padding: 1.25rem;
  }

  .notification-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .status-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-icon {
    font-size: 1.125rem;
    line-height: 1;
  }

  .status-text {
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--upload-text-primary);
    letter-spacing: -0.01em;
  }

  .notification-controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .progress-percentage {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--upload-text-secondary);
    min-width: 2.5rem;
    text-align: right;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: var(--upload-text-secondary);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
  }

  .close-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: var(--upload-text-primary);
    transform: scale(1.05);
  }

  .close-button:focus {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }

  .close-icon {
    width: 1.125rem;
    height: 1.125rem;
  }

  .progress-container {
    margin-bottom: 0.75rem;
  }

  .progress-track {
    width: 100%;
    height: 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.375rem;
    overflow: hidden;
    position: relative;
  }

  .progress-bar {
    height: 100%;
    border-radius: 0.375rem;
    position: relative;
    overflow: hidden;
    transition: width 0.3s ease;
    background: var(--upload-primary);
    background-size: 200% 100%;
  }

  .status-uploading .progress-bar {
    background: var(--upload-primary);
    animation: shimmer 2s infinite;
  }

  .status-loading .progress-bar {
    background: var(--upload-primary);
    animation: shimmer 2s infinite;
  }

  .status-analyzing .progress-bar {
    background: var(--upload-primary);
    animation: shimmer 2s infinite;
  }

  .status-success .progress-bar {
    background: var(--upload-success);
  }

  .status-complete .progress-bar {
    background: var(--upload-success);
  }

  .status-error .progress-bar {
    background: var(--upload-error);
  }

  .progress-shimmer {
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
    animation: slide 1.5s infinite;
  }

  .status-uploading .progress-shimmer {
    animation: slide 1.5s infinite;
  }

  .status-loading .progress-shimmer {
    animation: slide 1.5s infinite;
  }

  .status-analyzing .progress-shimmer {
    animation: slide 1.5s infinite;
  }

  .status-message {
    font-size: 0.875rem;
    color: var(--upload-text-secondary);
    line-height: 1.4;
    margin: 0;
  }

  /* Reassuring messages styling */
  .reassuring-messages {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .reassuring-message {
    font-size: 0.8125rem;
    line-height: 1.3;
    margin: 0;
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
    animation: fadeInUp 0.4s ease-out;
  }

  .reassuring-message.primary {
    color: var(--upload-text-primary);
    font-weight: 500;
    opacity: 0.95;
  }

  .reassuring-message.secondary {
    color: var(--upload-text-secondary);
    font-weight: 400;
    opacity: 0.85;
    font-style: italic;
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

  /* Status-specific animations */
  .status-uploading {
    animation: pulse 2s infinite;
  }

  .status-loading {
    animation: pulse 2s infinite;
  }

  .status-analyzing {
    animation: pulse 2s infinite;
  }

  .status-success .notification-content {
    animation: success-celebration 0.6s ease-out;
  }

  .status-complete .notification-content {
    animation: success-celebration 0.6s ease-out;
  }

  .status-error .notification-content {
    animation: error-shake 0.5s ease-out;
  }

  /* Enhanced glassmorphism for different states */
  .status-uploading {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(102, 126, 234, 0.3);
  }

  .status-loading {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(102, 126, 234, 0.3);
  }

  .status-analyzing {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(102, 126, 234, 0.3);
  }

  .status-success {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(74, 222, 128, 0.3);
  }

  .status-complete {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(74, 222, 128, 0.3);
  }

  .status-error {
    background: rgba(17, 24, 39, 0.9);
    border-color: rgba(248, 113, 113, 0.3);
  }

  /* Accessibility: Respect reduced motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .bolt-notification,
    .progress-bar,
    .close-button,
    .notification-content {
      animation: none !important;
      transition: none !important;
    }

    .progress-shimmer {
      display: none;
    }
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .bolt-notification {
      width: calc(100vw - 2rem);
      right: 1rem;
      left: 1rem;
      margin-right: 0;
    }

    .notification-content {
      padding: 1rem;
    }

    .status-text {
      font-size: 0.875rem;
    }

    .close-button {
      width: 1.75rem;
      height: 1.75rem;
    }

    .close-icon {
      width: 1rem;
      height: 1rem;
    }

    .reassuring-message {
      font-size: 0.75rem;
      line-height: 1.2;
    }

    .reassuring-messages {
      gap: 0.125rem;
      margin-top: 0.375rem;
      margin-bottom: 0.375rem;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .bolt-notification {
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid white;
    }

    .status-text {
      color: white;
    }

    .progress-track {
      background: rgba(255, 255, 255, 0.3);
    }

    .close-button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.5);
    }
  }

  /* Focus management for keyboard navigation */
  .bolt-notification:focus-within {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }
</style>
