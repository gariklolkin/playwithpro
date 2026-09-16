import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { ErrorDeduper } from './error-dedupe';
import type {
  Analytics,
  ErrorContext,
  ErrorReporter,
  FeatureFlags,
  TrackInput,
} from './observability';

export interface PosthogProviderOptions {
  apiKey: string;
  host: string;
  /** Personal or project-secret key; enables local flag evaluation. */
  personalApiKey?: string;
  environment: string;
  /** Deploy SHA (image tag); `unknown` outside a production build. */
  release: string;
}

/** Local flag definitions are refreshed this often (design decision 8). */
const FLAG_POLL_MS = 30_000;
/** A flag lookup that cannot resolve locally must not stall a request. */
const FLAG_TIMEOUT_MS = 300;

/**
 * Single `posthog-node` client behind all three ports. Every event carries
 * `environment` and `release`; exceptions are deduplicated per process;
 * flags are evaluated locally with a 30 s poll. Flushed on shutdown.
 */
export class PosthogObservabilityProvider
  implements Analytics, ErrorReporter, FeatureFlags, OnApplicationShutdown
{
  private readonly logger = new Logger(PosthogObservabilityProvider.name);
  private readonly deduper = new ErrorDeduper();
  private readonly client: PostHog;
  private readonly baseProperties: Record<string, string>;

  constructor(
    private readonly options: PosthogProviderOptions,
    client?: PostHog,
  ) {
    this.baseProperties = {
      environment: options.environment,
      release: options.release,
    };
    this.client =
      client ??
      new PostHog(options.apiKey, {
        host: options.host,
        personalApiKey: options.personalApiKey,
        featureFlagsPollingInterval: FLAG_POLL_MS,
        featureFlagsRequestTimeoutMs: FLAG_TIMEOUT_MS,
        // The API instance is a server, not a browser: never geo-locate it.
        disableGeoip: true,
      });
  }

  track(input: TrackInput): void {
    try {
      this.client.capture({
        distinctId: input.distinctId,
        event: input.event,
        properties: {
          ...this.baseProperties,
          ...input.properties,
          // Server-side lifecycle events never create a person profile: a
          // user who declined browser capture stays profile-less.
          $process_person_profile: false,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Analytics capture failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  captureException(error: unknown, context: ErrorContext = {}): void {
    const decision = this.deduper.decide(error);
    if (!decision.report) return;
    try {
      const { userId, ...tags } = context;
      this.client.captureException(error, userId, {
        ...this.baseProperties,
        ...tags,
        fingerprint: decision.fingerprint,
        occurrences: decision.count,
        $process_person_profile: false,
      });
    } catch (reportError) {
      this.logger.warn(
        `Error report failed: ${reportError instanceof Error ? reportError.message : String(reportError)}`,
      );
    }
  }

  async isEnabled(
    name: string,
    userId: string,
    fallback = false,
  ): Promise<boolean> {
    try {
      const value = await this.client.isFeatureEnabled(name, userId, {
        // Local evaluation only when a personal key is present; otherwise
        // the SDK falls back to one remote call bounded by the timeout.
        onlyEvaluateLocally: Boolean(this.options.personalApiKey),
        disableGeoip: true,
      });
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  onApplicationShutdown(): Promise<void> {
    return this.shutdown();
  }

  /** Drains the event queue so a rolling restart loses nothing. */
  async shutdown(): Promise<void> {
    try {
      await this.client.shutdown(2_000);
    } catch (error) {
      this.logger.warn(
        `PostHog shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
