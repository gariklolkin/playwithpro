export enum Role {
  Amateur = "amateur",
  Professional = "professional",
  Admin = "admin",
}

/** Roles a visitor may pick for themselves at signup (admin is seeded only). */
export const SIGNUP_ROLES = [Role.Amateur, Role.Professional] as const;

export type SignupRole = (typeof SIGNUP_ROLES)[number];
