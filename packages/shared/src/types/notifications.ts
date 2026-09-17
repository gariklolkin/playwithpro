/** Optional email categories; transactional mail is never switchable. */
export interface NotificationPreferencesResponse {
  emailReminders: boolean;
  emailClipChanges: boolean;
  emailReviews: boolean;
}

export type UpdateNotificationPreferencesRequest =
  Partial<NotificationPreferencesResponse>;

/** One-click unsubscribe (RFC 8058): the signed token from the email link. */
export interface UnsubscribeRequest {
  token: string;
}

export interface UnsubscribeResponse {
  /** Which category was turned off. */
  category: keyof NotificationPreferencesResponse;
}
