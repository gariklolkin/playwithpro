import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Redirect,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StorageService } from '../storage/storage.service';

/** `<uuid>.<ext>` as minted by `UsersService.createAvatarUploadUrl`. */
const AVATAR_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const SIGNED_URL_TTL_SECONDS = 3600;
/** Shorter than the signature so a cached redirect never points at an expired URL. */
const CACHE_SECONDS = 1800;

/**
 * Avatars are public content (coach cards, session lists) stored in the same
 * private bucket as videos, so the API hands out the pre-signed URL through
 * a redirect instead of relying on anonymous bucket reads. No auth: the URL
 * itself is the capability, and avatar keys are unguessable UUID pairs.
 */
@ApiTags('users')
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly storage: StorageService) {}

  @Get(':userId/:file')
  @Redirect(undefined, 302)
  @Header('Cache-Control', `public, max-age=${CACHE_SECONDS}`)
  async avatar(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('file') file: string,
  ): Promise<{ url: string }> {
    if (!AVATAR_FILE.test(file)) {
      throw new NotFoundException();
    }
    const url = await this.storage.presignGet(
      `avatars/${userId}/${file}`,
      SIGNED_URL_TTL_SECONDS,
    );
    return { url };
  }
}
