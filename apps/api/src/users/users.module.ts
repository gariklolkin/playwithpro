import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AvailabilityModule } from '../availability/availability.module';
import { StorageModule } from '../storage/storage.module';
import { AvatarsController } from './avatars.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, AvailabilityModule, StorageModule],
  controllers: [UsersController, AvatarsController],
  providers: [UsersService],
})
export class UsersModule {}
