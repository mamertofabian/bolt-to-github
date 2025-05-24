<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    PushReminderSettings,
    ReminderState,
  } from '../../content/services/PushReminderService';
  import { Button } from '$lib/components/ui/button';

  export let show = false;

  let settings: PushReminderSettings = {
    enabled: true,
    reminderInterval: 20,
    snoozeInterval: 10,
    minimumChanges: 3,
    maxRemindersPerSession: 5,
  };

  let state: ReminderState = {
    lastReminderTime: 0,
    lastSnoozeTime: 0,
    reminderCount: 0,
    sessionStartTime: Date.now(),
  };

  let loading = false;
  let message = '';

  onMount(() => {
    if (show) {
      loadCurrentSettings();
    }
  });

  $: if (show) {
    loadCurrentSettings();
  }

  async function loadCurrentSettings() {
    try {
      loading = true;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'GET_PUSH_REMINDER_DEBUG',
        });

        if (response?.settings) {
          settings = response.settings;
          state = response.state;
        }
      }
    } catch (error) {
      console.error('Failed to load push reminder settings:', error);
      message = 'Failed to load settings';
    } finally {
      loading = false;
    }
  }

  async function saveSettings() {
    try {
      loading = true;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'UPDATE_PUSH_REMINDER_SETTINGS',
          settings,
        });
        message = 'Settings saved successfully!';
        setTimeout(() => (message = ''), 3000);
      }
    } catch (error) {
      console.error('Failed to save push reminder settings:', error);
      message = 'Failed to save settings';
    } finally {
      loading = false;
    }
  }

  async function snoozeReminders() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SNOOZE_PUSH_REMINDERS',
        });
        message = `Reminders snoozed for ${settings.snoozeInterval} minutes`;
        setTimeout(() => (message = ''), 3000);
        await loadCurrentSettings(); // Refresh state
      }
    } catch (error) {
      console.error('Failed to snooze reminders:', error);
      message = 'Failed to snooze reminders';
    }
  }

  function formatTime(timestamp: number): string {
    if (timestamp === 0) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  function getTimeAgo(timestamp: number): string {
    if (timestamp === 0) return 'Never';
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div
      class="bg-slate-900 border border-slate-800 rounded-lg p-6 w-96 max-h-[90vh] overflow-y-auto"
    >
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-lg font-semibold text-slate-200">Push Reminder Settings</h2>
        <button on:click={() => (show = false)} class="text-slate-400 hover:text-slate-200">
          ✕
        </button>
      </div>

      {#if loading}
        <div class="text-center py-4">
          <div
            class="animate-spin h-6 w-6 border-2 border-slate-600 border-t-slate-200 rounded-full mx-auto"
          ></div>
          <p class="text-slate-400 mt-2">Loading...</p>
        </div>
      {:else}
        <div class="space-y-4">
          <!-- Enable/Disable -->
          <div class="flex items-center justify-between">
            <label class="text-slate-200 font-medium" for="enabled">Enable Reminders</label>
            <input
              type="checkbox"
              bind:checked={settings.enabled}
              class="w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500"
            />
          </div>

          <!-- Reminder Interval -->
          <div>
            <label class="block text-slate-200 font-medium mb-1" for="reminderInterval">
              Reminder Interval (minutes)
            </label>
            <input
              type="number"
              bind:value={settings.reminderInterval}
              min="5"
              max="120"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            <p class="text-xs text-slate-400 mt-1">
              How often to show reminders when you have unsaved changes
            </p>
          </div>

          <!-- Snooze Interval -->
          <div>
            <label class="block text-slate-200 font-medium mb-1" for="snoozeInterval">
              Snooze Duration (minutes)
            </label>
            <input
              type="number"
              bind:value={settings.snoozeInterval}
              min="5"
              max="60"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            <p class="text-xs text-slate-400 mt-1">How long to wait after snoozing a reminder</p>
          </div>

          <!-- Minimum Changes -->
          <div>
            <label class="block text-slate-200 font-medium mb-1" for="minimumChanges">
              Minimum Changes Required
            </label>
            <input
              type="number"
              bind:value={settings.minimumChanges}
              min="1"
              max="20"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            <p class="text-xs text-slate-400 mt-1">Only remind when this many files have changed</p>
          </div>

          <!-- Max Reminders -->
          <div>
            <label class="block text-slate-200 font-medium mb-1" for="maxRemindersPerSession">
              Max Reminders Per Session
            </label>
            <input
              type="number"
              bind:value={settings.maxRemindersPerSession}
              min="1"
              max="20"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-slate-200 focus:ring-2 focus:ring-blue-500"
            />
            <p class="text-xs text-slate-400 mt-1">
              Stop reminding after this many reminders in one session
            </p>
          </div>

          <!-- Current Status -->
          <div class="border-t border-slate-700 pt-4">
            <h3 class="text-slate-200 font-medium mb-2">Current Status</h3>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-slate-400">Last Reminder:</span>
                <span class="text-slate-200">
                  {getTimeAgo(state.lastReminderTime)}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Reminders This Session:</span>
                <span class="text-slate-200">
                  {state.reminderCount} / {settings.maxRemindersPerSession}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-400">Session Started:</span>
                <span class="text-slate-200">
                  {getTimeAgo(state.sessionStartTime)}
                </span>
              </div>
            </div>
          </div>

          <!-- Message -->
          {#if message}
            <div class="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-blue-300 text-sm">
              {message}
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex gap-2 pt-4">
            <Button on:click={saveSettings} disabled={loading} class="flex-1">Save Settings</Button>
            <Button on:click={snoozeReminders} disabled={loading} variant="outline" class="flex-1">
              Snooze Now
            </Button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
