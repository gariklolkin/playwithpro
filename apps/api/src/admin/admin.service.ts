import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminVerificationItem } from '@playwithpro/shared';
import {
  ProProfileStatus,
  VerificationStatus as PrismaVerificationStatus,
} from '@prisma/client';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import { toProfileResponse } from '../pros/pro-profile.mapper';

const QUEUE_INCLUDE = {
  profile: {
    include: {
      services: { orderBy: { type: 'asc' } },
      verificationRequests: { orderBy: { createdAt: 'desc' }, take: 1 },
      user: true,
    },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  async listPending(): Promise<AdminVerificationItem[]> {
    const requests = await this.prisma.verificationRequest.findMany({
      where: { status: PrismaVerificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      include: QUEUE_INCLUDE,
    });
    return requests.map((request) => ({
      requestId: request.id,
      submittedAt: request.createdAt.toISOString(),
      credentials: request.credentials,
      contact: request.contact,
      callRequestedAt: request.callRequestedAt?.toISOString() ?? null,
      profile: toProfileResponse(request.profile),
      user: {
        id: request.profile.user.id,
        email: request.profile.user.email,
        displayName: request.profile.user.displayName,
      },
    }));
  }

  /** Marks the request and emails the coach that a video call is coming. */
  async requestCall(requestId: string): Promise<void> {
    const request = await this.pendingRequest(requestId);
    await this.prisma.verificationRequest.update({
      where: { id: request.id },
      data: { callRequestedAt: new Date() },
    });
    await this.mailer.sendVerificationCallEmail(
      request.profile.user.email,
      request.profile.user.displayName,
      request.contact,
    );
  }

  async approve(requestId: string, reviewerId: string): Promise<void> {
    const request = await this.pendingRequest(requestId);
    await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id: request.id },
        data: {
          status: PrismaVerificationStatus.APPROVED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.proProfile.update({
        where: { id: request.profileId },
        data: { status: ProProfileStatus.VERIFIED },
      }),
    ]);
    await this.mailer.sendVerificationApprovedEmail(
      request.profile.user.email,
      request.profile.user.displayName,
    );
  }

  async reject(
    requestId: string,
    reviewerId: string,
    note: string,
  ): Promise<void> {
    const request = await this.pendingRequest(requestId);
    await this.prisma.$transaction([
      this.prisma.verificationRequest.update({
        where: { id: request.id },
        data: {
          status: PrismaVerificationStatus.REJECTED,
          adminNote: note.trim(),
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.proProfile.update({
        where: { id: request.profileId },
        data: { status: ProProfileStatus.REJECTED },
      }),
    ]);
    await this.mailer.sendVerificationRejectedEmail(
      request.profile.user.email,
      request.profile.user.displayName,
      note.trim(),
    );
  }

  private async pendingRequest(requestId: string) {
    const request = await this.prisma.verificationRequest.findUnique({
      where: { id: requestId },
      include: { profile: { include: { user: true } } },
    });
    if (!request) {
      throw new NotFoundException();
    }
    if (request.status !== PrismaVerificationStatus.PENDING) {
      throw new ConflictException('This request has already been reviewed.');
    }
    return request;
  }
}
