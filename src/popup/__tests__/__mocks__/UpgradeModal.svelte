<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let show: boolean = false;
  export let feature: string = '';
  export let reason: string = '';
  export let features: unknown[] = [];
</script>

{#if show}
  <div data-testid="upgrade-modal">Upgrade Modal</div>
{/if}
