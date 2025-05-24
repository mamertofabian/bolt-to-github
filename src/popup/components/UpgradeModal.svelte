<script lang="ts">
  import type { PremiumFeature } from '../../content/services/PremiumService';
  import { Button } from '$lib/components/ui/button';

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
        return 'Unlimited File Changes';
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
          "You've reached your daily limit of 3 file change views. Upgrade for unlimited access!"
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
    <div class="bg-slate-900 border border-slate-800 rounded-lg p-6 w-96 max-w-[90vw]">
      <!-- Header -->
      <div class="flex justify-between items-start mb-4">
        <div>
          <h2 class="text-xl font-bold text-slate-200 mb-1">✨ Upgrade to Premium</h2>
          <p class="text-sm text-slate-400">Unlock {getFeatureTitle()}</p>
        </div>
        <button
          on:click={handleClose}
          class="text-slate-400 hover:text-slate-200 text-xl leading-none"
        >
          ✕
        </button>
      </div>

      <!-- Main message -->
      <div class="mb-6">
        <p class="text-slate-300 text-sm leading-relaxed">
          {getFeatureMessage()}
        </p>
      </div>

      <!-- Features list -->
      {#if features.length > 0}
        <div class="mb-6">
          <h3 class="text-slate-200 font-medium mb-3">Premium Features:</h3>
          <div class="space-y-3">
            {#each features as premiumFeature}
              <div class="flex items-start gap-3">
                <span class="text-lg">{premiumFeature.icon}</span>
                <div>
                  <h4 class="text-slate-200 font-medium text-sm">{premiumFeature.name}</h4>
                  <p class="text-slate-400 text-xs">{premiumFeature.description}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Pricing teaser -->
      <div
        class="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-lg p-4 mb-6"
      >
        <div class="text-center">
          <p class="text-blue-300 font-medium text-sm mb-1">Simple Pricing</p>
          <div class="flex items-center justify-center gap-3 mb-1">
            <div class="text-center">
              <p class="text-white text-lg font-bold">$4/month</p>
              <p class="text-slate-400 text-xs">Monthly</p>
            </div>
            <span class="text-slate-500">or</span>
            <div class="text-center">
              <p class="text-white text-lg font-bold">$40/year</p>
              <p class="text-slate-400 text-xs">Save $8</p>
            </div>
          </div>
          <p class="text-slate-400 text-xs">Cancel anytime</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <Button
          on:click={handleUpgrade}
          class="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          Upgrade Now
        </Button>
        <Button on:click={handleClose} variant="outline" class="px-4">Later</Button>
      </div>

      <!-- Trust indicators -->
      <div class="mt-4 text-center">
        <p class="text-slate-500 text-xs">
          Join 1,000+ developers who upgraded • Secure payment • No spam
        </p>
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
