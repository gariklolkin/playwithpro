import { ForbiddenException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { isUnexpectedWsError } from './observability-ws-exception.filter';

describe('isUnexpectedWsError', () => {
  it('ignores expected auth and validation failures', () => {
    expect(isUnexpectedWsError(new WsException('nope'))).toBe(false);
    expect(isUnexpectedWsError(new ForbiddenException())).toBe(false);
    expect(isUnexpectedWsError(new Error('Missing token'))).toBe(false);
    expect(isUnexpectedWsError(new Error('Missing session id'))).toBe(false);
    const expired = new Error('jwt expired');
    expired.name = 'TokenExpiredError';
    expect(isUnexpectedWsError(expired)).toBe(false);
  });

  it('reports everything else', () => {
    expect(isUnexpectedWsError(new Error('connection reset'))).toBe(true);
    expect(
      isUnexpectedWsError(new TypeError('undefined is not a function')),
    ).toBe(true);
    expect(isUnexpectedWsError('string throw')).toBe(true);
  });
});
