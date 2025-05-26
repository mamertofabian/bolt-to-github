<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  const dispatch = createEventDispatcher();

  export let isCreatingIssue = false;
  let title = '';
  let body = '';

  function handleSubmit() {
    if (!title.trim()) return;

    isCreatingIssue = true;
    dispatch('submit', { title: title.trim(), body: body.trim() });
  }

  $: if (!isCreatingIssue) {
    title = '';
    body = '';
  }

  function handleCancel() {
    title = '';
    body = '';
    dispatch('cancel');
  }
</script>

<div class="border border-slate-700 rounded-md p-4 bg-slate-800/30 mb-4">
  <h3 class="font-medium text-sm mb-4 text-white">Create New Issue</h3>

  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <div class="space-y-2">
      <Label for="title" class="text-sm text-slate-300">Title</Label>
      <Input
        id="title"
        bind:value={title}
        placeholder="Enter issue title..."
        required
        disabled={isCreatingIssue}
        class="bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-blue-500"
      />
    </div>

    <div class="space-y-2">
      <Label for="description" class="text-sm text-slate-300">Description</Label>
      <textarea
        id="description"
        bind:value={body}
        placeholder="Describe the issue..."
        rows="4"
        disabled={isCreatingIssue}
        class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-vertical min-h-[100px]"
      ></textarea>
    </div>

    <div class="flex justify-end space-x-2 pt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        on:click={handleCancel}
        disabled={isCreatingIssue}
        class="border-slate-600 text-slate-300 hover:bg-slate-700"
      >
        Cancel
      </Button>

      <Button
        type="submit"
        size="sm"
        disabled={isCreatingIssue || !title.trim()}
        class="bg-green-600 hover:bg-green-700 text-white"
      >
        {isCreatingIssue ? 'Creating...' : 'Create Issue'}
      </Button>
    </div>
  </form>
</div>
