import type { PostHog } from 'posthog-node';
import { PosthogObservabilityProvider } from './posthog.provider';

describe('PosthogObservabilityProvider', () => {
  const client = {
    capture: jest.fn(),
    captureException: jest.fn(),
    isFeatureEnabled: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined),
  };
  const provider = new PosthogObservabilityProvider(
    {
      apiKey: 'phc_test',
      host: 'https://eu.i.posthog.com',
      personalApiKey: 'phx_test',
      environment: 'production',
      release: 'abc1234',
    },
    client as unknown as PostHog,
  );

  beforeEach(() => jest.clearAllMocks());

  it('tags every event with environment and release, without a person profile', () => {
    provider.track({
      event: 'session_paid',
      distinctId: 'player-1',
      properties: { amountMinor: 4005, currency: 'EUR' },
    });

    expect(client.capture).toHaveBeenCalledWith({
      distinctId: 'player-1',
      event: 'session_paid',
      properties: {
        environment: 'production',
        release: 'abc1234',
        amountMinor: 4005,
        currency: 'EUR',
        $process_person_profile: false,
      },
    });
  });

  it('reports an exception once per window with route context and count', () => {
    const error = new Error('db down');
    provider.captureException(error, {
      route: '/sessions/:id',
      method: 'GET',
      status: 500,
      userId: 'user-1',
    });
    provider.captureException(error, { route: '/sessions/:id' });

    expect(client.captureException).toHaveBeenCalledTimes(1);
    expect(client.captureException).toHaveBeenCalledWith(
      error,
      'user-1',
      expect.objectContaining({
        environment: 'production',
        release: 'abc1234',
        route: '/sessions/:id',
        method: 'GET',
        status: 500,
        occurrences: 1,
      }),
    );
  });

  it('evaluates flags locally and falls back to the default on failure', async () => {
    client.isFeatureEnabled.mockResolvedValueOnce(true);
    await expect(provider.isEnabled('kill-switch', 'user-1')).resolves.toBe(
      true,
    );
    expect(client.isFeatureEnabled).toHaveBeenCalledWith(
      'kill-switch',
      'user-1',
      { onlyEvaluateLocally: true, disableGeoip: true },
    );

    client.isFeatureEnabled.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      provider.isEnabled('kill-switch', 'user-1', true),
    ).resolves.toBe(true);

    client.isFeatureEnabled.mockResolvedValueOnce(undefined);
    await expect(provider.isEnabled('kill-switch', 'user-1')).resolves.toBe(
      false,
    );
  });

  it('drains the queue on application shutdown', async () => {
    await provider.onApplicationShutdown();
    expect(client.shutdown).toHaveBeenCalledWith(2_000);
  });
});
