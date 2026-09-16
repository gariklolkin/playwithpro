import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { NoopObservabilityProvider } from './noop.provider';
import { ANALYTICS, ERROR_REPORTER, FEATURE_FLAGS } from './observability';
import { ObservabilityExceptionFilter } from './observability-exception.filter';
import { ObservabilityWsExceptionFilter } from './observability-ws-exception.filter';
import { PosthogObservabilityProvider } from './posthog.provider';

/** The one concrete instance behind the three ports (shutdown hook runs once). */
export const OBSERVABILITY_PROVIDER = Symbol('OBSERVABILITY_PROVIDER');

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim() !== '' ? value : undefined;
}

/**
 * Global like `PrismaModule`: `ANALYTICS`, `ERROR_REPORTER` and
 * `FEATURE_FLAGS` are injectable everywhere. Selection is by configuration —
 * without `POSTHOG_API_KEY` the no-op provider is used and nothing leaves
 * the process (local dev, CI).
 */
@Global()
@Module({
  providers: [
    {
      provide: OBSERVABILITY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const apiKey = nonEmpty(config.get<string>('POSTHOG_API_KEY'));
        if (!apiKey) {
          return new NoopObservabilityProvider();
        }
        return new PosthogObservabilityProvider({
          apiKey,
          host: config.getOrThrow<string>('POSTHOG_HOST'),
          personalApiKey: nonEmpty(
            config.get<string>('POSTHOG_PERSONAL_API_KEY'),
          ),
          environment: config.getOrThrow<string>('NODE_ENV'),
          release: config.getOrThrow<string>('APP_RELEASE'),
        });
      },
    },
    { provide: ANALYTICS, useExisting: OBSERVABILITY_PROVIDER },
    { provide: ERROR_REPORTER, useExisting: OBSERVABILITY_PROVIDER },
    { provide: FEATURE_FLAGS, useExisting: OBSERVABILITY_PROVIDER },
    { provide: APP_FILTER, useClass: ObservabilityExceptionFilter },
    ObservabilityWsExceptionFilter,
  ],
  exports: [
    ANALYTICS,
    ERROR_REPORTER,
    FEATURE_FLAGS,
    ObservabilityWsExceptionFilter,
  ],
})
export class ObservabilityModule {}
