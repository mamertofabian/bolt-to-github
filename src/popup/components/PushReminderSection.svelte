<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  function handleConfigure() {
    dispatch('configure');
  }
</script>

<!-- Push Reminder Settings -->
<div class="border-t border-slate-800/50 pt-6">
  <div
    class="bg-gradient-to-br from-slate-800/20 to-slate-800/5 rounded-xl p-5 border border-slate-700/30 hover:border-slate-600/40 transition-colors"
  >
    <div class="space-y-4">
      <!-- Header with title and premium badge -->
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="text-lg font-semibold text-slate-100">Push Reminders</h3>
            <span
              class="text-xs font-medium bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-1 rounded-md flex items-center gap-1 shadow-sm"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                ></path>
              </svg>
              PRO
            </span>
          </div>
          <p class="text-sm text-slate-400 leading-relaxed">
            Get intelligent reminders to push your changes when you're idle or on schedule
          </p>
        </div>
      </div>

      <!-- Features list -->
      <div class="grid grid-cols-2 gap-3 text-xs text-slate-400">
        <div class="flex items-center gap-2">
          <svg
            class="w-3 h-3 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"
            ></path>
          </svg>
          <span>Smart activity detection</span>
        </div>
        <div class="flex items-center gap-2">
          <svg
            class="w-3 h-3 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"
            ></path>
          </svg>
          <span>Scheduled reminders</span>
        </div>
        <div class="flex items-center gap-2">
          <svg
            class="w-3 h-3 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"
            ></path>
          </svg>
          <span>Customizable intervals</span>
        </div>
        <div class="flex items-center gap-2">
          <svg
            class="w-3 h-3 text-purple-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"
            ></path>
          </svg>
          <span>Snooze options</span>
        </div>
      </div>

      <!-- Configure button -->
      <div class="pt-2">
        <Button
          variant="outline"
          class="w-full border-slate-600 hover:bg-slate-800 hover:border-slate-500 text-slate-300 hover:text-slate-200 font-medium py-2.5 transition-all duration-200 group"
          on:click={handleConfigure}
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
          Configure Push Reminders
        </Button>
      </div>
    </div>
  </div>
</div>
