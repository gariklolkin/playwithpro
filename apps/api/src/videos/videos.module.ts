import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { UnattachedVideosService } from './unattached-videos.service';
import { VideoProcessingService } from './video-processing.service';
import { VideoRetentionService } from './video-retention.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [VideosController],
  providers: [
    VideosService,
    VideoProcessingService,
    VideoRetentionService,
    UnattachedVideosService,
  ],
  exports: [UnattachedVideosService],
})
export class VideosModule {}
