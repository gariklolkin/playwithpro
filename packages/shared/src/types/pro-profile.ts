import type {
  ProProfileStatus,
  VerificationStatus,
} from "../enums/pro-profile";
import type { ServiceType } from "../enums/service-type";

export const BIO_MAX_LENGTH = 4000;
export const CREDENTIALS_MAX_LENGTH = 4000;
export const CONTACT_MAX_LENGTH = 200;

export interface ProServiceResponse {
  type: ServiceType;
  /** Hourly price in integer minor units (e.g. cents). */
  priceMinor: number;
  /** ISO 4217 code. */
  currency: string;
  /** GAME only: club/address as picked on the map. */
  venueLabel: string;
  venueLat: number | null;
  venueLng: number | null;
  active: boolean;
}

export interface UpsertProServiceRequest {
  priceMinor: number;
  currency: string;
  /** Required for the in-person game service. */
  venueLabel?: string;
  venueLat?: number;
  venueLng?: number;
  active?: boolean;
}

export interface UpdateProProfileRequest {
  /** Single free-form "about" block; optional. */
  bio?: string;
  /** ISO 639-1 codes, subset of the platform's supported locales. */
  languages?: string[];
}

export interface VerificationRequestResponse {
  id: string;
  status: VerificationStatus;
  credentials: string;
  contactTelegram: string;
  /** Doubles as WhatsApp (wa.me/<phone>). */
  contactPhone: string;
  adminNote: string;
  createdAt: string;
  callRequestedAt: string | null;
  reviewedAt: string | null;
}

export interface ProProfileResponse {
  id: string;
  status: ProProfileStatus;
  bio: string;
  languages: string[];
  services: ProServiceResponse[];
  latestVerification: VerificationRequestResponse | null;
}

export interface SubmitVerificationRequest {
  credentials: string;
  /** At least one contact is required for the identity video call. */
  contactTelegram?: string;
  /** Doubles as WhatsApp (wa.me/<phone>). */
  contactPhone?: string;
}

export interface RejectVerificationRequest {
  note: string;
}

/** Admin queue item: pending request with profile and user summary. */
export interface AdminVerificationItem {
  requestId: string;
  submittedAt: string;
  credentials: string;
  contactTelegram: string;
  contactPhone: string;
  callRequestedAt: string | null;
  profile: ProProfileResponse;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}
