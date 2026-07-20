import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PublicAvailabilitySlot } from '@playwithpro/shared';
import { AvailabilityService } from './availability.service';

@ApiTags('availability')
@Controller('pros')
export class PublicAvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get(':proId/slots')
  @ApiOkResponse({
    description:
      'Open future slots of a verified coach (minimum 2-hour notice), UTC.',
  })
  async getPublicSlots(
    @Param('proId', ParseUUIDPipe) proId: string,
  ): Promise<PublicAvailabilitySlot[]> {
    return this.availability.getPublicSlots(proId);
  }
}
