import type { Analytics, ErrorReporter, FeatureFlags } from './observability';

/**
 * Selected when no PostHog token is configured (local dev, CI): every call
 * is a no-op and no request leaves the process.
 */
export class NoopObservabilityProvider
  implements Analytics, ErrorReporter, FeatureFlags
{
  track(): void {}

  captureException(): void {}

  isEnabled(
    _name: string,
    _userId: string,
    fallback = false,
  ): Promise<boolean> {
    return Promise.resolve(fallback);
  }
}
