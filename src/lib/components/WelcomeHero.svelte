<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { ArrowRight } from 'lucide-svelte';

  const dispatch = createEventDispatcher<{
    start: void;
  }>();

  function handleGetStarted() {
    dispatch('start');
  }
</script>

<div class="text-center space-y-6 py-4">
  <!-- Welcome Message -->
  <div class="space-y-3">
    <h1 class="text-xl font-semibold text-slate-200">Welcome to Bolt to GitHub</h1>
    <p class="text-sm text-slate-400 leading-relaxed">
      A Bolt2GitHub account and the GitHub App are required to push your Bolt projects to GitHub.
      The next step guides you through both connections.
    </p>
  </div>

  <!-- Recommendation -->
  <div class="space-y-3 text-left max-w-sm mx-auto">
    <div class="p-3 bg-green-900/20 border border-green-700 rounded-lg">
      <div class="flex items-start gap-2">
        <div
          class="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        >
          <span class="text-white text-xs font-bold">✓</span>
        </div>
        <div class="text-sm">
          <p class="text-green-200 font-medium mb-1">GitHub App Required</p>
          <p class="text-green-300 text-xs leading-relaxed">
            Sign in to your Bolt2GitHub account, then install the GitHub App for scoped repository
            access and automatic credential renewal.
          </p>
        </div>
      </div>
    </div>

    <p class="text-xs text-slate-500 text-center">
      Don't worry - the setup process is guided and takes just a few clicks
    </p>
  </div>

  <!-- Get Started Button -->
  <Button on:click={handleGetStarted} class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2">
    Connect GitHub Account
    <ArrowRight class="w-4 h-4 ml-2" />
  </Button>
</div>
