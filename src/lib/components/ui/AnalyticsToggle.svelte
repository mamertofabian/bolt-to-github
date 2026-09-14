<script lang="ts">
  import { onMount } from 'svelte';
  import { analytics } from '../../../services/AnalyticsService';

  let includeUsage = false;
  let loading = true;
  let saving = false;
  let loadFailed = false;
  let errorMessage = '';

  onMount(() => {
    void loadPreference();
  });

  async function loadPreference(): Promise<void> {
    try {
      const stored = await chrome.storage.sync.get(['analyticsEnabled']);
      includeUsage = stored.analyticsEnabled ?? true;
    } catch {
      loadFailed = true;
      errorMessage = 'Could not load your uninstall feedback preference.';
    } finally {
      loading = false;
    }
  }

  async function updatePreference(event: Event): Promise<void> {
    const checkbox = event.currentTarget as HTMLInputElement;
    const next = checkbox.checked;
    saving = true;
    errorMessage = '';
    try {
      if (!next) {
        await chrome.runtime.setUninstallURL('');
      }
      await analytics.setAnalyticsEnabled(next);
      includeUsage = next;
    } catch {
      checkbox.checked = includeUsage;
      errorMessage = 'Could not save your uninstall feedback preference. Please try again.';
    } finally {
      saving = false;
    }
  }
</script>

<section class="border-t border-slate-800/50 pt-6" aria-labelledby="analytics-heading">
  <div class="rounded-xl border border-slate-700/30 bg-slate-800/20 p-5">
    <div class="flex items-center gap-2">
      <h3 id="analytics-heading" class="text-lg font-semibold text-slate-100">
        Privacy & Analytics
      </h3>
      <span class="rounded-md bg-slate-700 px-2 py-1 text-xs font-medium text-slate-200">
        Paused
      </span>
    </div>
    <p class="mt-3 text-sm text-slate-300">
      Google Analytics event tracking is paused for v2.0.0. No usage events are sent to Google
      Analytics.
    </p>
    <p class="mt-2 text-xs text-slate-400">
      On uninstall, an optional feedback link can include anonymous usage counts such as pushes and
      errors. These counts go to Bolt2GitHub, not Google Analytics.
    </p>
    <label class="mt-4 flex items-center gap-3 text-sm text-slate-200" for="uninstall-usage">
      <input
        id="uninstall-usage"
        type="checkbox"
        checked={includeUsage}
        disabled={loading || saving || loadFailed}
        on:change={updatePreference}
        class="h-4 w-4 rounded border-slate-500 bg-slate-900"
      />
      Include anonymous usage counts in uninstall feedback
    </label>
    {#if errorMessage}
      <p class="mt-2 text-sm text-red-300" role="alert">{errorMessage}</p>
    {/if}
  </div>
</section>
