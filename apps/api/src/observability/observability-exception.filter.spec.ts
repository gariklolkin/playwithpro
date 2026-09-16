import {
  ArgumentsHost,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import {
  ObservabilityExceptionFilter,
  shouldReport,
} from './observability-exception.filter';

describe('ObservabilityExceptionFilter', () => {
  const errors = { captureException: jest.fn() };
  const reply = jest.fn();
  const adapterHost = {
    httpAdapter: {
      reply,
      isHeadersSent: () => false,
      end: jest.fn(),
    },
  };
  const filter = new ObservabilityExceptionFilter(
    errors,
    adapterHost as unknown as HttpAdapterHost,
  );

  function hostFor(request: object): ArgumentsHost {
    const response = {};
    return {
      getType: () => 'http',
      getArgByIndex: (index: number) => (index === 0 ? request : response),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
        getNext: () => undefined,
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => jest.clearAllMocks());

  it('reports an unexpected exception with route, method, status and user', () => {
    const error = new Error('prisma exploded');
    filter.catch(
      error,
      hostFor({
        method: 'POST',
        path: '/sessions/abc/pay',
        route: { path: '/sessions/:id/pay' },
        user: { id: 'user-1', role: 'amateur' },
      }),
    );

    expect(errors.captureException).toHaveBeenCalledWith(error, {
      route: '/sessions/:id/pay',
      method: 'POST',
      status: 500,
      userId: 'user-1',
    });
    // Nest's default handling still answers the request.
    expect(reply).toHaveBeenCalled();
  });

  it('reports a 5xx HttpException but not an expected 4xx', () => {
    filter.catch(
      new BadRequestException(),
      hostFor({ method: 'GET', path: '/x' }),
    );
    expect(errors.captureException).not.toHaveBeenCalled();

    filter.catch(
      new InternalServerErrorException(),
      hostFor({ method: 'GET', path: '/x' }),
    );
    expect(errors.captureException).toHaveBeenCalledTimes(1);
  });

  it('classifies exceptions by status', () => {
    expect(shouldReport(new BadRequestException())).toBe(false);
    expect(shouldReport(new InternalServerErrorException())).toBe(true);
    expect(shouldReport(new TypeError('x'))).toBe(true);
  });
});
