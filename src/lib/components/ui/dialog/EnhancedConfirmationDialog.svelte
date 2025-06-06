<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Github, Upload, X, FileText, Bookmark } from 'lucide-svelte';
  import { onMount, createEventDispatcher } from 'svelte';
  import { fly, scale, fade } from 'svelte/transition';
  import { quintOut, backOut } from 'svelte/easing';

  export let show = false;
  export let title: string;
  export let message: string;
  export let confirmText = 'Push to GitHub';
  export let cancelText = 'Cancel';
  export let commitMessage = '';
  export let placeholder = 'Commit from Bolt to GitHub';
  export let showFilePreview = false;
  export let fileChangesSummary: { added: number; modified: number; deleted: number } | null = null;
  export let commitMessageTemplates: string[] = [];
  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    confirm: { commitMessage: string };
    cancel: void;
  }>();

  let dialogElement: HTMLDivElement;
  let showTemplates = false;
  let mounted = false;

  // Respect user's motion preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Auto-focus input when dialog opens
  $: if (show && mounted) {
    setTimeout(() => {
      const input = document.getElementById('commit-message-input');
      input?.focus();
    }, 100);
  }

  function handleConfirm() {
    if (isLoading) return;
    dispatch('confirm', { commitMessage: commitMessage || placeholder });
    show = false;
  }

  function handleCancel() {
    if (isLoading) return;
    dispatch('cancel');
    show = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !isLoading) {
      handleCancel();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleConfirm();
    }
  }

  function handleOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget && !isLoading) {
      handleCancel();
    }
  }

  function selectTemplate(template: string) {
    commitMessage = template;
    showTemplates = false;
    const input = document.getElementById('commit-message-input');
    input?.focus();
  }

  // Trap focus within dialog
  function trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const focusableElements = dialogElement?.querySelectorAll(
      'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
    );

    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  onMount(() => {
    mounted = true;
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      if (show) {
        trapFocus(event);
      }
    };

    document.addEventListener('keydown', handleGlobalKeydown);
    return () => document.removeEventListener('keydown', handleGlobalKeydown);
  });
</script>

{#if show}
  <!-- Enhanced Overlay with backdrop blur -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div
    class="enhanced-dialog-overlay"
    on:click={handleOverlayClick}
    on:keydown={handleKeydown}
    tabindex="-1"
    transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
  >
    <!-- Enhanced Dialog Container with glassmorphism -->
    <div
      bind:this={dialogElement}
      class="enhanced-dialog-container"
      class:dialog-loading={isLoading}
      transition:fly={{ y: 20, duration: prefersReducedMotion ? 0 : 400, easing: backOut }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
    >
      <!-- Header with enhanced styling -->
      <div class="enhanced-dialog-header">
        <!-- Close button -->
        <button
          class="enhanced-close-button"
          on:click={handleCancel}
          disabled={isLoading}
          aria-label="Close dialog"
        >
          <X class="h-4 w-4" />
        </button>

        <!-- Title with icon -->
        <div class="enhanced-title-section">
          <div class="enhanced-icon-container">
            <Github class="h-5 w-5 text-blue-400" />
          </div>
          <h2 id="dialog-title" class="enhanced-title">
            {title}
          </h2>
        </div>
      </div>

      <!-- Content -->
      <div class="enhanced-dialog-content">
        <p id="dialog-description" class="enhanced-message">
          {message}
        </p>

        <!-- File changes summary (if provided) -->
        {#if showFilePreview && fileChangesSummary}
          <div class="enhanced-file-summary">
            <div class="enhanced-file-summary-header">
              <FileText class="h-3 w-3" />
              <span>Changes Summary</span>
            </div>
            <div class="enhanced-file-summary-stats">
              {#if fileChangesSummary.added > 0}
                <span class="stat-added">+{fileChangesSummary.added} added</span>
              {/if}
              {#if fileChangesSummary.modified > 0}
                <span class="stat-modified">~{fileChangesSummary.modified} modified</span>
              {/if}
              {#if fileChangesSummary.deleted > 0}
                <span class="stat-deleted">-{fileChangesSummary.deleted} deleted</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- Enhanced Input Section -->
      <div class="enhanced-input-section">
        <div class="enhanced-input-container">
          <div class="enhanced-input-header">
            <label for="commit-message-input" class="enhanced-input-label"> Commit message </label>
            {#if commitMessageTemplates.length > 0}
              <button
                class="enhanced-template-toggle"
                on:click={() => (showTemplates = !showTemplates)}
                type="button"
              >
                <Bookmark class="h-3 w-3" />
                <span>{showTemplates ? 'Hide' : 'Show'} templates</span>
              </button>
            {/if}
          </div>

          <!-- Templates dropdown -->
          {#if showTemplates && commitMessageTemplates.length > 0}
            <div
              class="enhanced-templates"
              transition:fly={{ y: -10, duration: prefersReducedMotion ? 0 : 200 }}
            >
              <div class="enhanced-templates-header">
                <span class="text-xs font-medium text-slate-400">Quick Templates</span>
                <span class="text-xs text-slate-500">{commitMessageTemplates.length} available</span
                >
              </div>
              <div class="enhanced-templates-grid">
                {#each commitMessageTemplates as template, index}
                  <button
                    class="enhanced-template-item"
                    on:click={() => selectTemplate(template)}
                    type="button"
                    style="animation-delay: {index * 50}ms"
                  >
                    <span class="template-text">{template}</span>
                    <div class="template-hover-bg"></div>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Enhanced input field -->
          <div class="enhanced-input-wrapper">
            <Input
              bind:value={commitMessage}
              {placeholder}
              id="commit-message-input"
              class="enhanced-input"
              disabled={isLoading}
              on:keydown={handleKeydown}
            />
            {#if commitMessage.length > 0}
              <div class="enhanced-input-counter">
                <div class="counter-text">
                  {commitMessage.length}
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Enhanced Action Buttons -->
      <div class="enhanced-actions">
        <Button
          variant="outline"
          class="enhanced-cancel-button"
          on:click={handleCancel}
          disabled={isLoading}
        >
          {cancelText}
        </Button>

        <Button class="enhanced-confirm-button" on:click={handleConfirm} disabled={isLoading}>
          {#if isLoading}
            <div class="enhanced-loading-content">
              <div class="enhanced-spinner"></div>
              <span>Pushing...</span>
            </div>
          {:else}
            <div class="enhanced-button-content">
              <Upload class="h-4 w-4" />
              <span>{confirmText}</span>
            </div>
          {/if}
        </Button>
      </div>

      <!-- Loading overlay -->
      {#if isLoading}
        <div
          class="enhanced-loading-overlay"
          transition:fade={{ duration: prefersReducedMotion ? 0 : 150 }}
        >
          <div class="enhanced-loading-indicator">
            <div class="enhanced-loading-spinner"></div>
            <p class="enhanced-loading-text">Pushing to GitHub...</p>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* CSS Custom Properties for theming - matching UploadStatus */
  :root {
    --enhanced-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --enhanced-success: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
    --enhanced-error: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
    --enhanced-background: rgba(17, 24, 39, 0.95);
    --enhanced-border: rgba(255, 255, 255, 0.1);
    --enhanced-text-primary: rgba(255, 255, 255, 0.95);
    --enhanced-text-secondary: rgba(255, 255, 255, 0.7);
    --enhanced-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .enhanced-dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    pointer-events: auto;
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

  .enhanced-dialog-container {
    position: relative;
    width: 100%;
    max-width: 28rem;
    background: var(--enhanced-background);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--enhanced-border);
    border-radius: 1rem;
    box-shadow: var(--enhanced-shadow);
    overflow: hidden;
    transform: translateY(0) scale(1);
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .enhanced-dialog-header {
    position: relative;
    padding: 1.5rem 1.5rem 1rem;
  }

  .enhanced-close-button {
    position: absolute;
    right: 1rem;
    top: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: var(--enhanced-text-secondary);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
  }

  .enhanced-close-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: var(--enhanced-text-primary);
    transform: scale(1.05);
  }

  .enhanced-close-button:focus {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }

  .enhanced-close-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .enhanced-title-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding-right: 2rem;
  }

  .enhanced-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2));
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .enhanced-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--enhanced-text-primary);
    letter-spacing: -0.01em;
    margin: 0;
  }

  .enhanced-dialog-content {
    padding: 0 1.5rem 0.5rem;
  }

  .enhanced-message {
    font-size: 0.875rem;
    color: var(--enhanced-text-secondary);
    line-height: 1.5;
    margin: 0;
  }

  .enhanced-file-summary {
    margin-top: 1rem;
    padding: 0.75rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid var(--enhanced-border);
    border-radius: 0.5rem;
    backdrop-filter: blur(8px);
  }

  .enhanced-file-summary-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--enhanced-text-secondary);
    margin-bottom: 0.5rem;
  }

  .enhanced-file-summary-stats {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
  }

  .stat-added {
    color: #4ade80;
  }

  .stat-modified {
    color: #fbbf24;
  }

  .stat-deleted {
    color: #f87171;
  }

  .enhanced-input-section {
    padding: 0 1.5rem 1rem;
  }

  .enhanced-input-container {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .enhanced-input-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .enhanced-input-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--enhanced-text-primary);
  }

  .enhanced-template-toggle {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: #60a5fa;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 0.375rem;
    padding: 0.375rem 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
    backdrop-filter: blur(8px);
  }

  .enhanced-template-toggle:hover {
    color: #93c5fd;
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
    transform: scale(1.02);
  }

  .enhanced-template-toggle:active {
    transform: scale(0.98);
  }

  .enhanced-templates {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--enhanced-border);
    border-radius: 0.75rem;
    padding: 1rem;
    backdrop-filter: blur(12px);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .enhanced-templates-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .enhanced-templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.5rem;
  }

  .enhanced-template-item {
    position: relative;
    overflow: hidden;
    text-align: left;
    padding: 0.75rem;
    font-size: 0.75rem;
    color: var(--enhanced-text-secondary);
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transform: translateY(0);
    opacity: 0;
    animation: slideInTemplate 0.4s ease-out forwards;
  }

  .enhanced-template-item:hover {
    background: rgba(30, 41, 59, 0.7);
    color: var(--enhanced-text-primary);
    border-color: rgba(59, 130, 246, 0.3);
    transform: translateY(-2px);
    box-shadow:
      0 8px 16px rgba(0, 0, 0, 0.2),
      0 0 0 1px rgba(59, 130, 246, 0.2);
  }

  .enhanced-template-item:active {
    transform: translateY(0);
  }

  .template-text {
    position: relative;
    z-index: 2;
    font-family: 'JetBrains Mono', 'Fira Code', 'Monaco', 'Menlo', monospace;
    font-weight: 500;
  }

  .template-hover-bg {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.1));
    opacity: 0;
    transition: opacity 0.3s ease;
    z-index: 1;
  }

  .enhanced-template-item:hover .template-hover-bg {
    opacity: 1;
  }

  @keyframes slideInTemplate {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .enhanced-input-wrapper {
    position: relative;
  }

  :global(.enhanced-input) {
    width: 100% !important;
    background: rgba(30, 41, 59, 0.8) !important;
    border: 1px solid var(--enhanced-border) !important;
    color: var(--enhanced-text-primary) !important;
    border-radius: 0.5rem !important;
    padding: 0.75rem 1rem !important;
    font-size: 0.875rem !important;
    transition: all 0.2s ease !important;
    backdrop-filter: blur(8px) !important;
  }

  :global(.enhanced-input::placeholder) {
    color: var(--enhanced-text-secondary) !important;
  }

  :global(.enhanced-input:focus) {
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2) !important;
    outline: none !important;
  }

  .enhanced-input-counter {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
  }

  .counter-text {
    font-size: 0.75rem;
    color: var(--enhanced-text-secondary);
  }

  .enhanced-actions {
    display: flex;
    gap: 0.75rem;
    padding: 0 1.5rem 1.5rem;
  }

  :global(.enhanced-cancel-button) {
    flex: 1 !important;
    border: 1px solid var(--enhanced-border) !important;
    background: rgba(30, 41, 59, 0.5) !important;
    color: var(--enhanced-text-secondary) !important;
    transition: all 0.2s ease !important;
    backdrop-filter: blur(8px) !important;
  }

  :global(.enhanced-cancel-button:hover) {
    background: rgba(30, 41, 59, 0.7) !important;
    color: var(--enhanced-text-primary) !important;
  }

  :global(.enhanced-confirm-button) {
    flex: 1 !important;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
    color: white !important;
    font-weight: 500 !important;
    transition: all 0.2s ease !important;
    transform: scale(1) !important;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
  }

  :global(.enhanced-confirm-button:hover) {
    background: linear-gradient(135deg, #2563eb, #1e40af) !important;
    transform: scale(1.02) !important;
    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4) !important;
  }

  :global(.enhanced-confirm-button:active) {
    transform: scale(0.98) !important;
  }

  .enhanced-loading-content,
  .enhanced-button-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .enhanced-spinner {
    width: 1rem;
    height: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top: 2px solid white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .enhanced-loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(17, 24, 39, 0.5);
    backdrop-filter: blur(4px);
    border-radius: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .enhanced-loading-indicator {
    text-align: center;
  }

  .enhanced-loading-spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid rgba(59, 130, 246, 0.3);
    border-top: 2px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 0.5rem;
  }

  .enhanced-loading-text {
    font-size: 0.875rem;
    color: var(--enhanced-text-secondary);
    margin: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Accessibility: Respect reduced motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .enhanced-dialog-container,
    .enhanced-close-button,
    .enhanced-template-item,
    :global(.enhanced-input),
    :global(.enhanced-cancel-button),
    :global(.enhanced-confirm-button) {
      animation: none !important;
      transition: none !important;
    }

    .enhanced-spinner,
    .enhanced-loading-spinner {
      animation: none !important;
    }
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .enhanced-dialog-container {
      max-width: calc(100vw - 2rem);
      margin: 0 1rem;
    }

    .enhanced-dialog-header,
    .enhanced-dialog-content,
    .enhanced-input-section,
    .enhanced-actions {
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .enhanced-title {
      font-size: 1rem;
    }

    .enhanced-close-button {
      width: 1.75rem;
      height: 1.75rem;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .enhanced-dialog-container {
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid white;
    }

    .enhanced-title,
    .enhanced-message {
      color: white;
    }

    .enhanced-close-button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.5);
    }
  }

  /* Focus management for keyboard navigation */
  .enhanced-dialog-container:focus-within {
    outline: 2px solid rgba(59, 130, 246, 0.3);
    outline-offset: 2px;
  }
</style>
