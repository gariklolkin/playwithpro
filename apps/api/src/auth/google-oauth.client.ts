import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleProfile {
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
}

interface GoogleTokenResponse {
  id_token?: string;
}

interface GoogleIdTokenPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

/** Direct authorization-code flow against Google (scopes: openid email profile). */
@Injectable()
export class GoogleOAuthClient {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('GOOGLE_CLIENT_ID') &&
      this.config.get<string>('GOOGLE_CLIENT_SECRET'),
    );
  }

  buildAuthUrl(state: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID') ?? '',
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleProfile> {
    this.assertConfigured();
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.get<string>('GOOGLE_CLIENT_ID') ?? '',
        client_secret: this.config.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!response.ok) {
      throw new UnauthorizedException();
    }

    const tokens = (await response.json()) as GoogleTokenResponse;
    if (!tokens.id_token) {
      throw new UnauthorizedException();
    }

    // The id_token comes straight from Google over TLS, so decoding the
    // payload without signature verification is safe here.
    const payload = this.decodeIdToken(tokens.id_token);
    if (!payload.email) {
      throw new UnauthorizedException();
    }
    return {
      providerAccountId: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      displayName: payload.name ?? payload.email.split('@')[0],
    };
  }

  private decodeIdToken(idToken: string): GoogleIdTokenPayload {
    try {
      const payload = idToken.split('.')[1];
      return JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as GoogleIdTokenPayload;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private redirectUri(): string {
    const apiUrl =
      this.config.get<string>('API_URL') ?? 'http://localhost:4000';
    return `${apiUrl}/auth/google/callback`;
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured.',
      );
    }
  }
}
