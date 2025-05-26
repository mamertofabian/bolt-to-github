<script lang="ts">
  import { onMount } from 'svelte';
  import { analytics } from '../../../services/AnalyticsService';
  import { sendAnalyticsToBackground } from '../../utils/analytics';

  let analyticsEnabled = true;
  let loading = true;

  async function loadAnalyticsState() {
    try {
      // Read directly from storage to avoid any caching issues
      const storedResult = await chrome.storage.sync.get(['analyticsEnabled']);
      const storedValue = storedResult.analyticsEnabled ?? true; // Default to true if not set

      analyticsEnabled = Boolean(storedValue);

      // Verify the AnalyticsService agrees
      const serviceValue = await analytics.isAnalyticsEnabled();
      if (serviceValue !== storedValue) {
        // Trust the storage value
        analyticsEnabled = Boolean(storedValue);
      }
    } catch (error) {
      console.error('Failed to get analytics preference:', error);
      analyticsEnabled = true;
    } finally {
      loading = false;
    }
  }

  onMount(loadAnalyticsState);

  async function toggleAnalytics(event: Event) {
    if (loading) return;

    // Get the actual checkbox state from the event
    const checkbox = event.target as HTMLInputElement;
    const newValue = checkbox.checked;

    // Update UI to match checkbox
    analyticsEnabled = newValue;

    try {
      await analytics.setAnalyticsEnabled(newValue);

      // Track the preference change via background script
      sendAnalyticsToBackground('user_preference', {
        action: 'analytics_toggled',
        details: {
          oldValue: !newValue,
          newValue: newValue,
        },
      });
    } catch (error) {
      console.error('Failed to update analytics preference:', error);

      // If saving failed, revert both the UI state and checkbox
      analyticsEnabled = !newValue;
      checkbox.checked = !newValue;

      console.warn('Analytics preference could not be saved. Please try again.');
    }
  }
</script>

<!-- Privacy & Analytics Settings -->
<div class="border-t border-slate-800/50 pt-6">
  <div
    class="bg-gradient-to-br from-slate-800/20 to-slate-800/5 rounded-xl p-5 border border-slate-700/30 hover:border-slate-600/40 transition-colors"
  >
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-lg font-semibold text-slate-100">Privacy & Analytics</h3>
            <span
              class="text-xs font-medium bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-2 py-1 rounded-md flex items-center gap-1 shadow-sm"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                ></path>
              </svg>
              Privacy
            </span>
          </div>
          <p class="text-sm text-slate-400 leading-relaxed">
            Help us improve the extension with anonymous usage analytics. No personal data or code
            is ever collected.
          </p>
        </div>
      </div>

      <!-- Toggle Control -->
      <div
        class="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700/50"
      >
        <div class="flex-1">
          <label class="text-sm font-medium text-slate-200 cursor-pointer" for="analytics-toggle">
            Share anonymous usage analytics
          </label>
          <p class="text-xs text-slate-400 mt-1">
            Helps us understand how the extension is used and identify improvements
          </p>
        </div>

        <div class="ml-4">
          {#if loading}
            <div
              class="animate-spin h-5 w-5 border-2 border-slate-600 border-t-slate-200 rounded-full"
            ></div>
          {:else}
            <label class="relative inline-flex items-center cursor-pointer">
              <input
                id="analytics-toggle"
                type="checkbox"
                checked={analyticsEnabled}
                on:change={toggleAnalytics}
                disabled={loading}
                class="sr-only peer"
              />
              <div
                class="relative w-11 h-6 bg-slate-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"
              ></div>
            </label>
          {/if}
        </div>
      </div>

      <!-- What We Collect -->
      <details class="group">
        <summary
          class="flex items-center justify-between p-3 bg-slate-800/20 rounded-lg border border-slate-700/30 cursor-pointer hover:bg-slate-800/30 transition-colors"
        >
          <span class="text-sm font-medium text-slate-200">What data do we collect?</span>
          <svg
            class="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"
            ></path>
          </svg>
        </summary>

        <div class="mt-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700/20">
          <div class="space-y-3">
            <div class="grid grid-cols-1 gap-2">
              <div class="flex items-start gap-2">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span class="text-sm text-slate-300"
                  >Extension usage patterns (buttons clicked, features used)</span
                >
              </div>
              <div class="flex items-start gap-2">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span class="text-sm text-slate-300"
                  >Performance metrics (upload times, success/failure rates)</span
                >
              </div>
              <div class="flex items-start gap-2">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span class="text-sm text-slate-300">Error reports for debugging purposes</span>
              </div>
              <div class="flex items-start gap-2">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-2 flex-shrink-0"></div>
                <span class="text-sm text-slate-300"
                  >General usage statistics (installations, updates)</span
                >
              </div>
            </div>

            <div class="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
              <div class="flex items-start gap-2">
                <svg
                  class="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clip-rule="evenodd"
                  ></path>
                </svg>
                <div>
                  <p class="text-sm font-medium text-emerald-400">Privacy Protected</p>
                  <p class="text-xs text-emerald-300 mt-1">
                    We <strong>never</strong> collect your code, repository contents, GitHub tokens,
                    or any personal information.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  </div>
</div>
