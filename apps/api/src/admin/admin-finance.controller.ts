import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminAnalyticsResponse,
  AdminPaymentListResponse,
  Role,
} from '@playwithpro/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminFinanceService } from './admin-finance.service';
import { AdminPaymentsQueryDto } from './dto/admin-payments-query.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminFinanceController {
  constructor(private readonly finance: AdminFinanceService) {}

  @Get('payments')
  @ApiOkResponse({
    description:
      'Payment audit trail, newest first, filterable by status. Read-only.',
  })
  async listPayments(
    @Query() query: AdminPaymentsQueryDto,
  ): Promise<AdminPaymentListResponse> {
    return this.finance.listPayments(query);
  }

  @Get('analytics')
  @ApiOkResponse({
    description:
      'Marketplace overview: user/session/dispute counts, per-currency money totals, daily trend.',
  })
  async analytics(): Promise<AdminAnalyticsResponse> {
    return this.finance.analytics();
  }
}
