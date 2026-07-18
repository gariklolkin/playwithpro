import type { ProProfileStatus, VerificationStatus } from "../enums/pro-profile";
import type { ServiceType } from "../enums/service-type";

export const BIO_MAX_LENGTH = 2000;
export const ACHIEVEMENTS_MAX_LENGTH = 2000;
export const CREDENTIALS_MAX_LENGTH = 4000;
export const MAX_EVIDENCE_LINKS = 10;

export interface ProServiceResponse {
  type: ServiceType;
  /** Hourly price in integer minor units (e.g. cents). */
  priceMinor: number;
  /** ISO 4217 code. */
  currency: string;
  venueCity: string;
  venueClub: string;
  active: boolean;
}

export interface UpsertProServiceRequest {
  priceMinor: number;
  currency: string;
  /** Required for the in-person game service. */
  venueCity?: string;
  venueClub?: string;
  active?: boolean;
}

export interface UpdateProProfileRequest {
  bio?: string;
  achievements?: string;
  /** ISO 639-1 codes, subset of the platform's supported locales. */
  languages?: string[];
  country?: string;
  city?: string;
}

export interface VerificationRequestResponse {
  id: string;
  status: VerificationStatus;
  credentials: string;
  links: string[];
  adminNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ProProfileResponse {
  id: string;
  status: ProProfileStatus;
  bio: string;
  achievements: string;
  languages: string[];
  country: string;
  city: string;
  services: ProServiceResponse[];
  latestVerification: VerificationRequestResponse | null;
}

export interface SubmitVerificationRequest {
  credentials: string;
  links?: string[];
}

export interface RejectVerificationRequest {
  note: string;
}

/** Admin queue item: pending request with profile and user summary. */
export interface AdminVerificationItem {
  requestId: string;
  submittedAt: string;
  credentials: string;
  links: string[];
  profile: ProProfileResponse;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}
