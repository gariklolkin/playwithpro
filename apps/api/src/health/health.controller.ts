import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

interface HealthReport {
  status: 'ok' | 'error';
  database: 'ok' | 'error';
  timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: 'App and database are healthy.' })
  @ApiServiceUnavailableResponse({ description: 'Database is unreachable.' })
  async check(): Promise<HealthReport> {
    const databaseHealthy = await this.prisma.isHealthy();

    const report: HealthReport = {
      status: databaseHealthy ? 'ok' : 'error',
      database: databaseHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };

    if (!databaseHealthy) {
      throw new ServiceUnavailableException(report);
    }

    return report;
  }
}
