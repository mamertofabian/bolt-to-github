<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { GitHubService } from '../../services/GitHubService';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import { Check, AlertCircle, MessageSquare, Send } from 'lucide-svelte';

  export let show = false;
  export let githubToken = '';

  const dispatch = createEventDispatcher();

  let category = '';
  let message = '';
  let email = '';
  let isSubmitting = false;
  let isSuccess = false;
  let error: string | null = null;

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
    email = '';
    isSuccess = false;
    error = null;
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

  async function handleSubmit() {
    if (!category || !message.trim()) return;

    isSubmitting = true;
    error = null;

    try {
      // Get browser and extension info
      const manifestData = chrome.runtime.getManifest();
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tabs[0]?.url;

      const metadata = {
        browserInfo: navigator.userAgent,
        extensionVersion: manifestData.version,
        url: currentUrl,
      };

      // Submit feedback using GitHub Issues API
      const githubService = new GitHubService(githubToken);
      await githubService.submitFeedback({
        category: category as 'appreciation' | 'question' | 'bug' | 'feature' | 'other',
        message: message.trim(),
        email: email.trim() || undefined,
        metadata,
      });

      isSuccess = true;
      setTimeout(() => {
        if (isSuccess) closeModal();
      }, 3000);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      error = err instanceof Error ? err.message : 'Failed to submit feedback';
    } finally {
      isSubmitting = false;
    }
  }

  function selectCategory(selectedCategory: string) {
    category = selectedCategory;
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<Modal {show} title="">
  <div class="space-y-4 max-h-[400px] overflow-y-auto scrollbar-styled">
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
            <span class="text-red-400 text-sm">{error}</span>
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

          <!-- Email Input -->
          <div class="space-y-2">
            <label for="email" class="text-sm font-medium text-slate-300">Email (optional)</label>
            <Input
              id="email"
              type="email"
              bind:value={email}
              placeholder="your.email@example.com"
              class="bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            <p class="text-xs text-slate-500">
              Only provide if you'd like a response to your feedback
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
  }

  .scrollbar-styled::-webkit-scrollbar {
    width: 8px;
  }

  .scrollbar-styled::-webkit-scrollbar-track {
    background: #1e293b;
    border-radius: 4px;
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
