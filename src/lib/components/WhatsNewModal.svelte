<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { whatsNewContent } from '$lib/constants/whatsNewContent';

  export let version: string;
  export let onClose: () => void;
  export let onDontShowAgain: () => void;
  export let showAllVersions: boolean = false;

  let visible = true;
  let mounted = false;
  let animationClass = '';
  let renderedContent = '';

  // Respect user's motion preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  onMount(() => {
    mounted = true;
    animationClass = 'whats-new-enter';

    // Render markdown content
    if (showAllVersions) {
      // Show current and previous version (total 2 versions)
      const sortedVersions = Object.entries(whatsNewContent)
        .sort(([a], [b]) => b.localeCompare(a)) // Sort by version descending
        .slice(0, 2); // Take only the first 2 versions

      const versions = sortedVersions
        .map(([ver, data], index) => {
          const versionContent = `
## Version ${ver} - ${data.date}

### Highlights
${data.highlights.map((h) => `- ${h}`).join('\n')}

${data.details || ''}
`;
          return versionContent;
        })
        .join('\n---\n');

      const rawHtml = marked(versions, { breaks: true }) as string;
      renderedContent = DOMPurify.sanitize(rawHtml);
    } else {
      // Show only current version for automatic display
      const versionData = whatsNewContent[version];
      if (versionData) {
        const fullContent = `
## Highlights
${versionData.highlights.map((h) => `- ${h}`).join('\n')}

${versionData.details || ''}
        `.trim();
        const rawHtml = marked(fullContent, { breaks: true }) as string;
        renderedContent = DOMPurify.sanitize(rawHtml);
      }
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
    // Cleanup if needed
  });

  const handleClose = () => {
    performClose();
  };

  const handleDontShowAgain = () => {
    onDontShowAgain();
    performClose();
  };

  const performClose = () => {
    animationClass = 'whats-new-exit';

    // Call onClose after animation completes
    setTimeout(
      () => {
        visible = false;
        onClose();
      },
      prefersReducedMotion ? 0 : 300
    );
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleClose();
    }
  };

  const handleBackdropClick = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  };
</script>

<svelte:window on:keydown={handleKeydown} />

{#if visible}
  <!-- Backdrop -->
  <div
    class="whats-new-backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: prefersReducedMotion ? 0 : 300 }}
    role="presentation"
  >
    <!-- Modal -->
    <div
      class="whats-new-modal {animationClass}"
      class:whats-new-visible={mounted}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      tabindex="-1"
      transition:fly={{ x: 100, duration: prefersReducedMotion ? 0 : 400 }}
    >
      <div class="whats-new-content">
        <!-- Header -->
        <div class="whats-new-header">
          <div class="whats-new-title-wrapper">
            <span class="whats-new-icon" aria-hidden="true">🎉</span>
            <h2 id="whats-new-title" class="whats-new-title">
              {showAllVersions
                ? "What's New in Bolt to GitHub"
                : `What's New in Bolt to GitHub v${version}`}
            </h2>
          </div>

          <button
            on:click={handleClose}
            class="whats-new-close-button"
            aria-label="Close modal"
            type="button"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="whats-new-close-icon"
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

        <!-- Content -->
        <div class="whats-new-body">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html renderedContent}
        </div>

        <!-- Footer -->
        <div class="whats-new-footer">
          <button
            on:click={handleDontShowAgain}
            class="whats-new-action-button whats-new-action-secondary"
            type="button"
          >
            Don't show for this version
          </button>

          <button
            on:click={handleClose}
            class="whats-new-action-button whats-new-action-primary"
            type="button"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* CSS Custom Properties for theming - matching Notification */
  :root {
    --whats-new-background: rgba(17, 24, 39, 0.95);
    --whats-new-border: rgba(255, 255, 255, 0.1);
    --whats-new-text-primary: rgba(255, 255, 255, 0.95);
    --whats-new-text-secondary: rgba(255, 255, 255, 0.7);
    --whats-new-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    --whats-new-accent: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  }

  .whats-new-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    z-index: 9998;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 2rem;
  }

  .whats-new-modal {
    position: relative;
    width: 32rem;
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 4rem);
    background: var(--whats-new-background);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--whats-new-border);
    border-radius: 0.75rem;
    box-shadow: var(--whats-new-shadow);
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
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .whats-new-modal.whats-new-visible {
    transform: translateX(0) scale(1);
    opacity: 1;
  }

  .whats-new-enter {
    animation: slideInScale 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .whats-new-exit {
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

  .whats-new-content {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .whats-new-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid var(--whats-new-border);
    flex-shrink: 0;
  }

  .whats-new-title-wrapper {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .whats-new-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .whats-new-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--whats-new-text-primary);
    margin: 0;
  }

  .whats-new-close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: var(--whats-new-text-secondary);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
    flex-shrink: 0;
  }

  .whats-new-close-button:hover {
    background: rgba(255, 255, 255, 0.2);
    color: var(--whats-new-text-primary);
    transform: scale(1.05);
  }

  .whats-new-close-button:focus {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }

  .whats-new-close-icon {
    width: 1.125rem;
    height: 1.125rem;
  }

  .whats-new-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
    color: var(--whats-new-text-primary);
    line-height: 1.6;
  }

  /* Markdown content styling */
  .whats-new-body :global(h2),
  .whats-new-body :global(h3) {
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
    color: var(--whats-new-text-primary);
  }

  .whats-new-body :global(h2) {
    font-size: 1.125rem;
  }

  .whats-new-body :global(h3) {
    font-size: 1rem;
  }

  .whats-new-body :global(p) {
    margin-bottom: 0.75rem;
    color: var(--whats-new-text-secondary);
  }

  .whats-new-body :global(ul),
  .whats-new-body :global(ol) {
    margin-bottom: 0.75rem;
    padding-left: 1.5rem;
  }

  .whats-new-body :global(li) {
    margin-bottom: 0.25rem;
    color: var(--whats-new-text-secondary);
  }

  .whats-new-body :global(strong) {
    color: var(--whats-new-text-primary);
    font-weight: 600;
  }

  .whats-new-body :global(code) {
    background: rgba(255, 255, 255, 0.1);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  }

  .whats-new-body :global(a) {
    color: #60a5fa;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .whats-new-body :global(a:hover) {
    color: #93bbfc;
  }

  /* Version separator styling */
  .whats-new-body :global(hr) {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    margin: 2rem 0;
  }

  /* Custom scrollbar */
  .whats-new-body::-webkit-scrollbar {
    width: 0.5rem;
  }

  .whats-new-body::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.25rem;
  }

  .whats-new-body::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 0.25rem;
  }

  .whats-new-body::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .whats-new-footer {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid var(--whats-new-border);
    flex-shrink: 0;
  }

  .whats-new-action-button {
    padding: 0.625rem 1.25rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    font-family: inherit;
    backdrop-filter: blur(8px);
  }

  .whats-new-action-primary {
    background: rgba(255, 255, 255, 0.9);
    color: #1f2937;
  }

  .whats-new-action-primary:hover {
    background: rgba(255, 255, 255, 1);
    transform: scale(1.02);
  }

  .whats-new-action-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: var(--whats-new-text-primary);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .whats-new-action-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
    transform: scale(1.02);
  }

  /* Accessibility: Respect reduced motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .whats-new-modal,
    .whats-new-action-button,
    .whats-new-close-button {
      animation: none !important;
      transition: none !important;
    }
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .whats-new-backdrop {
      padding: 0;
      align-items: center;
      justify-content: center;
    }

    .whats-new-modal {
      width: 100%;
      max-width: 100%;
      max-height: 100%;
      height: 100%;
      border-radius: 0;
    }

    .whats-new-header {
      padding: 1.25rem;
    }

    .whats-new-title {
      font-size: 1.125rem;
    }

    .whats-new-body {
      padding: 1.25rem;
    }

    .whats-new-footer {
      padding: 1.25rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .whats-new-action-button {
      flex: 1;
      min-width: 8rem;
    }
  }

  /* Tablet and medium screens */
  @media (max-width: 1024px) and (min-width: 641px) {
    .whats-new-modal {
      width: 28rem;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .whats-new-modal {
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid white;
    }

    .whats-new-close-button {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.5);
    }

    .whats-new-action-button {
      border: 1px solid rgba(255, 255, 255, 0.5);
    }
  }

  /* Focus management for keyboard navigation */
  .whats-new-modal:focus-within {
    outline: 2px solid rgba(255, 255, 255, 0.3);
    outline-offset: 2px;
  }
</style>
