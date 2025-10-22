<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let show: boolean = false;
  export let message: string = '';
  export let showSubscribePrompt: boolean = false;
  export let hasSubscribed: boolean = false;
</script>

{#if show}
  <div data-testid="success-toast">{message}</div>
{/if}
