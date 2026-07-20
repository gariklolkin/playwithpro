import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  CreateVideoUploadResponse,
  Role,
  SignVideoPartsResponse,
  VideoListResponse,
  VideoResponse,
  VideoUrlResponse,
} from '@playwithpro/shared';
import type { AuthenticatedUser } from '../auth/auth-cookies';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompleteVideoUploadDto } from './dto/complete-video-upload.dto';
import { CreateVideoUploadDto } from './dto/create-video-upload.dto';
import { RenameVideoDto } from './dto/rename-video.dto';
import { SignVideoPartsDto } from './dto/sign-video-parts.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Amateur)
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Multipart upload initiated.' })
  async createUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVideoUploadDto,
  ): Promise<CreateVideoUploadResponse> {
    return this.videos.createUpload(user.id, dto);
  }

  @Post(':id/parts')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Pre-signed PUT URLs for the given parts.' })
  async signParts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignVideoPartsDto,
  ): Promise<SignVideoPartsResponse> {
    return this.videos.signParts(user.id, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'Upload finalized; processing started.' })
  async completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteVideoUploadDto,
  ): Promise<VideoResponse> {
    return this.videos.completeUpload(user.id, id, dto);
  }

  @Get()
  @ApiOkResponse({ description: 'Own video library, newest first.' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VideoListResponse> {
    return this.videos.list(user.id);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Video detail with status and metadata.' })
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoResponse> {
    return this.videos.get(user.id, id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Video renamed.' })
  async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameVideoDto,
  ): Promise<VideoResponse> {
    return this.videos.rename(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOkResponse({ description: 'Video (or in-flight upload) deleted.' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.videos.delete(user.id, id);
  }

  @Get(':id/playback-url')
  @ApiOkResponse({ description: 'Short-lived streaming URL (Range-capable).' })
  async playbackUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoUrlResponse> {
    return this.videos.playbackUrl(user.id, id);
  }

  @Get(':id/download-url')
  @ApiOkResponse({ description: 'Short-lived download URL for the original.' })
  async downloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VideoUrlResponse> {
    return this.videos.downloadUrl(user.id, id);
  }
}
