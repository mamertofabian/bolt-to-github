<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let show: boolean = false;
</script>

{#if show}
  <div data-testid="newsletter-modal">Newsletter Modal</div>
{/if}
