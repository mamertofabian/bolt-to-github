<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import { Check, AlertCircle, Mail, Sparkles } from 'lucide-svelte';
  import { SubscriptionService } from '../../services/SubscriptionService';

  export let show = false;

  const dispatch = createEventDispatcher();

  let email = '';
  let name = '';
  let isSubmitting = false;
  let isSuccess = false;
  let error: string | null = null;

  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function resetForm() {
    email = '';
    name = '';
    isSuccess = false;
    error = null;
  }

  function closeModal() {
    show = false;
    resetForm();
    dispatch('close');
  }

  async function handleSubmit() {
    if (!isValidEmail(email)) return;

    isSubmitting = true;
    error = null;

    try {
      const subscriptionService = new SubscriptionService();
      const result = await subscriptionService.subscribe({
        email,
        name: name || undefined,
        preferences: {
          productUpdates: true,
          tips: true,
          communityNews: true,
        },
        metadata: {
          subscriptionSource: 'extension',
          extensionVersion: '',
          subscriptionDate: '',
        },
      });

      if (result.success) {
        isSuccess = true;

        // Save subscription status to storage
        await SubscriptionService.saveSubscriptionStatus(email);

        // Close after a delay
        setTimeout(() => {
          if (isSuccess) closeModal();
        }, 3000);
      } else {
        error = result.message || 'Failed to subscribe';
      }
    } catch (err) {
      console.error('Error subscribing:', err);
      error = err instanceof Error ? err.message : 'Failed to subscribe';
    } finally {
      isSubmitting = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeModal();
    } else if (event.key === 'Enter' && !isSubmitting && isValidEmail(email)) {
      handleSubmit();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<Modal {show} title="Stay in the Loop">
  {#if isSuccess}
    <div class="flex flex-col items-center justify-center py-6 text-center">
      <div class="bg-green-500/20 p-4 rounded-full mb-4">
        <Check class="h-8 w-8 text-green-500" />
      </div>
      <h3 class="text-lg font-semibold mb-2 text-slate-50">You're Subscribed!</h3>
      <p class="text-slate-400 mb-4">
        Thank you for subscribing. We'll send occasional updates to <span class="text-slate-300"
          >{email}</span
        >.
      </p>
      <div class="flex items-center gap-2 text-sm text-slate-500">
        <Sparkles class="h-4 w-4" />
        <span>You'll receive helpful tips and feature updates</span>
      </div>
    </div>
  {:else}
    <div class="space-y-6">
      <!-- Header Section -->
      <div class="flex items-start gap-3 mb-4">
        <div class="bg-blue-500/20 p-2 rounded-lg">
          <Mail class="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <p class="text-slate-300 text-sm leading-relaxed">
            Get occasional updates about new features, helpful tips, and resources for Bolt to
            GitHub.
          </p>
        </div>
      </div>

      {#if error}
        <div class="bg-red-500/20 p-3 rounded-lg text-sm text-red-400 flex items-start gap-2">
          <AlertCircle class="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      {/if}

      <form on:submit|preventDefault={handleSubmit} class="space-y-4">
        <div class="space-y-2">
          <Label for="email" class="text-slate-300">Email</Label>
          <Input
            id="email"
            type="email"
            bind:value={email}
            placeholder="your@email.com"
            class="bg-slate-800 border-slate-700 text-slate-50 focus:border-blue-500 focus:ring-blue-500/20"
            required
            disabled={isSubmitting}
          />
        </div>

        <div class="space-y-2">
          <Label for="name" class="text-slate-300">Name (optional)</Label>
          <Input
            id="name"
            bind:value={name}
            placeholder="Your name"
            class="bg-slate-800 border-slate-700 text-slate-50 focus:border-blue-500 focus:ring-blue-500/20"
            disabled={isSubmitting}
          />
        </div>

        <!-- Value Proposition -->
        <div class="bg-slate-800/50 p-3 rounded-lg">
          <p class="text-xs text-slate-400 mb-2">What you'll receive:</p>
          <ul class="text-xs text-slate-500 space-y-1">
            <li class="flex items-center gap-2">
              <div class="w-1 h-1 bg-blue-400 rounded-full"></div>
              New feature announcements
            </li>
            <li class="flex items-center gap-2">
              <div class="w-1 h-1 bg-blue-400 rounded-full"></div>
              Tips & tricks for productivity
            </li>
            <li class="flex items-center gap-2">
              <div class="w-1 h-1 bg-blue-400 rounded-full"></div>
              Community highlights
            </li>
          </ul>
        </div>

        <p class="text-xs text-slate-500">
          We respect your privacy. Unsubscribe at any time. We'll only send occasional emails with
          valuable content.
        </p>

        <div class="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            class="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
            on:click={closeModal}
            disabled={isSubmitting}
          >
            Not Now
          </Button>
          <Button
            type="submit"
            class="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isSubmitting || !isValidEmail(email)}
          >
            {#if isSubmitting}
              <div class="flex items-center gap-2">
                <div
                  class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
                ></div>
                Subscribing...
              </div>
            {:else}
              Subscribe
            {/if}
          </Button>
        </div>
      </form>
    </div>
  {/if}
</Modal>

<style>
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
