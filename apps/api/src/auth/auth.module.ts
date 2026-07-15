import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MailerModule } from '../mailer/mailer.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ACCESS_TOKEN_TTL_MS, TokenService } from './token.service';

@Module({
  imports: [
    MailerModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: `${ACCESS_TOKEN_TTL_MS / 1000}s` },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtAuthGuard, RolesGuard],
  exports: [TokenService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
