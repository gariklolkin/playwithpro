import { NoopObservabilityProvider } from './noop.provider';
import type { Analytics, ErrorReporter, FeatureFlags } from './observability';

describe('NoopObservabilityProvider', () => {
  it('makes no network call and returns flag defaults', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('network must not be touched'));
    const provider: Analytics & ErrorReporter & FeatureFlags =
      new NoopObservabilityProvider();

    provider.track({ event: 'session_paid', distinctId: 'u1' });
    provider.captureException(new Error('boom'), { route: '/x' });

    await expect(provider.isEnabled('flag', 'u1')).resolves.toBe(false);
    await expect(provider.isEnabled('flag', 'u1', true)).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
