<!-- Test mock component - unused props are intentional -->
<!-- svelte-ignore unused-export-let -->
<script lang="ts">
  export let show: boolean = false;
  export let githubToken: string = '';
</script>

{#if show}
  <div data-testid="feedback-modal">Feedback Modal</div>
{/if}
