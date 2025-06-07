<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Help from '$lib/components/Help.svelte';
  import NewsletterSection from '$lib/components/NewsletterSection.svelte';
  import Footer from '$lib/components/Footer.svelte';

  export let projectSettings: any;

  const dispatch = createEventDispatcher<{
    newsletter: void;
  }>();

  function handleNewsletter() {
    dispatch('newsletter');
  }
</script>

<div class="space-y-4">
  <Help />
  <!-- Newsletter Subscription -->
  <NewsletterSection />
  <div class="mt-3">
    <Footer version={projectSettings.version} on:newsletter={handleNewsletter} />
  </div>
</div>
