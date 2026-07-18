import {
  BadRequestException,
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
// Deliberately vague: must not reveal whether the email is registered.
const REGISTRATION_FAILED =
  'Registration failed. Check the details and try again.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException(REGISTRATION_FAILED);
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
      include: { oauthAccounts: true },
    });

    await this.sendVerificationEmail(user.id, user.email);
    return this.signIn(user);
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
    if (!user) {
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

  async verifyEmail(token: string): Promise<void> {
    const { userId } = await this.tokens.consumeVerificationToken(
      token,
      'email_verify',
    );
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
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
    const token = await this.tokens.createVerificationToken(
      userId,
      'email_verify',
    );
    await this.mailer.sendVerificationEmail(
      email,
      `${this.webAppUrl()}/verify-email?token=${token}`,
    );
  }

  private webAppUrl(): string {
    return this.config.get<string>('WEB_APP_URL') ?? 'http://localhost:3000';
  }
}
