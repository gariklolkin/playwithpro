/** `GET /support/identity`: server-verified identity for the support channel. */
export interface SupportIdentityResponse {
  userId: string;
  /** HMAC-SHA256 hex of `userId`, signed with the API-only support secret. */
  hash: string;
}
