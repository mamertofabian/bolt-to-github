<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import type { PremiumFeature } from '$lib/constants/premiumFeatures';
  import { isAuthenticated } from '$lib/stores';
  import premiumStatusStore, { premiumStatusActions } from '$lib/stores/premiumStore';
  import { createLogger } from '$lib/utils/logger';

  const logger = createLogger('UpgradeModal');

  export let show = false;
  export let feature: string = ''; // Which feature triggered the modal
  export let reason: string = ''; // Why they need to upgrade
  export let features: PremiumFeature[] = [];

  // Reactive subscriptions
  $: isUserAuthenticated = $isAuthenticated;
  $: premiumStatus = $premiumStatusStore;

  // Accordion state - track which feature is expanded
  let expandedFeature: string | null = null;

  // Refresh state
  let isRefreshing = false;
  let showSuccess = false;

  function toggleFeature(featureId: string) {
    expandedFeature = expandedFeature === featureId ? null : featureId;
  }

  async function handleRefreshSubscription() {
    if (isRefreshing) return;

    try {
      isRefreshing = true;
      logger.info('🔄 Manually refreshing subscription status from upgrade modal...');

      // Send message to background script to force subscription check
      await chrome.runtime.sendMessage({ type: 'FORCE_SUBSCRIPTION_REFRESH' });

      // Also refresh the local premium store
      await premiumStatusActions.refresh();

      logger.info('✅ Subscription status refreshed');

      // Show brief success feedback
      showRefreshFeedback();

      // If user is now premium, close the modal
      setTimeout(() => {
        if (premiumStatus.isPremium) {
          logger.info('🎉 User is now premium, closing upgrade modal');
          handleClose();
        }
      }, 1500);
    } catch (error) {
      logger.error('Error refreshing subscription:', error);
    } finally {
      isRefreshing = false;
    }
  }

  function showRefreshFeedback() {
    showSuccess = true;
    setTimeout(() => {
      showSuccess = false;
    }, 2000); // Hide after 2 seconds
  }

  function handleUpgrade() {
    /* Open upgrade page */
    chrome.tabs.create({
      url: 'https://bolt2github.com/upgrade',
    });
    show = false;
  }

  function handleSignIn() {
    /* Open sign in page for existing premium users */
    chrome.tabs.create({
      url: 'https://bolt2github.com/login',
    });
    show = false;
  }

  function handleClose() {
    show = false;
    /* Reset expanded state when closing */
    expandedFeature = null;
  }

  function getFeatureTitle(): string {
    switch (feature) {
      case 'file-changes':
        return 'Detailed File Changes';
      case 'push-reminders':
        return 'Smart Push Reminders';
      case 'branch-selector':
        return 'Branch Selector';
      case 'issues':
        return 'GitHub Issues Management';
      default:
        return 'Premium Features';
    }
  }

  function getFeatureMessage(): string {
    switch (feature) {
      case 'file-changes':
        return (
          reason ||
          'Get detailed file change analysis and comparisons with GitHub repositories. Upgrade for full access!'
        );
      case 'push-reminders':
        return 'Stay on top of your work with intelligent push reminders that notify you when you have unsaved changes.';
      case 'branch-selector':
        return 'Choose specific branches when importing private repositories for better organization.';
      case 'issues':
        return (
          reason ||
          'Create, view, and manage GitHub Issues directly from Bolt. Upgrade to streamline your issue tracking workflow!'
        );
      default:
        return 'Unlock powerful features to enhance your development workflow.';
    }
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div
      class="bg-slate-900 border border-slate-800 rounded-lg p-4 max-w-[90vw] max-h-[500px] overflow-y-auto"
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

      <!-- Enhanced features list with accordion -->
      {#if features.length > 0}
        <div class="mb-2">
          <h3 class="text-slate-200 font-medium mb-2 text-sm">Pro Features:</h3>
          <div class="space-y-1">
            {#each features as premiumFeature}
              <div
                class="border border-slate-700/50 rounded-md overflow-hidden bg-slate-800/30 hover:bg-slate-800/50 transition-all duration-200"
              >
                <!-- Feature header - clickable -->
                <button
                  class="w-full flex items-center justify-between p-3 text-left hover:bg-slate-800/30 transition-colors duration-150 group"
                  on:click={() => toggleFeature(premiumFeature.id)}
                >
                  <div class="flex items-center gap-2.5 flex-1">
                    <span class="text-sm">{premiumFeature.icon}</span>
                    <span class="text-slate-200 font-medium text-xs group-hover:text-slate-100"
                      >{premiumFeature.name}</span
                    >
                  </div>
                  <!-- Chevron indicator -->
                  <svg
                    class="w-4 h-4 text-slate-400 transition-transform duration-200 {expandedFeature ===
                    premiumFeature.id
                      ? 'rotate-180'
                      : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 9l-7 7-7-7"
                    ></path>
                  </svg>
                </button>

                <!-- Feature description - collapsible -->
                {#if expandedFeature === premiumFeature.id}
                  <div class="px-3 pb-2 pt-0" style="animation: slideDown 0.2s ease-out;">
                    <div class="border-t border-slate-700/30 pt-2">
                      <p class="text-slate-400 text-xs leading-relaxed">
                        {premiumFeature.description}
                      </p>
                      {#if premiumFeature.benefits && premiumFeature.benefits.length > 0}
                        <div class="mt-2 space-y-1">
                          {#each premiumFeature.benefits as benefit}
                            <div class="flex items-center gap-1.5 text-xs">
                              <svg
                                class="w-3 h-3 text-emerald-400 flex-shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="2"
                                  d="M5 13l4 4L19 7"
                                ></path>
                              </svg>
                              <span class="text-slate-300">{benefit}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
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
      <div class="space-y-2 mb-3">
        <div class="flex gap-2">
          <Button
            on:click={handleUpgrade}
            class="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-sm py-2"
          >
            Upgrade Now
          </Button>
          <Button on:click={handleClose} variant="outline" class="px-3 text-sm py-2">Later</Button>
        </div>

        <!-- Refresh button for authenticated users -->
        {#if isUserAuthenticated}
          <Button
            variant="outline"
            size="sm"
            class="w-full border-slate-700 hover:bg-slate-800/50 text-slate-300 hover:text-slate-200 text-sm py-1.5 transition-all duration-200 {showSuccess
              ? 'border-emerald-500/50 bg-emerald-500/10'
              : ''}"
            on:click={handleRefreshSubscription}
            disabled={isRefreshing}
          >
            {#if showSuccess}
              <svg
                class="w-3 h-3 mr-1.5 text-emerald-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
              <span class="text-emerald-400">Refreshed!</span>
            {:else}
              <svg
                class="w-3 h-3 mr-1.5 {isRefreshing ? 'animate-spin' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                ></path>
              </svg>
              <span class="text-xs">
                {isRefreshing ? 'Checking subscription...' : 'Already upgraded? Refresh status'}
              </span>
            {/if}
          </Button>
        {/if}
      </div>

      <!-- Sign in link for existing premium users -->
      {#if !isUserAuthenticated}
        <div class="text-center border-t border-slate-700/30 pt-3 mb-2">
          <p class="text-slate-500 text-xs mb-2">Already upgraded?</p>
          <button
            on:click={handleSignIn}
            class="text-blue-400 hover:text-blue-300 text-xs underline transition-colors"
          >
            Sign in to your account
          </button>
        </div>
      {/if}

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

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
