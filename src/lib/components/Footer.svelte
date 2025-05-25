<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { CardFooter } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { AUTHOR_SITE, AUTHOR, COMPANY_SITE, COMPANY } from '$lib/constants';

  export let hasSubscribed = false;
  export let version = '';

  const dispatch = createEventDispatcher();

  function handleNewsletterClick() {
    dispatch('newsletter');
  }
</script>

<CardFooter class="text-sm text-slate-400 justify-between">
  <span
    >Created by <a href={AUTHOR_SITE} target="_blank" class="text-slate-200 hover:text-slate-50"
      >{AUTHOR}</a
    >
    of
    <a href={COMPANY_SITE} target="_blank" class="text-slate-200 hover:text-slate-50">{COMPANY}</a
    ></span
  >

  <div class="flex items-center gap-3 text-xs">
    {#if version}
      <span class="text-slate-500">v{version}</span>
    {/if}

    {#if !hasSubscribed}
      <Button
        variant="link"
        size="sm"
        class="text-xs p-0 h-auto text-slate-500 hover:text-slate-300 underline-offset-2"
        on:click={handleNewsletterClick}
      >
        Stay Updated
      </Button>
    {/if}
  </div>
</CardFooter>
