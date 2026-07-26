import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { validate } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { MailerModule } from './mailer/mailer.module';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './admin/admin.module';
import { AvailabilityModule } from './availability/availability.module';
import { BookingsModule } from './bookings/bookings.module';
import { CatalogModule } from './catalog/catalog.module';
import { DisputesModule } from './disputes/disputes.module';
import { PlayersModule } from './players/players.module';
import { ProsModule } from './pros/pros.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SessionRoomsModule } from './session-rooms/session-rooms.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { VideosModule } from './videos/videos.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    // Generous global ceiling; auth endpoints carry stricter @Throttle limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    MailerModule,
    AuthModule,
    UsersModule,
    PlayersModule,
    ProsModule,
    AvailabilityModule,
    BookingsModule,
    CatalogModule,
    DisputesModule,
    ReviewsModule,
    AdminModule,
    SchedulingModule,
    SessionRoomsModule,
    StorageModule,
    VideosModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
