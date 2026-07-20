import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { VideoProcessingService } from './video-processing.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [VideosController],
  providers: [VideosService, VideoProcessingService],
})
export class VideosModule {}
