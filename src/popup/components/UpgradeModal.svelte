<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import type { PremiumFeature } from '$lib/constants/premiumFeatures';

  export let show = false;
  export let feature: string = ''; // Which feature triggered the modal
  export let reason: string = ''; // Why they need to upgrade
  export let features: PremiumFeature[] = [];

  function handleUpgrade() {
    // Open upgrade page
    chrome.tabs.create({
      url: 'https://bolt2github.com/upgrade',
    });
    show = false;
  }

  function handleClose() {
    show = false;
  }

  function getFeatureTitle(): string {
    switch (feature) {
      case 'fileChanges':
        return 'Detailed File Changes';
      case 'pushReminders':
        return 'Smart Push Reminders';
      case 'branchSelector':
        return 'Branch Selector';
      default:
        return 'Premium Features';
    }
  }

  function getFeatureMessage(): string {
    switch (feature) {
      case 'fileChanges':
        return (
          reason ||
          'Get detailed file change analysis and comparisons with GitHub repositories. Upgrade for full access!'
        );
      case 'pushReminders':
        return 'Stay on top of your work with intelligent push reminders that notify you when you have unsaved changes.';
      case 'branchSelector':
        return 'Choose specific branches when importing private repositories for better organization.';
      default:
        return 'Unlock powerful features to enhance your development workflow.';
    }
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div
      class="bg-slate-900 border border-slate-800 rounded-lg p-4 w-80 max-w-[90vw] max-h-[500px] overflow-y-auto"
    >
      <!-- Header -->
      <div class="flex justify-between items-start mb-3">
        <div>
          <h2 class="text-lg font-bold text-slate-200 mb-0.5">✨ Upgrade to Pro</h2>
          <p class="text-xs text-slate-400">Unlock {getFeatureTitle()}</p>
        </div>
        <button
          on:click={handleClose}
          class="text-slate-400 hover:text-slate-200 text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <!-- Main message -->
      <div class="mb-4">
        <p class="text-slate-300 text-xs leading-relaxed">
          {getFeatureMessage()}
        </p>
      </div>

      <!-- Features list - compact horizontal layout -->
      {#if features.length > 0}
        <div class="mb-4">
          <h3 class="text-slate-200 font-medium mb-2 text-sm">Pro Features:</h3>
          <div class="grid grid-cols-1 gap-2">
            {#each features as premiumFeature}
              <div class="flex items-center gap-2 text-xs">
                <span class="text-sm">{premiumFeature.icon}</span>
                <span class="text-slate-200 font-medium">{premiumFeature.name}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Compact pricing -->
      <div
        class="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-md p-3 mb-4"
      >
        <div class="text-center">
          <div class="flex items-center justify-center gap-4 mb-1">
            <div class="text-center">
              <p class="text-white text-sm font-bold">$4/mo</p>
              <p class="text-slate-400 text-xs">Monthly</p>
            </div>
            <span class="text-slate-500 text-xs">or</span>
            <div class="text-center">
              <p class="text-white text-sm font-bold">$40/yr</p>
              <p class="text-slate-400 text-xs">Save $8</p>
            </div>
          </div>
          <p class="text-slate-400 text-xs">Cancel anytime</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 mb-3">
        <Button
          on:click={handleUpgrade}
          class="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-sm py-2"
        >
          Upgrade Now
        </Button>
        <Button on:click={handleClose} variant="outline" class="px-3 text-sm py-2">Later</Button>
      </div>

      <!-- Compact trust indicators -->
      <div class="text-center">
        <p class="text-slate-500 text-xs">1,000+ developers • Secure payment</p>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Add subtle animation */
  .fixed {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .bg-slate-900 {
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
