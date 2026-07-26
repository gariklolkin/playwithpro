import type { ServiceType } from "../enums/service-type";

export const REVIEW_RATING_MIN = 1;
export const REVIEW_RATING_MAX = 5;
export const REVIEW_TEXT_MAX_LENGTH = 2000;
export const REVIEWS_PAGE_SIZE = 10;

export interface CreateReviewRequest {
  /** Integer 1–5. */
  rating: number;
  /** Optional free text, ≤ 2000 chars. */
  text?: string;
}

/** A session's review as seen by its parties. */
export interface ReviewResponse {
  rating: number;
  text: string | null;
  createdAt: string;
}

/** One entry of a coach's public reviews list. */
export interface PublicReviewEntry {
  id: string;
  rating: number;
  text: string | null;
  playerDisplayName: string;
  serviceType: ServiceType;
  /** Start of the reviewed session. */
  sessionDate: string;
  createdAt: string;
}

export interface ReviewListResponse {
  items: PublicReviewEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Aggregate coach rating. Derived from integer sum/count columns;
 * avg is null (never 0) while the coach has no reviews.
 */
export interface RatingAggregate {
  /** Average with one decimal; null when ratingCount is 0. */
  ratingAvg: number | null;
  ratingCount: number;
}
