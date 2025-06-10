<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import premiumStatusStore, {
    isPremium,
    isAuthenticated,
    premiumStatusActions,
  } from '$lib/stores/premiumStore';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // Premium status
  $: premiumStatus = $premiumStatusStore;
  $: isUserPremium = $isPremium;
  $: isUserAuthenticated = $isAuthenticated;

  // Refresh state
  let isRefreshing = false;
  let isLoggingOut = false;

  function handleUpgrade() {
    dispatch('upgrade');
  }

  function handleManage() {
    window.open('https://bolt2github.com/dashboard', '_blank');
  }

  function handleSignIn() {
    window.open('https://bolt2github.com/login', '_blank');
  }

  async function handleLogout() {
    if (isLoggingOut) return;

    try {
      isLoggingOut = true;
      console.log('🚪 Logout initiated from premium status component...');

      await premiumStatusActions.logout();

      console.log('✅ Logout completed successfully');

      // Show brief success feedback
      showLogoutFeedback();
    } catch (error) {
      console.error('❌ Error during logout:', error);
      // Could add error feedback here if needed
    } finally {
      isLoggingOut = false;
    }
  }

  async function handleRefreshSubscription() {
    if (isRefreshing) return;

    try {
      isRefreshing = true;
      console.log('🔄 Manually refreshing subscription status...');

      // Send message to background script to force subscription check
      await chrome.runtime.sendMessage({ type: 'FORCE_SUBSCRIPTION_REFRESH' });

      // Also refresh the local premium store
      await premiumStatusActions.refresh();

      console.log('✅ Subscription status refreshed');

      // Show brief success feedback
      showRefreshFeedback();
    } catch (error) {
      console.error('Error refreshing subscription:', error);
      // Could add error feedback here if needed
    } finally {
      isRefreshing = false;
    }
  }

  // Feedback state
  let showSuccess = false;
  let showLogoutSuccess = false;

  function showRefreshFeedback() {
    showSuccess = true;
    setTimeout(() => {
      showSuccess = false;
    }, 2000); // Hide after 2 seconds
  }

  function showLogoutFeedback() {
    showLogoutSuccess = true;
    setTimeout(() => {
      showLogoutSuccess = false;
    }, 2000); // Hide after 2 seconds
  }
</script>

<!-- Premium Status -->
<div class="border-t border-slate-800/50 pt-6">
  <div
    class="bg-gradient-to-br from-slate-800/30 to-slate-800/10 rounded-xl p-5 border border-slate-700/50 hover:border-slate-600/60 transition-all duration-200"
  >
    <div class="space-y-4">
      <!-- Header with title and status badge -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-3">
            <h3 class="text-lg font-semibold text-slate-100">Premium Status</h3>
            {#if isUserPremium}
              <span
                class="text-xs font-medium bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-2 py-1 rounded-md flex items-center gap-1 shadow-sm"
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  ></path>
                </svg>
                PRO
              </span>
            {/if}
          </div>

          <!-- Plan details -->
          <div class="space-y-3">
            {#if isUserPremium}
              <div class="space-y-2">
                <p class="text-slate-200 font-medium text-base">Premium Plan</p>
                <div class="flex items-center gap-2 text-sm text-slate-400">
                  <svg
                    class="w-4 h-4 text-emerald-400"
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
                  <span>All premium features unlocked</span>
                </div>
                {#if premiumStatus.expiresAt}
                  <div class="flex items-center gap-2 text-sm text-slate-400">
                    <svg
                      class="w-4 h-4 text-slate-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      ></path>
                    </svg>
                    <span>
                      Renews on {new Date(premiumStatus.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                {/if}
              </div>

              <!-- Premium features -->
              <div class="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
                <div class="flex items-center gap-1.5">
                  <svg
                    class="w-3 h-3 text-emerald-400"
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
                  <span>File changes analysis</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <svg
                    class="w-3 h-3 text-emerald-400"
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
                  <span>Smart push reminders</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <svg
                    class="w-3 h-3 text-emerald-400"
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
                  <span>Branch selector</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <svg
                    class="w-3 h-3 text-emerald-400"
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
                  <span>Priority support</span>
                </div>
              </div>
            {:else}
              <div class="space-y-2">
                <p class="text-slate-200 font-medium text-base">Free Plan</p>
                <div class="flex items-center gap-2 text-sm text-slate-400">
                  <svg
                    class="w-4 h-4 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                    ></path>
                  </svg>
                  <span>
                    {isUserAuthenticated
                      ? 'Account active - upgrade for premium features'
                      : 'Basic features included'}
                  </span>
                </div>
              </div>

              <!-- Free plan limitations -->
              <div class="grid grid-cols-1 gap-2 text-xs text-slate-500 pt-1">
                <div class="flex items-center gap-1.5">
                  <svg
                    class="w-3 h-3 text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                  <span>Limited to basic repository sync</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <svg
                    class="w-3 h-3 text-slate-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    ></path>
                  </svg>
                  <span>No advanced features</span>
                </div>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="pt-2 space-y-2">
        {#if !isUserPremium}
          <Button
            class="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium py-2.5 shadow-lg hover:shadow-xl transition-all duration-200 group"
            on:click={handleUpgrade}
          >
            <svg
              class="w-4 h-4 mr-2 group-hover:scale-110 transition-transform duration-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              ></path>
            </svg>
            Upgrade to Premium
          </Button>
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
        {:else}
          <Button
            variant="outline"
            class="w-full border-slate-600 hover:bg-slate-800 hover:border-slate-500 text-slate-200 hover:text-slate-100 font-medium py-2.5 transition-all duration-200 group"
            on:click={handleManage}
          >
            <svg
              class="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform duration-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              ></path>
            </svg>
            Manage Subscription
          </Button>
        {/if}

        <!-- Manual refresh button for authenticated users -->
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
              {isRefreshing ? 'Refreshing...' : 'Refresh Status'}
            {/if}
          </Button>
        {/if}

        <!-- Logout button for authenticated users -->
        {#if isUserAuthenticated}
          <Button
            variant="outline"
            size="sm"
            class="w-full border-slate-700 hover:bg-slate-800/50 text-slate-300 hover:text-slate-200 text-sm py-1.5 transition-all duration-200 {showLogoutSuccess
              ? 'border-emerald-500/50 bg-emerald-500/10'
              : ''}"
            on:click={handleLogout}
            disabled={isLoggingOut}
          >
            {#if showLogoutSuccess}
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
              <span class="text-emerald-400">Logged out!</span>
            {:else}
              <svg
                class="w-3 h-3 mr-1.5 {isLoggingOut ? 'animate-spin' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                ></path>
              </svg>
              {isLoggingOut ? 'Logging out...' : 'Logout'}
            {/if}
          </Button>
        {/if}
      </div>
    </div>
  </div>
</div>
