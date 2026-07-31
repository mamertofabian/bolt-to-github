<script lang="ts" context="module">
  import type { ReadinessSnapshot } from '../../production-readiness/domain';

  export interface ProductionReadinessPanelProps {
    snapshot: ReadinessSnapshot | null;
    isLoading?: boolean;
    error?: string | null;
    onCopyReceipt: (snapshot: ReadinessSnapshot) => Promise<void> | void;
    onGenerateHandoff: (snapshot: ReadinessSnapshot) => Promise<void> | void;
  }
</script>

<script lang="ts">
  import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    FileText,
    LoaderCircle,
    ShieldAlert,
  } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';
  import type { ReadinessState } from '../../production-readiness/domain';

  export let snapshot: ReadinessSnapshot | null;
  export let isLoading = false;
  export let error: string | null = null;
  export let onCopyReceipt: (snapshot: ReadinessSnapshot) => Promise<void> | void;
  export let onGenerateHandoff: (snapshot: ReadinessSnapshot) => Promise<void> | void;

  type ActionState = 'idle' | 'copying' | 'generating';

  let actionState: ActionState = 'idle';
  let actionFeedback: string | null = null;
  let actionError: string | null = null;
  let actionGeneration = 0;
  let observedSnapshot = snapshot;
  let observedLoading = isLoading;
  let observedError = error;

  const STATE_LABELS: Readonly<Record<ReadinessState, string>> = {
    green: 'Green',
    yellow: 'Yellow',
    red: 'Red',
  };

  const STATE_PANEL_CLASSES: Readonly<Record<ReadinessState, string>> = {
    green: 'border-emerald-500/40 bg-emerald-500/5',
    yellow: 'border-amber-500/40 bg-amber-500/5',
    red: 'border-red-500/40 bg-red-500/5',
  };

  const STATE_BADGE_CLASSES: Readonly<Record<ReadinessState, string>> = {
    green: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300',
    yellow: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
    red: 'border-red-400/40 bg-red-500/15 text-red-200',
  };

  $: readinessState = snapshot?.state.state ?? 'green';
  $: stateLabel = STATE_LABELS[readinessState];
  $: actionsBusy = actionState !== 'idle';
  $: if (
    snapshot !== observedSnapshot ||
    isLoading !== observedLoading ||
    error !== observedError
  ) {
    observedSnapshot = snapshot;
    observedLoading = isLoading;
    observedError = error;
    actionGeneration += 1;
    actionState = 'idle';
    actionFeedback = null;
    actionError = null;
  }

  async function runAction(action: 'copy' | 'handoff'): Promise<void> {
    if (!snapshot || actionsBusy) {
      return;
    }

    const targetSnapshot = snapshot;
    const generation = ++actionGeneration;
    actionState = action === 'copy' ? 'copying' : 'generating';
    actionFeedback = null;
    actionError = null;

    try {
      if (action === 'copy') {
        await onCopyReceipt(targetSnapshot);
        if (generation !== actionGeneration) {
          return;
        }
        actionFeedback = 'Receipt copied.';
      } else {
        await onGenerateHandoff(targetSnapshot);
        if (generation !== actionGeneration) {
          return;
        }
        actionFeedback = 'Handoff report generated.';
      }
    } catch {
      if (generation !== actionGeneration) {
        return;
      }
      actionError =
        action === 'copy'
          ? 'The receipt could not be copied. Try again.'
          : 'The handoff report could not be generated. Try again.';
    } finally {
      if (generation === actionGeneration) {
        actionState = 'idle';
      }
    }
  }
</script>

<section
  aria-labelledby="production-readiness-heading"
  class="rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-slate-100"
>
  <div class="flex items-start justify-between gap-3">
    <div>
      <h2 id="production-readiness-heading" class="text-base font-semibold">
        Production Readiness Snapshot
      </h2>
      <p class="mt-1 text-xs text-slate-400">
        Deterministic export preflight, not a security audit or proof of correctness.
      </p>
    </div>
  </div>

  {#if isLoading}
    <div class="mt-4 flex items-center gap-2 rounded-md bg-slate-800 p-3 text-sm" role="status">
      <LoaderCircle class="h-4 w-4 animate-spin text-blue-300" aria-hidden="true" />
      <span>Analyzing production readiness…</span>
    </div>
  {:else if error}
    <div class="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-3" role="alert">
      <div class="flex items-center gap-2 text-sm font-medium text-red-200">
        <AlertTriangle class="h-4 w-4" aria-hidden="true" />
        Readiness snapshot unavailable
      </div>
      <p class="mt-1 text-sm text-red-100">{error}</p>
      <p class="mt-2 text-xs text-red-200/80">Existing export actions remain available.</p>
    </div>
  {:else if !snapshot}
    <div class="mt-4 rounded-md border border-slate-700 bg-slate-800/70 p-3 text-sm text-slate-300">
      No readiness snapshot is available yet.
    </div>
  {:else}
    <div class={`mt-4 rounded-lg border p-3 ${STATE_PANEL_CLASSES[readinessState]}`}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          {#if readinessState === 'green'}
            <CheckCircle2 class="h-5 w-5 text-emerald-300" aria-hidden="true" />
          {:else if readinessState === 'yellow'}
            <AlertTriangle class="h-5 w-5 text-amber-200" aria-hidden="true" />
          {:else}
            <ShieldAlert class="h-5 w-5 text-red-200" aria-hidden="true" />
          {/if}
          <span
            class={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATE_BADGE_CLASSES[readinessState]}`}
            aria-label={`Readiness state: ${stateLabel}`}
          >
            {stateLabel}
          </span>
        </div>
        <span class="text-xs text-slate-300">
          Confidence: {snapshot.state.confidence.slice(0, 1).toUpperCase() +
            snapshot.state.confidence.slice(1)}
        </span>
      </div>

      <p class="mt-3 text-sm font-medium text-slate-100">{snapshot.state.headline}</p>
      <p class="mt-1 text-sm text-slate-300">{snapshot.state.recommendedAction}</p>

      {#if readinessState === 'red'}
        <p class="mt-2 text-xs font-medium text-red-200">
          This recommendation does not block the existing export flow.
        </p>
      {/if}
    </div>

    <div class="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <div class="rounded-md bg-slate-800 p-2">
        <span class="block text-slate-400">Changed files</span>
        <strong class="mt-1 block text-sm text-slate-100">{snapshot.comparison.changedFiles}</strong
        >
      </div>
      <div class="rounded-md bg-slate-800 p-2">
        <span class="block text-slate-400">Added</span>
        <strong class="mt-1 block text-sm text-slate-100">{snapshot.comparison.addedFiles}</strong>
      </div>
      <div class="rounded-md bg-slate-800 p-2">
        <span class="block text-slate-400">Deleted</span>
        <strong class="mt-1 block text-sm text-slate-100">{snapshot.comparison.deletedFiles}</strong
        >
      </div>
      <div class="rounded-md bg-slate-800 p-2">
        <span class="block text-slate-400">Sensitive</span>
        <strong class="mt-1 block text-sm text-slate-100">
          {snapshot.comparison.sensitiveFilesChanged}
        </strong>
      </div>
    </div>

    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <section aria-labelledby="readiness-concerns-heading">
        <h3 id="readiness-concerns-heading" class="text-sm font-semibold text-slate-200">
          Top concerns
        </h3>
        {#if snapshot.state.topConcerns.length > 0}
          <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
            {#each snapshot.state.topConcerns as concern}
              <li>{concern}</li>
            {/each}
          </ol>
        {:else}
          <p class="mt-2 text-sm text-slate-400">No concerns reported.</p>
        {/if}
      </section>

      <section aria-labelledby="readiness-safe-heading">
        <h3 id="readiness-safe-heading" class="text-sm font-semibold text-slate-200">
          Safe-looking areas
        </h3>
        {#if snapshot.state.safeLookingAreas.length > 0}
          <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
            {#each snapshot.state.safeLookingAreas as safeArea}
              <li>{safeArea}</li>
            {/each}
          </ul>
        {:else}
          <p class="mt-2 text-sm text-slate-400">None established from the available analysis.</p>
        {/if}
      </section>
    </div>

    <details class="mt-4 rounded-md border border-slate-700 bg-slate-800/60 p-3">
      <summary class="cursor-pointer text-sm font-medium text-slate-200">View evidence</summary>
      {#if snapshot.signals.length > 0}
        <div class="mt-3 space-y-3">
          {#each snapshot.signals as signal}
            <section aria-label={signal.title}>
              <h3 class="text-sm font-medium text-slate-100">{signal.title}</h3>
              <p class="mt-1 text-xs text-slate-400">{signal.message}</p>
              {#if signal.evidence.length > 0}
                <ul class="mt-2 space-y-1 text-xs text-slate-300">
                  {#each signal.evidence as evidence}
                    <li>
                      <span>{evidence.label}</span>
                      {#if evidence.path}
                        <code class="ml-1 rounded bg-slate-900 px-1 py-0.5">{evidence.path}</code>
                      {/if}
                      {#if evidence.redacted}
                        <span class="ml-1 text-slate-500">(value redacted)</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/each}
        </div>
      {:else}
        <p class="mt-2 text-xs text-slate-400">No detailed evidence was reported.</p>
      {/if}
    </details>

    {#if snapshot.limitations.length > 0}
      <section class="mt-4" aria-labelledby="readiness-limitations-heading">
        <h3 id="readiness-limitations-heading" class="text-sm font-semibold text-slate-200">
          Limitations
        </h3>
        <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {#each snapshot.limitations as limitation}
            <li>{limitation}</li>
          {/each}
        </ul>
      </section>
    {/if}

    <p class="mt-4 text-xs text-slate-500">
      Static analysis only. This snapshot does not run the app, execute tests, or prove correctness.
    </p>

    <div class="mt-4 flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        class="gap-1.5 border-slate-600 bg-slate-800 text-xs hover:bg-slate-700"
        disabled={actionsBusy}
        aria-label={actionState === 'copying' ? 'Copying receipt' : 'Copy receipt'}
        aria-busy={actionState === 'copying'}
        on:click={() => runAction('copy')}
      >
        <Copy class="h-3.5 w-3.5" aria-hidden="true" />
        {actionState === 'copying' ? 'Copying…' : 'Copy receipt'}
      </Button>
      <Button
        variant="default"
        size="sm"
        class="gap-1.5 bg-blue-600 text-xs hover:bg-blue-700"
        disabled={actionsBusy}
        aria-label={actionState === 'generating'
          ? 'Generating ADC Fix handoff'
          : 'Generate ADC Fix handoff'}
        aria-busy={actionState === 'generating'}
        on:click={() => runAction('handoff')}
      >
        <FileText class="h-3.5 w-3.5" aria-hidden="true" />
        {actionState === 'generating' ? 'Generating…' : 'Generate ADC Fix handoff'}
      </Button>
    </div>

    {#if actionFeedback}
      <p class="mt-3 text-xs text-emerald-300" role="status">{actionFeedback}</p>
    {/if}
    {#if actionError}
      <p class="mt-3 text-xs text-red-300" role="alert">{actionError}</p>
    {/if}
  {/if}
</section>
