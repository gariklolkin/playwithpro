import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BookingsModule } from '../bookings/bookings.module';
import { AttendanceEvidenceService } from './attendance-evidence.service';
import { LiveKitVideoProvider } from './livekit-video.provider';
import { LiveKitWebhookController } from './livekit-webhook.controller';
import { PlaybackSyncGateway } from './playback-sync.gateway';
import { SessionRoomsController } from './session-rooms.controller';
import { SessionRoomsService } from './session-rooms.service';
import { VIDEO_PROVIDER } from './video-provider';

@Module({
  imports: [AuthModule, BookingsModule],
  controllers: [SessionRoomsController, LiveKitWebhookController],
  providers: [
    SessionRoomsService,
    AttendanceEvidenceService,
    PlaybackSyncGateway,
    { provide: VIDEO_PROVIDER, useClass: LiveKitVideoProvider },
  ],
})
export class SessionRoomsModule {}
