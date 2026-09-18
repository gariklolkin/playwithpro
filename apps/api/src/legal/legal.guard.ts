import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { LegalService } from './legal.service';

/**
 * The re-acceptance gate for commitment actions (booking, paying,
 * submitting for verification, publishing availability). Runs after the
 * auth guard; answers 409 `legal_reacceptance_required` with the documents.
 * Reads, the room, confirmation, disputes, reviews and cancellations never
 * carry it — a terms update must not trap money or attendance.
 */
@Injectable()
export class LegalGuard implements CanActivate {
  constructor(private readonly legal: LegalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    if (request.user) {
      await this.legal.assertAccepted(request.user.id);
    }
    return true;
  }
}
