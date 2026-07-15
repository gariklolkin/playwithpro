import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Role } from '@playwithpro/shared';
import { TokenService } from '../token.service';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const tokens = { verifyAccessToken: jest.fn() };
  const guard = new JwtAuthGuard(tokens as unknown as TokenService);

  beforeEach(() => jest.clearAllMocks());

  it('attaches the user for a valid cookie token', () => {
    tokens.verifyAccessToken.mockReturnValue({
      sub: 'user-1',
      role: Role.Amateur,
    });
    const request: Record<string, unknown> = {
      cookies: { access_token: 'jwt' },
      headers: {},
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.user).toEqual({ id: 'user-1', role: Role.Amateur });
  });

  it('accepts a Bearer header when no cookie is present', () => {
    tokens.verifyAccessToken.mockReturnValue({
      sub: 'user-2',
      role: Role.Admin,
    });
    const request: Record<string, unknown> = {
      cookies: {},
      headers: { authorization: 'Bearer jwt' },
    };

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(tokens.verifyAccessToken).toHaveBeenCalledWith('jwt');
  });

  it('rejects when no token is provided', () => {
    const request = { cookies: {}, headers: {} };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an invalid token', () => {
    tokens.verifyAccessToken.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const request = { cookies: { access_token: 'tampered' }, headers: {} };

    expect(() => guard.canActivate(contextFor(request))).toThrow(
      UnauthorizedException,
    );
  });
});
