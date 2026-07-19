import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MeResponse } from '@playwithpro/shared';
import * as argon2 from 'argon2';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  toMeResponse,
  toPrismaRole,
  toSharedRole,
  UserWithOAuth,
} from '../users/user.mapper';
import { AuthTokens } from './auth-cookies';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';

export interface AuthResult {
  user: MeResponse;
  tokens: AuthTokens;
}

const INVALID_CREDENTIALS = 'Invalid email or password.';
// Matches the OAuth conflict message; we accept revealing that the email is
// taken (the OAuth flow already does) in exchange for a clear signup error.
const EMAIL_TAKEN =
  'An account with this email already exists. Log in instead.';
const EMAIL_NOT_VERIFIED =
  'Confirm your email address to sign in — check your inbox for the link.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /** Creates the account and sends the confirmation link — no session yet:
   *  the account becomes usable only after the email is verified. */
  async register(dto: RegisterDto): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(EMAIL_TAKEN);
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: toPrismaRole(dto.role),
        displayName: dto.displayName,
        ...(dto.timezone ? { timezone: dto.timezone } : {}),
      },
    });

    await this.sendVerificationEmail(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { oauthAccounts: true },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!user.emailVerifiedAt) {
      // Correct password, unconfirmed address: 403 so the UI can offer resend.
      throw new ForbiddenException(EMAIL_NOT_VERIFIED);
    }
    return this.signIn(user);
  }

  async refresh(rawRefreshToken: string | undefined): Promise<AuthResult> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException();
    }
    const { userId, token } =
      await this.tokens.rotateRefreshToken(rawRefreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { oauthAccounts: true },
    });
    // Unverified accounts cannot keep a session alive: any lingering
    // pre-verification session dies at the next rotation.
    if (!user || !user.emailVerifiedAt) {
      throw new UnauthorizedException();
    }
    return {
      user: toMeResponse(user),
      tokens: {
        accessToken: this.tokens.signAccessToken(
          user.id,
          toSharedRole(user.role),
        ),
        refreshToken: token,
      },
    };
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    if (rawRefreshToken) {
      await this.tokens.revokeRefreshToken(rawRefreshToken);
    }
  }

  /** Confirms the address and signs the user in — possessing the emailed
   *  token proves ownership of the mailbox. */
  async verifyEmail(email: string, code: string): Promise<AuthResult> {
    const account = await this.prisma.user.findUnique({ where: { email } });
    // Same error as a wrong code — no account enumeration.
    if (!account || account.emailVerifiedAt) {
      throw new BadRequestException('This code is invalid or has expired.');
    }
    await this.tokens.consumeEmailCode(account.id, code);
    const user = await this.prisma.user.update({
      where: { id: account.id },
      data: { emailVerifiedAt: new Date() },
      include: { oauthAccounts: true },
    });
    return this.signIn(user);
  }

  /** Always resolves — no user enumeration. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && user.emailVerifiedAt === null) {
      await this.sendVerificationEmail(user.id, user.email);
    }
  }

  /** Always resolves — no user enumeration. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = await this.tokens.createVerificationToken(
        user.id,
        'password_reset',
      );
      await this.mailer.sendPasswordResetEmail(
        user.email,
        `${this.webAppUrl()}/reset-password?token=${token}`,
      );
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const { userId } = await this.tokens.consumeVerificationToken(
      token,
      'password_reset',
    );
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
    await this.tokens.revokeAllRefreshTokens(userId);
  }

  async signIn(user: UserWithOAuth): Promise<AuthResult> {
    return {
      user: toMeResponse(user),
      tokens: {
        accessToken: this.tokens.signAccessToken(
          user.id,
          toSharedRole(user.role),
        ),
        refreshToken: await this.tokens.issueRefreshToken(user.id),
      },
    };
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
  ): Promise<void> {
    const code = await this.tokens.createEmailCode(userId);
    await this.mailer.sendVerificationEmail(email, code);
  }

  private webAppUrl(): string {
    return this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
  }
}
