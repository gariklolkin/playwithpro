import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@playwithpro/shared';
import { AuthenticatedUser } from '../auth-cookies';
import { RolesGuard } from './roles.guard';

function contextFor(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  beforeEach(() => jest.clearAllMocks());

  it('allows requests when no roles are required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextFor())).toBe(true);
  });

  it('allows a user with a required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.Admin]);

    expect(guard.canActivate(contextFor({ id: 'u1', role: Role.Admin }))).toBe(
      true,
    );
  });

  it('rejects a user without the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.Admin]);

    expect(() =>
      guard.canActivate(contextFor({ id: 'u1', role: Role.Amateur })),
    ).toThrow(ForbiddenException);
  });

  it('rejects when no user is attached', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.Amateur]);

    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });
});
