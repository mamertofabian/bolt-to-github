/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ReadinessSnapshot, ReadinessState } from '../../../production-readiness/domain';
import { loadPrsFixture } from '../../../production-readiness/test-fixtures/prsFixtures';
import ProductionReadinessPanel, {
  type ProductionReadinessPanelProps,
} from '../ProductionReadinessPanel.svelte';
import productionReadinessPanelSource from '../ProductionReadinessPanel.svelte?raw';

vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('bits-ui');
vi.unmock('lucide-svelte');

function fixtureSnapshot(): ReadinessSnapshot {
  const snapshot = loadPrsFixture('auth-env-change').goldenSnapshot;
  if (!snapshot) {
    throw new Error('The auth-env-change fixture must include a golden snapshot.');
  }
  return snapshot;
}

function snapshotForState(state: ReadinessState): ReadinessSnapshot {
  const snapshot = structuredClone(fixtureSnapshot());
  const stateCopy = {
    green: {
      confidence: 'high' as const,
      internalScore: 0,
      headline: 'No high-priority readiness concerns detected.',
      recommendedAction: 'Continue with normal review before deploying.',
    },
    yellow: {
      confidence: 'medium' as const,
      internalScore: 8,
      headline: 'Review production-sensitive changes before deploying.',
      recommendedAction: 'Review the top concerns and supporting evidence before deploying.',
    },
    red: {
      confidence: 'high' as const,
      internalScore: 13,
      headline: 'Deeper production readiness review recommended.',
      recommendedAction: 'Resolve or review critical concerns before deploying.',
    },
  }[state];

  snapshot.state = {
    ...snapshot.state,
    state,
    ...stateCopy,
  };
  return snapshot;
}

function defaultProps(
  snapshot: ReadinessSnapshot | null = fixtureSnapshot()
): ProductionReadinessPanelProps {
  return {
    snapshot,
    isLoading: false,
    error: null,
    onCopyReceipt: vi.fn(),
    onGenerateHandoff: vi.fn(),
  };
}

function deferredPromise(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

describe('ProductionReadinessPanel', () => {
  it('renders Green Yellow and Red readiness states with confidence', async () => {
    const green = snapshotForState('green');
    const yellow = snapshotForState('yellow');
    const red = snapshotForState('red');
    const { rerender } = render(ProductionReadinessPanel, {
      props: defaultProps(green),
    });

    expect(screen.getByRole('heading', { name: 'Production Readiness Snapshot' })).toBeVisible();
    expect(screen.getByLabelText('Readiness state: Green')).toBeVisible();
    expect(screen.getByText('Confidence: High')).toBeVisible();
    expect(screen.getByText(green.state.headline)).toBeVisible();
    expect(screen.getByText(green.state.recommendedAction)).toBeVisible();

    await rerender(defaultProps(yellow));
    expect(screen.getByLabelText('Readiness state: Yellow')).toBeVisible();
    expect(screen.getByText('Confidence: Medium')).toBeVisible();
    expect(screen.getByText(yellow.state.headline)).toBeVisible();

    await rerender(defaultProps(red));
    expect(screen.getByLabelText('Readiness state: Red')).toBeVisible();
    expect(screen.getByText(red.state.recommendedAction)).toBeVisible();
  });

  it('renders partial snapshots with visible limitations', () => {
    const partial = snapshotForState('yellow');
    partial.state.confidence = 'low';
    partial.limitations = [
      'GitHub comparison was unavailable, so this snapshot only inspected the exported zip.',
      'Not enough export history yet to judge whether this change is unusual.',
    ];

    render(ProductionReadinessPanel, {
      props: defaultProps(partial),
    });

    expect(screen.getByText('Confidence: Low')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Limitations' })).toBeVisible();
    for (const limitation of partial.limitations) {
      expect(screen.getByText(limitation)).toBeVisible();
    }
    expect(screen.getByText('View evidence')).toBeInTheDocument();
    expect(screen.getByText('Authentication module')).toBeInTheDocument();
  });

  it('invokes copy receipt and generate handoff actions', async () => {
    const user = userEvent.setup();
    const snapshot = snapshotForState('yellow');
    const onCopyReceipt = vi.fn().mockResolvedValue(undefined);
    const handoff = deferredPromise();
    const onGenerateHandoff = vi.fn().mockReturnValue(handoff.promise);

    const { rerender } = render(ProductionReadinessPanel, {
      props: {
        ...defaultProps(snapshot),
        onCopyReceipt,
        onGenerateHandoff,
      },
    });

    await user.click(screen.getByRole('button', { name: 'Copy receipt' }));
    expect(onCopyReceipt).toHaveBeenCalledOnce();
    expect(onCopyReceipt).toHaveBeenCalledWith(snapshot);
    expect(screen.getByRole('status')).toHaveTextContent('Receipt copied.');

    await user.click(screen.getByRole('button', { name: 'Generate ADC Fix handoff' }));
    expect(onGenerateHandoff).toHaveBeenCalledOnce();
    expect(onGenerateHandoff).toHaveBeenCalledWith(snapshot);
    expect(screen.getByRole('button', { name: 'Generating ADC Fix handoff' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    const replacement = snapshotForState('green');
    await rerender({
      ...defaultProps(replacement),
      onCopyReceipt,
      onGenerateHandoff,
    });
    handoff.resolve();
    await handoff.promise;
    await Promise.resolve();
    await waitFor(() => {
      expect(screen.queryByText('Handoff report generated.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate ADC Fix handoff' })).toBeEnabled();
    });

    const rejectedCopy = vi.fn().mockRejectedValue(new Error('sk_live_sensitive-callback-context'));
    await rerender({
      ...defaultProps(replacement),
      onCopyReceipt: rejectedCopy,
      onGenerateHandoff,
    });
    await user.click(screen.getByRole('button', { name: 'Copy receipt' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The receipt could not be copied. Try again.'
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('sk_live_sensitive-callback-context');
  });

  it('does not block existing export flow by default', () => {
    render(ProductionReadinessPanel, {
      props: defaultProps(snapshotForState('red')),
    });

    expect(
      screen.getByText('This recommendation does not block the existing export flow.')
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy receipt' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Generate ADC Fix handoff' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /push|export/i })).not.toBeInTheDocument();
  });

  it('renders loading and error states without native dialogs', async () => {
    const { rerender } = render(ProductionReadinessPanel, {
      props: {
        ...defaultProps(null),
        isLoading: true,
      },
    });

    expect(screen.getByRole('status')).toHaveTextContent('Analyzing production readiness');

    await rerender({
      ...defaultProps(null),
      error: 'The readiness scan timed out.',
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The readiness scan timed out.');

    await rerender(defaultProps(null));
    expect(screen.getByText('No readiness snapshot is available yet.')).toBeVisible();
    expect(productionReadinessPanelSource).not.toMatch(
      /window\.(alert|confirm|prompt)|\b(alert|confirm|prompt)\(/
    );
  });
});
