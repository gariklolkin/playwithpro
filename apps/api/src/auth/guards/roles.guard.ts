import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@playwithpro/shared';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth-cookies';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
