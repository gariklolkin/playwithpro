import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ACCESS_TOKEN_COOKIE, AuthenticatedUser } from '../auth-cookies';
import { TokenService } from '../token.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = this.tokens.verifyAccessToken(token);
      request.user = { id: payload.sub, role: payload.role };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private extractToken(request: Request): string | undefined {
    const cookies = request.cookies as
      Record<string, string | undefined> | undefined;
    const fromCookie = cookies?.[ACCESS_TOKEN_COOKIE];
    if (fromCookie) {
      return fromCookie;
    }
    // Bearer fallback for non-browser API clients.
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
