import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { JitsiVideoProvider } from './jitsi-video.provider';
import { PlaybackSyncGateway } from './playback-sync.gateway';
import { SessionRoomsController } from './session-rooms.controller';
import { SessionRoomsService } from './session-rooms.service';
import { VIDEO_PROVIDER } from './video-provider';

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [SessionRoomsController],
  providers: [
    SessionRoomsService,
    PlaybackSyncGateway,
    { provide: VIDEO_PROVIDER, useClass: JitsiVideoProvider },
  ],
})
export class SessionRoomsModule {}
