<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { SubscriptionService } from '../../services/SubscriptionService';

  // Newsletter subscription variables
  let subscribeToNewsletter = false;
  let subscriberEmail = '';
  let isSubscribing = false;
  let hasSubscribed = false;
  let subscriptionError: string | null = null;
  let emailAutoFilled = false;

  function isValidSubscriberEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleSubscribe() {
    if (!isValidSubscriberEmail(subscriberEmail)) return;

    isSubscribing = true;
    subscriptionError = null;

    try {
      const subscriptionService = new SubscriptionService();
      const result = await subscriptionService.subscribe({
        email: subscriberEmail,
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
        hasSubscribed = true;
        subscribeToNewsletter = false; // Hide the form

        // Save subscription status to storage
        await SubscriptionService.saveSubscriptionStatus(subscriberEmail);
      } else {
        subscriptionError = result.message || 'Failed to subscribe';
      }
    } catch (error) {
      console.error('Subscription error:', error);
      subscriptionError = 'Failed to subscribe. Please try again.';
    } finally {
      isSubscribing = false;
    }
  }

  // Load subscription status and user email on mount
  onMount(async () => {
    const subscription = await SubscriptionService.getSubscriptionStatus();
    hasSubscribed = subscription.subscribed;

    // If already subscribed, show the subscribed email
    if (subscription.subscribed && subscription.email) {
      subscriberEmail = subscription.email;
    } else {
      // Try to auto-populate email from authenticated user
      try {
        const authState = await chrome.storage.local.get('supabaseAuthState');
        if (
          authState.supabaseAuthState?.isAuthenticated &&
          authState.supabaseAuthState.user?.email
        ) {
          subscriberEmail = authState.supabaseAuthState.user.email;
          emailAutoFilled = true;
        }
      } catch (error) {
        console.error('Error loading auth state for email auto-population:', error);
      }
    }
  });
</script>

<div class="p-3 bg-slate-850 border border-slate-700 rounded-md">
  <h3 class="text-slate-200 font-medium mb-3 flex items-center">
    <span>Newsletter Subscription</span>
  </h3>

  {#if hasSubscribed}
    <!-- Already Subscribed State -->
    <div class="flex items-center space-x-2 text-green-400">
      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fill-rule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clip-rule="evenodd"
        />
      </svg>
      <div>
        <p class="font-medium">You're subscribed!</p>
        <p class="text-xs text-slate-400">
          Receiving updates at {subscriberEmail}
        </p>
        <p class="text-xs text-slate-400">
          You can unsubscribe at any time from the emails you receive.
        </p>
      </div>
    </div>
  {:else}
    <!-- Subscription Form -->
    <div class="space-y-3">
      <div class="flex items-start space-x-2">
        <input
          type="checkbox"
          id="newsletter"
          bind:checked={subscribeToNewsletter}
          class="mt-1 w-4 h-4 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
        />
        <div class="flex-1">
          <Label for="newsletter" class="font-medium text-slate-300">Stay Updated</Label>
          <p class="text-xs text-slate-400 mt-1">
            Receive occasional updates about new features, tips, and community news. We respect your
            privacy and you can unsubscribe at any time.
          </p>
        </div>
      </div>

      {#if subscribeToNewsletter}
        <div class="ml-6 space-y-2">
          <Label for="subscriberEmail" class="text-sm text-slate-300">Email</Label>
          <div class="flex gap-2">
            <Input
              id="subscriberEmail"
              type="email"
              placeholder="your@email.com"
              bind:value={subscriberEmail}
              on:input={() => {
                emailAutoFilled = false;
              }}
              class="flex-1 bg-slate-800 border-slate-700 text-slate-200 placeholder:text-slate-500"
            />
            <Button
              type="button"
              size="sm"
              disabled={!isValidSubscriberEmail(subscriberEmail) || isSubscribing}
              on:click={handleSubscribe}
              class="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubscribing ? 'Subscribing...' : 'Subscribe'}
            </Button>
          </div>
          {#if subscriptionError}
            <p class="text-xs text-red-400">{subscriptionError}</p>
          {/if}
          {#if emailAutoFilled}
            <p class="text-xs text-slate-500">📧 Email auto-filled from your account</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
