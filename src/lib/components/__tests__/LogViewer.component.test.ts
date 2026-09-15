/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import LogViewer from '../LogViewer.svelte';

vi.unmock('$lib/components/ui/dialog/ConfirmationDialog.svelte');
vi.unmock('$lib/components/ui/button');
vi.unmock('$lib/components/ui/button/index.ts');
vi.unmock('$lib/components/ui/button/button.svelte');
vi.unmock('$lib/components/ui/input');
vi.unmock('$lib/components/ui/input/index.ts');
vi.unmock('$lib/components/ui/input/input.svelte');
vi.unmock('lucide-svelte');
vi.unmock('bits-ui');

const mocks = vi.hoisted(() => ({
  clearLogs: vi.fn(),
  clearLogsEmergency: vi.fn(),
  getAllLogs: vi.fn(),
}));

vi.mock('$lib/utils/logger', () => ({
  clearLogs: mocks.clearLogs,
  getLogStorage: () => ({ getAllLogs: mocks.getAllLogs }),
}));

vi.mock('$lib/utils/logStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/utils/logStorage')>();
  return { ...actual, clearLogsEmergency: mocks.clearLogsEmergency };
});

describe('LogViewer destructive confirmations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clearLogs.mockResolvedValue(undefined);
    mocks.clearLogsEmergency.mockResolvedValue(undefined);
    mocks.getAllLogs.mockResolvedValue([]);
  });

  it('canceling the clear logs dialog leaves logs intact', async () => {
    const user = userEvent.setup();
    render(LogViewer);

    const trigger = screen.getByRole('button', { name: 'Clear All Logs' });
    await user.click(trigger);
    expect(screen.getByText('Clear stored logs?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.clearLogs).not.toHaveBeenCalled();
    expect(mocks.getAllLogs).not.toHaveBeenCalled();
    expect(screen.getByText('No logs found')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('confirming clear logs clears logs and reloads visible entries', async () => {
    const user = userEvent.setup();
    render(LogViewer);

    const trigger = screen.getByRole('button', { name: 'Clear All Logs' });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Clear logs' }));

    await waitFor(() => expect(mocks.clearLogs).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('No logs found')).toBeInTheDocument();
    expect(mocks.getAllLogs).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('confirming emergency clear shows loading and clears emergency logs', async () => {
    const user = userEvent.setup();
    let resolveEmergency!: () => void;
    mocks.clearLogsEmergency.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveEmergency = resolve;
      })
    );
    render(LogViewer);

    await user.click(screen.getByRole('button', { name: 'Clear All Logs (Emergency)' }));
    expect(screen.getByText('Emergency log clear?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear everything' }));

    const loadingButton = await screen.findByRole('button', { name: 'Clearing...' });
    expect(loadingButton).toBeDisabled();
    expect(mocks.clearLogsEmergency).toHaveBeenCalledTimes(1);

    resolveEmergency();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Clear All Logs (Emergency)' })).toBeEnabled()
    );
    expect(mocks.getAllLogs).toHaveBeenCalledTimes(1);
  });

  it('keyboard confirmation is modal and executes clear once', async () => {
    const user = userEvent.setup();
    render(LogViewer);

    const trigger = screen.getByRole('button', { name: 'Clear All Logs' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Clear stored logs?' });
    const cancel = screen.getByRole('button', { name: 'Cancel' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(cancel).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(mocks.clearLogs).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Clear stored logs?' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    const reopenedConfirm = screen.getByRole('button', { name: 'Clear logs' });
    reopenedConfirm.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mocks.clearLogs).toHaveBeenCalledTimes(1));
    expect(mocks.getAllLogs).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });
});
