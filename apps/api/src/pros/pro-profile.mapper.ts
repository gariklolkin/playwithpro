import {
  BookingStatus as SharedBookingStatus,
  ProProfileResponse,
  ProProfileStatus,
  ProServiceResponse,
  RESCHEDULE_CUTOFF_HOURS,
  ServiceType,
  VerificationRequestResponse,
  VerificationState as SharedVerificationState,
} from '@playwithpro/shared';
import {
  BookingStatus,
  ProProfile,
  ProProfileStatus as PrismaProProfileStatus,
  ProService,
  ServiceType as PrismaServiceType,
  VerificationBooking,
  VerificationRequest,
  VerificationSlot,
  VerificationState,
} from '@prisma/client';

export type RequestWithBookings = VerificationRequest & {
  bookings: Array<VerificationBooking & { slot: VerificationSlot }>;
};

export type ProfileWithRelations = ProProfile & {
  services: ProService[];
  verificationRequests: RequestWithBookings[];
};

/** Latest verification request first (with its bookings); the one shown to the coach. */
export const PROFILE_INCLUDE = {
  services: { orderBy: { type: 'asc' } },
  verificationRequests: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: {
      bookings: { orderBy: { createdAt: 'desc' }, include: { slot: true } },
    },
  },
} as const;

/** Booking outcomes that explain why the coach is back to picking a slot. */
const RETURN_OUTCOMES: BookingStatus[] = [
  BookingStatus.NO_SHOW,
  BookingStatus.CANCELLED_BY_ADMIN,
  BookingStatus.CANCELLED_BY_PRO,
];

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
  request: RequestWithBookings,
): VerificationRequestResponse {
  const active = request.bookings.find(
    (booking) => booking.status === BookingStatus.SCHEDULED,
  );
  const latest = request.bookings[0];
  const cutoff = new Date(Date.now() + RESCHEDULE_CUTOFF_HOURS * 3_600_000);
  const canManage =
    request.state === VerificationState.SCHEDULED &&
    active !== undefined &&
    active.slot.startsAt > cutoff;
  return {
    id: request.id,
    state: request.state.toLowerCase() as SharedVerificationState,
    credentials: request.credentials,
    adminNote: request.adminNote,
    noShowCount: request.noShowCount,
    lastBookingOutcome:
      request.state === VerificationState.AWAITING_SCHEDULING &&
      latest &&
      RETURN_OUTCOMES.includes(latest.status)
        ? (latest.status.toLowerCase() as SharedBookingStatus)
        : null,
    booking: active
      ? {
          id: active.id,
          startsAt: active.slot.startsAt.toISOString(),
          endsAt: active.slot.endsAt.toISOString(),
          meetUrl: active.meetUrl,
          canReschedule: canManage,
          canCancel: canManage,
        }
      : null,
    createdAt: request.createdAt.toISOString(),
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
