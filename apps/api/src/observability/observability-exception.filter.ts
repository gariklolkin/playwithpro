import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { ERROR_REPORTER, type ErrorReporter } from './observability';

/**
 * Global HTTP filter: reports unexpected exceptions (anything that is not an
 * `HttpException`) and 5xx responses, never expected 4xx ones, with the
 * route, method, status and acting user id — no body, no headers. Then it
 * delegates to Nest's default handling, so responses are unchanged.
 */
@Injectable()
@Catch()
export class ObservabilityExceptionFilter extends BaseExceptionFilter {
  constructor(
    @Inject(ERROR_REPORTER) private readonly errors: ErrorReporter,
    adapterHost: HttpAdapterHost,
  ) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'http' && shouldReport(exception)) {
      const request = host.getArgByIndex<
        Request & { user?: AuthenticatedUser }
      >(0);
      this.errors.captureException(exception, {
        route: routeOf(request),
        method: request?.method,
        status: statusOf(exception),
        userId: request?.user?.id,
      });
    }
    super.catch(exception, host);
  }
}

export function shouldReport(exception: unknown): boolean {
  return !(exception instanceof HttpException) || statusOf(exception) >= 500;
}

export function statusOf(exception: unknown): number {
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

/** The matched route pattern when Express has one, else the bare path. */
function routeOf(request: Request | undefined): string | undefined {
  if (!request) return undefined;
  const pattern = (request as { route?: { path?: string } }).route?.path;
  return pattern ?? request.path;
}
