import {
  ArgumentsHost,
  Catch,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { ERROR_REPORTER, type ErrorReporter } from './observability';

/**
 * Gateway counterpart of `ObservabilityExceptionFilter`: message handlers
 * that throw anything but an expected `WsException`/`HttpException` are
 * reported, then handled by Nest's default WS behaviour.
 */
@Injectable()
@Catch()
export class ObservabilityWsExceptionFilter extends BaseWsExceptionFilter {
  constructor(@Inject(ERROR_REPORTER) private readonly errors: ErrorReporter) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (isUnexpectedWsError(exception)) {
      const pattern = host.switchToWs().getPattern?.();
      this.errors.captureException(exception, {
        route: typeof pattern === 'string' ? pattern : undefined,
        method: 'ws',
      });
    }
    super.catch(exception, host);
  }
}

/** Auth/validation failures are expected; token errors carry jsonwebtoken names. */
export function isUnexpectedWsError(exception: unknown): boolean {
  if (exception instanceof WsException) return false;
  if (exception instanceof HttpException) return false;
  if (exception instanceof Error) {
    if (
      /^(JsonWebTokenError|TokenExpiredError|NotBeforeError)$/.test(
        exception.name,
      )
    ) {
      return false;
    }
    if (/^Missing (session id|token)$/.test(exception.message)) return false;
  }
  return true;
}
