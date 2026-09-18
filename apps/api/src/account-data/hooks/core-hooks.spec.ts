/* eslint-disable @typescript-eslint/no-unsafe-member-access
   -- jest mock call records are untyped; assertions narrow where it matters. */
import type { ConfigService } from '@nestjs/config';
import { ObservabilityErasureHook, ProProfileErasureHook } from './core-hooks';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('ObservabilityErasureHook', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('is skipped with the reason when no personal key is configured', async () => {
    const hook = new ObservabilityErasureHook(
      config({
        POSTHOG_API_KEY: 'phc_x',
        POSTHOG_HOST: 'https://eu.i.posthog.com',
      }),
    );
    await expect(hook.erase('u1')).resolves.toEqual({
      status: 'skipped',
      reason: 'no PostHog personal API key / project id',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deletes every person of the distinct id on the app host', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ id: 'p1' }] }),
      })
      .mockResolvedValueOnce({ ok: true, status: 204 });
    const hook = new ObservabilityErasureHook(
      config({
        POSTHOG_API_KEY: 'phc_x',
        POSTHOG_PERSONAL_API_KEY: 'phx_y',
        POSTHOG_PROJECT_ID: '42',
        POSTHOG_HOST: 'https://eu.i.posthog.com',
      }),
    );
    await expect(hook.erase('u1')).resolves.toEqual({ status: 'done' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://eu.posthog.com/api/projects/42/persons/?distinct_id=u1',
    );
    expect(fetchMock.mock.calls[1]).toEqual([
      'https://eu.posthog.com/api/projects/42/persons/p1/?delete_events=true',
      expect.objectContaining({ method: 'DELETE' }),
    ]);
  });

  it('throws on an API failure so the step is recorded as failed', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const hook = new ObservabilityErasureHook(
      config({
        POSTHOG_API_KEY: 'phc_x',
        POSTHOG_PERSONAL_API_KEY: 'phx_y',
        POSTHOG_PROJECT_ID: '42',
        POSTHOG_HOST: 'https://eu.i.posthog.com',
      }),
    );
    await expect(hook.erase('u1')).rejects.toThrow(
      'PostHog persons lookup 500',
    );
  });
});

describe('ProProfileErasureHook', () => {
  it('is skipped for accounts without a coach profile', async () => {
    const prisma = {
      proProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const hook = new ProProfileErasureHook(prisma as never);
    await expect(hook.erase('u1')).resolves.toEqual({
      status: 'skipped',
      reason: 'no coach profile',
    });
  });
});
