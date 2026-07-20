import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CatalogResponse, PublicProProfileResponse } from '@playwithpro/shared';
import { CatalogService } from './catalog.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';

@ApiTags('catalog')
@Controller('pros')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOkResponse({
    description:
      'Verified coaches with active services; filterable by language, service, and max price.',
  })
  async list(@Query() query: CatalogQueryDto): Promise<CatalogResponse> {
    return this.catalog.list(query);
  }

  @Get(':proId/profile')
  @ApiOkResponse({ description: 'Public profile of a verified coach.' })
  async getProfile(
    @Param('proId', ParseUUIDPipe) proId: string,
  ): Promise<PublicProProfileResponse> {
    return this.catalog.getPublicProfile(proId);
  }
}
