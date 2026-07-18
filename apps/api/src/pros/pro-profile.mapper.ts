import {
  ProProfileResponse,
  ProProfileStatus,
  ProServiceResponse,
  ServiceType,
  VerificationRequestResponse,
  VerificationStatus,
} from '@playwithpro/shared';
import {
  ProProfile,
  ProProfileStatus as PrismaProProfileStatus,
  ProService,
  ServiceType as PrismaServiceType,
  VerificationRequest,
} from '@prisma/client';

export type ProfileWithRelations = ProProfile & {
  services: ProService[];
  verificationRequests: VerificationRequest[];
};

export function toSharedProfileStatus(
  status: PrismaProProfileStatus,
): ProProfileStatus {
  return status.toLowerCase() as ProProfileStatus;
}

export function toPrismaServiceType(type: ServiceType): PrismaServiceType {
  return type.toUpperCase() as PrismaServiceType;
}

export function toSharedServiceType(type: PrismaServiceType): ServiceType {
  return type.toLowerCase() as ServiceType;
}

export function toServiceResponse(service: ProService): ProServiceResponse {
  return {
    type: toSharedServiceType(service.type),
    priceMinor: service.priceMinor,
    currency: service.currency,
    venueLabel: service.venueLabel,
    venueLat: service.venueLat,
    venueLng: service.venueLng,
    active: service.active,
  };
}

export function toVerificationResponse(
  request: VerificationRequest,
): VerificationRequestResponse {
  return {
    id: request.id,
    status: request.status.toLowerCase() as VerificationStatus,
    credentials: request.credentials,
    contactTelegram: request.contactTelegram,
    contactPhone: request.contactPhone,
    adminNote: request.adminNote,
    createdAt: request.createdAt.toISOString(),
    callRequestedAt: request.callRequestedAt?.toISOString() ?? null,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
  };
}

export function toProfileResponse(
  profile: ProfileWithRelations,
): ProProfileResponse {
  const [latest] = profile.verificationRequests;
  return {
    id: profile.id,
    status: toSharedProfileStatus(profile.status),
    bio: profile.bio,
    languages: profile.languages,
    services: profile.services.map(toServiceResponse),
    latestVerification: latest ? toVerificationResponse(latest) : null,
  };
}
