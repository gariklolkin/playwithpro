import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}
