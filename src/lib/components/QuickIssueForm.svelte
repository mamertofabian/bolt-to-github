<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { issuesStore } from '$lib/stores/issuesStore';
  import {
    canSubmitIssueForm,
    createIssuePayload,
    sanitizeIssueFormData,
  } from '$lib/utils/issue-form';

  export let show: boolean;
  export let githubToken: string;
  export let repoOwner: string;
  export let repoName: string;

  const dispatch = createEventDispatcher();

  let title = '';
  let body = '';
  let isSubmitting = false;
  let error: string | null = null;

  // Reactive statement to check if form can be submitted
  $: canSubmit = canSubmitIssueForm({ title, body });

  async function handleSubmit() {
    if (!canSubmit) return;

    isSubmitting = true;
    error = null;

    try {
      const sanitizedData = sanitizeIssueFormData({ title, body });
      const payload = createIssuePayload(sanitizedData);

      await issuesStore.createIssue(repoOwner, repoName, githubToken, payload);

      // Reset form
      title = '';
      body = '';

      // Close modal and notify parent
      dispatch('success');
    } catch (err) {
      console.error('Error creating issue:', err);
      error = err instanceof Error ? err.message : 'Failed to create issue';
    } finally {
      isSubmitting = false;
    }
  }

  function handleCancel() {
    title = '';
    body = '';
    error = null;
    dispatch('close');
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleCancel();
    }
  }
</script>

{#if show}
  <!-- Modal Backdrop -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions-->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    on:click={handleCancel}
    on:keydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <!-- Modal Content -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      class="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md mx-4"
      on:click|stopPropagation
      role="document"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b border-slate-700">
        <h2 class="text-lg font-semibold text-white">Quick Issue</h2>
        <Button variant="ghost" size="sm" on:click={handleCancel} class="h-8 w-8 p-0">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </Button>
      </div>

      <!-- Content -->
      <div class="p-4">
        <div class="text-sm text-slate-400 mb-4 font-mono">{repoOwner}/{repoName}</div>

        {#if error}
          <div class="text-red-400 p-3 mb-4 border border-red-700 rounded bg-red-900/20 text-sm">
            {error}
          </div>
        {/if}

        <form on:submit|preventDefault={handleSubmit} class="space-y-4">
          <div class="space-y-2">
            <Label for="quick-title" class="text-sm text-slate-300">Title</Label>
            <Input
              id="quick-title"
              bind:value={title}
              placeholder="Enter issue title..."
              required
              disabled={isSubmitting}
              class="bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-blue-500"
              autofocus
            />
          </div>

          <div class="space-y-2">
            <Label for="quick-description" class="text-sm text-slate-300"
              >Description (optional)</Label
            >
            <textarea
              id="quick-description"
              bind:value={body}
              placeholder="Describe the issue..."
              rows="3"
              disabled={isSubmitting}
              class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical min-h-[80px]"
            ></textarea>
          </div>

          <div class="flex justify-end space-x-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              on:click={handleCancel}
              disabled={isSubmitting}
              class="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !canSubmit}
              class="bg-green-600 hover:bg-green-700 text-white"
            >
              {isSubmitting ? 'Creating...' : 'Create Issue'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}
