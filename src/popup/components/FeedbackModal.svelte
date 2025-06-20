<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { createLogger } from '$lib/utils/logger';
  import { LogStorageManager } from '$lib/utils/logStorage';
  import { UnifiedGitHubService } from '../../services/UnifiedGitHubService';
  import { Button } from '$lib/components/ui/button';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import { Check, AlertCircle, MessageSquare, Send, ExternalLink, Mail } from 'lucide-svelte';

  // Declare chrome as any to avoid TypeScript errors
  const chrome = (window as any).chrome;

  const logger = createLogger('FeedbackModal');

  export let show = false;
  export let githubToken = '';

  const dispatch = createEventDispatcher();

  let category = '';
  let message = '';
  let isSubmitting = false;
  let isSuccess = false;
  let error: string | null = null;
  let showFallbackOption = false;
  let includeLogs = false;

  const feedbackCategories = [
    {
      value: 'appreciation',
      label: '💝 Appreciation',
      description: 'Share what you love about the extension',
    },
    { value: 'question', label: '❓ Question', description: 'Ask for help or clarification' },
    { value: 'bug', label: '🐛 Bug Report', description: 'Report an issue or unexpected behavior' },
    {
      value: 'feature',
      label: '✨ Feature Request',
      description: 'Suggest a new feature or improvement',
    },
    { value: 'other', label: '💬 Other', description: 'General feedback or suggestions' },
  ];

  function resetForm() {
    category = '';
    message = '';
    isSuccess = false;
    error = null;
    showFallbackOption = false;
    includeLogs = false;
  }

  function closeModal() {
    show = false;
    resetForm();
    dispatch('close');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    }
  }

  // Fetch and format logs for inclusion in feedback
  async function getFormattedLogs(): Promise<string> {
    try {
      const logManager = LogStorageManager.getInstance();
      const recentLogs = await logManager.getAllLogs({
        // Get logs from the last 24 hours, all levels
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      // Handle null/undefined logs
      if (!recentLogs || !Array.isArray(recentLogs)) {
        return 'No recent logs found.';
      }

      // Limit to most recent 50 entries to avoid making the issue too large
      const logsToInclude = recentLogs.slice(-50);

      if (logsToInclude.length === 0) {
        return 'No recent logs found.';
      }

      // Format logs for readability with validation
      const formattedLogs = logsToInclude
        .map((log) => {
          const timestamp = log.timestamp || 'Unknown time';
          const level = log.level ? log.level.toUpperCase() : 'UNKNOWN';
          const context = log.context || 'Unknown context';
          const module = log.module || 'Unknown module';
          const message = log.message || 'No message';
          const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
          return `[${timestamp}] [${level}] [${context}] [${module}]\n  ${message}${dataStr}`;
        })
        .join('\n\n');

      return `\`\`\`\n${formattedLogs}\n\`\`\``;
    } catch (err) {
      logger.error('Failed to fetch logs for feedback:', err);
      return 'Failed to fetch logs.';
    }
  }

  // Generate GitHub issue URL for manual submission
  async function generateGitHubIssueUrl(): Promise<string> {
    if (!category || !message.trim()) return '';

    const manifestData = chrome.runtime.getManifest();
    const issueTitle = `[${category.toUpperCase()}] User Feedback`;

    let issueBody = `## User Feedback\n\n`;
    issueBody += `**Category:** ${category}\n\n`;
    issueBody += `**Message:**\n${message.trim()}\n\n`;
    issueBody += `**Extension Version:** ${manifestData.version}\n`;
    issueBody += `**Browser Info:** ${navigator.userAgent}\n`;

    // Include logs if requested
    if (includeLogs && category === 'bug') {
      issueBody += `\n\n## Recent Logs\n`;
      const logs = await getFormattedLogs();
      issueBody += logs;
    }

    const params = new URLSearchParams({
      title: issueTitle,
      body: issueBody,
      labels: `feedback,${category}`,
    });

    return `https://github.com/mamertofabian/bolt-to-github/issues/new?${params.toString()}`;
  }

  async function openGitHubIssueInNewTab() {
    const url = await generateGitHubIssueUrl();
    if (url) {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
      closeModal();
    }
  }

  function isAuthenticationError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('401') ||
      errorMessage.includes('bad credentials') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('invalid token')
    );
  }

  async function handleSubmit() {
    if (!category || !message.trim()) return;

    isSubmitting = true;
    error = null;
    showFallbackOption = false;

    try {
      // Get browser and extension info
      const manifestData = chrome.runtime.getManifest();
      const metadata = {
        browserInfo: navigator.userAgent,
        extensionVersion: manifestData.version,
      };

      // Include logs if requested for bug reports
      let logsSection = '';
      if (includeLogs && category === 'bug') {
        logsSection = '\n\n## Recent Logs\n' + (await getFormattedLogs());
      }

      // Submit feedback using GitHub Issues API with authentication method detection
      const authSettings = await chrome.storage.local.get(['authenticationMethod']);
      const authMethod = authSettings.authenticationMethod || 'pat';

      let githubService: UnifiedGitHubService;
      if (authMethod === 'github_app') {
        githubService = new UnifiedGitHubService({ type: 'github_app' });
      } else {
        githubService = new UnifiedGitHubService(githubToken);
      }
      await githubService.submitFeedback({
        category: category as 'appreciation' | 'question' | 'bug' | 'feature' | 'other',
        message: message.trim() + logsSection,
        metadata,
      });

      isSuccess = true;
      setTimeout(() => {
        if (isSuccess) closeModal();
      }, 3000);
    } catch (err) {
      logger.error('Error submitting feedback:', err);

      if (err instanceof Error && isAuthenticationError(err)) {
        error =
          'GitHub authentication required. You can submit feedback directly on GitHub instead.';
        showFallbackOption = true;
      } else {
        error = err instanceof Error ? err.message : 'Failed to submit feedback';
        showFallbackOption = true;
      }
    } finally {
      isSubmitting = false;
    }
  }

  function selectCategory(selectedCategory: string) {
    category = selectedCategory;

    // Smooth scroll to message textarea and focus it after a short delay
    setTimeout(() => {
      const messageTextarea = document.getElementById('message');
      if (messageTextarea) {
        messageTextarea.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
        // Focus after scrolling is complete
        setTimeout(() => {
          messageTextarea.focus();
        }, 300);
      }
    }, 100);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<Modal {show} title="">
  <div class="space-y-4 max-h-[400px] overflow-y-auto scrollbar-styled pr-3 pl-1">
    {#if isSuccess}
      <div class="flex flex-col items-center justify-center py-8 text-center">
        <div class="bg-green-500/20 p-4 rounded-full mb-4">
          <Check class="h-8 w-8 text-green-500" />
        </div>
        <h3 class="text-lg font-medium mb-2 text-slate-200">Thank You!</h3>
        <p class="text-slate-400 text-sm leading-relaxed">
          Your feedback has been submitted successfully.<br />
          We appreciate your input and will review it soon!
        </p>
      </div>
    {:else}
      <div class="space-y-4">
        <!-- Header -->
        <div class="flex items-center gap-3 pb-2">
          <div class="bg-blue-500/20 p-2 rounded-lg">
            <MessageSquare class="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 class="text-lg font-medium text-slate-200">Send Feedback</h2>
            <p class="text-sm text-slate-400">Share your thoughts with the developer</p>
          </div>
        </div>

        {#if error}
          <div class="bg-red-500/20 p-3 rounded-md border border-red-500/30 flex items-start gap-2">
            <AlertCircle class="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
            <div class="text-red-400 text-sm">
              <p>{error}</p>
              {#if showFallbackOption}
                <p class="mt-2 text-slate-300">
                  Don't worry! You can still submit your feedback directly on GitHub.
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Feedback Type Selection -->
        <div class="space-y-3">
          <h3 class="text-sm font-medium text-slate-300">
            What type of feedback would you like to share?
          </h3>
          <div class="grid grid-cols-1 gap-2">
            {#each feedbackCategories as cat}
              <button
                type="button"
                class="p-3 border rounded-md text-left transition-all duration-200 {category ===
                cat.value
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:border-slate-600'}"
                on:click={() => selectCategory(cat.value)}
              >
                <div class="font-medium text-sm">{cat.label}</div>
                <div class="text-xs opacity-80 mt-1">{cat.description}</div>
              </button>
            {/each}
          </div>
        </div>

        {#if category}
          <!-- Message Input -->
          <div class="space-y-2">
            <label for="message" class="text-sm font-medium text-slate-300">Your Message</label>
            <textarea
              id="message"
              bind:value={message}
              placeholder="Please share your thoughts, ideas, or describe any issues you've encountered..."
              rows="4"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
              required
            ></textarea>
          </div>

          <!-- Include Logs Option (only for bug reports) -->
          {#if category === 'bug'}
            <div class="flex items-start gap-2">
              <input
                type="checkbox"
                id="includeLogs"
                bind:checked={includeLogs}
                class="mt-1 h-4 w-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-slate-900"
              />
              <label for="includeLogs" class="text-sm text-slate-300 cursor-pointer">
                <span class="font-medium">Include recent logs to help diagnose the issue</span>
                <p class="text-xs text-slate-400 mt-1">
                  Automatically attach recent logs to help diagnose the issue. This may include
                  technical information about your browser and extension activity.
                </p>
              </label>
            </div>
          {/if}

          <!-- Privacy Notice -->
          <div class="bg-blue-500/10 p-3 rounded-md border border-blue-500/30">
            <p class="text-xs text-blue-400 font-medium mb-1">Privacy Notice</p>
            <p class="text-xs text-slate-300">
              Your feedback will be posted publicly on GitHub. We only collect:
            </p>
            <ul class="text-xs text-slate-300 mt-1 ml-4 list-disc">
              <li>Your feedback message and category</li>
              <li>Extension version and browser information</li>
            </ul>
            <p class="text-xs text-slate-300 mt-1">
              No personal information or project URLs are collected.
            </p>
          </div>

          <!-- Fallback Option -->
          {#if showFallbackOption && category && message.trim()}
            <div class="bg-blue-500/10 p-3 rounded-md border border-blue-500/30">
              <h4 class="text-sm font-medium text-blue-400 mb-2">Alternative: Submit on GitHub</h4>
              <p class="text-xs text-slate-300 mb-3">
                Click the button below to open GitHub and submit your feedback directly. Your
                message will be pre-filled for you.
              </p>
              <Button
                type="button"
                size="sm"
                class="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 w-full"
                on:click={openGitHubIssueInNewTab}
              >
                <ExternalLink class="h-3 w-3" />
                Submit Feedback on GitHub
              </Button>
            </div>
          {/if}

          <!-- Alternative Contact Options -->
          <div class="bg-slate-800/50 p-3 rounded-md border border-slate-700 space-y-3">
            <p class="text-xs text-slate-400">
              Prefer other ways to submit feedback? Choose an option below:
            </p>

            <!-- GitHub Option -->
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2 w-full"
              on:click={() => {
                if (typeof chrome !== 'undefined' && chrome.tabs) {
                  chrome.tabs.create({
                    url: 'https://github.com/mamertofabian/bolt-to-github/issues/new',
                  });
                } else {
                  window.open(
                    'https://github.com/mamertofabian/bolt-to-github/issues/new',
                    '_blank'
                  );
                }
              }}
            >
              <ExternalLink class="h-3 w-3" />
              Submit on GitHub (Public)
            </Button>

            <!-- Email Option -->
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-2 w-full"
              on:click={async () => {
                const subject = encodeURIComponent(
                  `Bolt to GitHub Feedback: ${category || 'General'}`
                );

                let emailBody = message || 'Please describe your feedback here...';

                // Include logs if requested for bug reports
                if (includeLogs && category === 'bug') {
                  emailBody += '\n\n--- Recent Logs ---\n';
                  const logs = await getFormattedLogs();
                  // Remove markdown formatting for email and limit size
                  const cleanLogs = logs.replace(/```/g, '');
                  const maxEmailSize = 5000; // Reasonable email size limit
                  emailBody +=
                    cleanLogs.length > maxEmailSize
                      ? cleanLogs.substring(0, maxEmailSize) +
                        '\n\n[Logs truncated due to size limit]'
                      : cleanLogs;
                }

                const body = encodeURIComponent(emailBody);
                window.location.href = `mailto:aidrivencoder@gmail.com?subject=${subject}&body=${body}`;
              }}
              disabled={!category}
            >
              <Mail class="h-3 w-3" />
              Email Support (Private)
            </Button>

            <p class="text-xs text-slate-500 mt-2">
              Email: aidrivencoder@gmail.com for private feedback or direct support
            </p>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 flex-1"
              on:click={closeModal}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              class="bg-blue-600 hover:bg-blue-700 text-white flex-1 flex items-center gap-2"
              on:click={handleSubmit}
              disabled={isSubmitting || !category || !message.trim()}
            >
              {#if isSubmitting}
                <div
                  class="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"
                ></div>
                Sending...
              {:else}
                <Send class="h-3 w-3" />
                Send Feedback
              {/if}
            </Button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</Modal>

<style>
  textarea:focus {
    outline: none;
  }

  .scrollbar-styled {
    scrollbar-width: thin;
    scrollbar-color: #475569 #1e293b;
    padding-right: 4px;
  }

  .scrollbar-styled::-webkit-scrollbar {
    width: 8px;
  }

  .scrollbar-styled::-webkit-scrollbar-track {
    background: #1e293b;
    border-radius: 4px;
    margin-right: 4px;
  }

  .scrollbar-styled::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .scrollbar-styled::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }

  .scrollbar-styled::-webkit-scrollbar-thumb:active {
    background: #334155;
  }
</style>
