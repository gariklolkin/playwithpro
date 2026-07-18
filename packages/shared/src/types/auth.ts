import type { Role, SignupRole } from "../enums/role";

export const PASSWORD_MIN_LENGTH = 8;

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  role: SignupRole;
  /** IANA zone reported by the browser; server falls back to UTC. */
  timezone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

/** Completes signup for first-time Google users (role choice). */
export interface OAuthCompleteRequest {
  role: SignupRole;
  /** IANA zone reported by the browser; server falls back to UTC. */
  timezone?: string;
}

export interface UpdateMeRequest {
  displayName?: string;
  locale?: string;
  timezone?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface MeResponse {
  id: string;
  email: string;
  role: Role;
  displayName: string;
  locale: string;
  timezone: string;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
}

/** Returned by register/login/refresh alongside the httpOnly auth cookies. */
export interface AuthResponse {
  user: MeResponse;
}
