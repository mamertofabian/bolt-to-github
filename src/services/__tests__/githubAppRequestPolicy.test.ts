import { describe, expect, it, vi } from 'vitest';
import { SingleFlight } from '../githubAppRequestPolicy';

describe('GitHub App request policy', () => {
  it('shares one operation across one hundred concurrent callers', async () => {
    const singleFlight = new SingleFlight<string>();
    let resolveOperation: ((value: string) => void) | undefined;
    const operation = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveOperation = resolve;
        })
    );

    const requests = Array.from({ length: 100 }, () => singleFlight.run(operation));

    expect(operation).toHaveBeenCalledTimes(1);
    resolveOperation?.('shared-token');
    await expect(Promise.all(requests)).resolves.toEqual(Array(100).fill('shared-token'));
  });

  it('resets after a shared rejection so a later request can retry', async () => {
    const singleFlight = new SingleFlight<string>();
    const operation = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce('recovered-token');

    const failures = Array.from({ length: 10 }, () => singleFlight.run(operation));

    const results = await Promise.allSettled(failures);
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(operation).toHaveBeenCalledTimes(1);
    await expect(singleFlight.run(operation)).resolves.toBe('recovered-token');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
